#!/usr/bin/env python3
"""
Extract embedded data from the CPT Hedge / Last War server webpack bundle.

Outputs:
    servers.json
    event_schedule.json
    other_data.json

Existing outputs are archived before replacement. Default runs archive under
tmp/extract-cpt-data-backups. With --out-dir, archives go under its archive/ folder.

Usage:
    Edit the configuration below, then run:
    python extract_cpt_data.py

Optional:
    python extract_cpt_data.py cpt_servers.js --out-dir extracted
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import shutil
import tempfile
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# Configuration
# These defaults are anchored to the repository, regardless of where the
# script is launched from. They may also be replaced with absolute paths.
REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = REPOSITORY_ROOT / "public" / "conf" / "cpt_servers.js"
SERVERS_OUTPUT_FILE = REPOSITORY_ROOT / "public" / "conf" / "servers.json"
EVENT_SCHEDULE_OUTPUT_FILE = REPOSITORY_ROOT / "public" / "conf" / "event_schedule.json"
OTHER_DATA_OUTPUT_FILE = REPOSITORY_ROOT / "public" / "conf" / "other_data.json"
BACKUP_DIR = REPOSITORY_ROOT / "tmp" / "extract-cpt-data-backups"


def read_js(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def scan_quoted_literal(text: str, start: int) -> tuple[str, int]:
    """
    Read a JS single- or double-quoted string literal beginning at `start`.
    Returns (literal_text_including_quotes, index_after_literal).
    """
    if start >= len(text) or text[start] not in ("'", '"'):
        raise ValueError(f"Expected quoted string at offset {start}")

    quote = text[start]
    i = start + 1
    escaped = False

    while i < len(text):
        ch = text[i]

        if escaped:
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == quote:
            return text[start : i + 1], i + 1

        i += 1

    raise ValueError("Unterminated quoted string literal")


def decode_js_string_literal(literal: str) -> str:
    """
    The bundle's JSON.parse payloads are ordinary quoted JS strings.
    Python's ast.literal_eval handles the escape sequences used here.
    """
    try:
        return ast.literal_eval(literal)
    except Exception as exc:
        raise ValueError(f"Could not decode JS string literal: {exc}") from exc


def extract_json_parse_objects(text: str) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    needle = "JSON.parse("
    pos = 0

    while True:
        pos = text.find(needle, pos)
        if pos == -1:
            break

        i = pos + len(needle)
        while i < len(text) and text[i].isspace():
            i += 1

        literal, end = scan_quoted_literal(text, i)
        decoded = decode_js_string_literal(literal)
        objects.append(json.loads(decoded))
        pos = end

    return objects


def classify_embedded_json(objects: list[dict[str, Any]]) -> tuple[dict, dict, list[dict]]:
    """
    Identify the two known payloads without depending on module IDs:
      - servers: object containing a list whose records have id/server/timestamp
      - event schedule: object containing a list whose records have day/events
    """
    servers_obj = None
    schedule_obj = None
    unknown = []

    for obj in objects:
        matched = False

        for key, value in obj.items():
            if not isinstance(value, list) or not value:
                continue

            first = value[0]
            if not isinstance(first, dict):
                continue

            if {"id", "server", "timestamp"}.issubset(first):
                servers_obj = obj
                matched = True
                break

            if {"day", "events"}.issubset(first):
                schedule_obj = obj
                matched = True
                break

        if not matched:
            unknown.append(obj)

    if servers_obj is None:
        raise ValueError("Could not identify the embedded server JSON dataset")

    if schedule_obj is None:
        raise ValueError("Could not identify the embedded event schedule JSON dataset")

    return servers_obj, schedule_obj, unknown


def find_module_body(text: str, module_id: str) -> str:
    marker = f"{module_id}:function"
    start = text.find(marker)
    if start == -1:
        raise ValueError(f"Module {module_id} not found")

    brace = text.find("{", start)
    if brace == -1:
        raise ValueError(f"Opening brace for module {module_id} not found")

    end = find_matching_delimiter(text, brace)
    return text[brace + 1 : end]


def find_matching_delimiter(text: str, start: int) -> int:
    """
    Match {}, [], or () while ignoring delimiters inside quoted strings.
    """
    pairs = {"{": "}", "[": "]", "(": ")"}
    opener = text[start]
    if opener not in pairs:
        raise ValueError(f"Unsupported opener {opener!r} at {start}")

    closer = pairs[opener]
    depth = 0
    quote = None
    escaped = False
    i = start

    while i < len(text):
        ch = text[i]

        if quote is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue

        if ch in ("'", '"', "`"):
            quote = ch
            i += 1
            continue

        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return i

        i += 1

    raise ValueError(f"Unmatched {opener!r} at offset {start}")


def extract_assignment_literal(module_text: str, variable: str, occurrence: int = 1) -> str:
    """
    Extract the array/object literal assigned to a variable such as:
        let n={...}
        ,i={...}
        u=[...]
    """
    pattern = re.compile(rf"(?<![\w$]){re.escape(variable)}\s*=\s*([\[\{{])")
    matches = list(pattern.finditer(module_text))

    if len(matches) < occurrence:
        raise ValueError(f"Assignment for variable {variable!r} occurrence {occurrence} not found")

    match = matches[occurrence - 1]
    start = match.start(1)
    end = find_matching_delimiter(module_text, start)
    return module_text[start : end + 1]


def normalize_static_js_literal(src: str) -> Any:
    """
    Convert the static object/array literals used by this bundle into JSON.

    Handles:
      - unquoted JS object keys
      - numeric object keys
      - !0 / !1 boolean minification
      - null / strings / numbers / arrays / objects

    This intentionally does NOT evaluate arbitrary JavaScript.
    """
    s = src

    # Minified booleans.
    s = s.replace("!0", "true").replace("!1", "false")

    # Quote unquoted object keys after { or ,.
    key_pattern = re.compile(r'([\{,])([A-Za-z_$][A-Za-z0-9_$]*|\d+)\s*:')
    previous = None
    while previous != s:
        previous = s
        s = key_pattern.sub(r'\1"\2":', s)

    return json.loads(s)


def extract_arrow_function(module_text: str, variable: str, occurrence: int = 1) -> str:
    """
    Extract a minified arrow function assigned to `variable`.

    Supports the forms used in this bundle:
        n=e=>{...}
        m=e=>(...)
        i=()=>{...}
    """
    pattern = re.compile(rf"(?<![\w$]){re.escape(variable)}\s*=")
    matches = list(pattern.finditer(module_text))
    if len(matches) < occurrence:
        raise ValueError(f"Function assignment {variable!r} occurrence {occurrence} not found")

    start = matches[occurrence - 1].end()
    arrow = module_text.find("=>", start)
    if arrow == -1:
        raise ValueError(f"No arrow found for {variable!r}")

    # Include parameter expression.
    src_start = start
    body_start = arrow + 2

    if module_text[body_start] == "{":
        body_end = find_matching_delimiter(module_text, body_start)
        return module_text[src_start : body_end + 1]

    if module_text[body_start] == "(":
        body_end = find_matching_delimiter(module_text, body_start)
        return module_text[src_start : body_end + 1]

    # Expression-bodied arrow without wrapping parentheses.
    # Scan to comma or semicolon at top level.
    i = body_start
    quote = None
    escaped = False
    round_depth = square_depth = curly_depth = 0

    while i < len(module_text):
        ch = module_text[i]

        if quote is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue

        if ch in ("'", '"', "`"):
            quote = ch
        elif ch == "(":
            round_depth += 1
        elif ch == ")":
            round_depth -= 1
        elif ch == "[":
            square_depth += 1
        elif ch == "]":
            square_depth -= 1
        elif ch == "{":
            curly_depth += 1
        elif ch == "}":
            curly_depth -= 1
        elif ch in ",;" and round_depth == square_depth == curly_depth == 0:
            return module_text[src_start:i]

        i += 1

    return module_text[src_start:]


def extract_named_function(module_text: str, name: str, occurrence: int = 1) -> str:
    pattern = re.compile(rf"function\s+{re.escape(name)}\s*\(")
    matches = list(pattern.finditer(module_text))
    if len(matches) < occurrence:
        raise ValueError(f"Named function {name!r} occurrence {occurrence} not found")

    start = matches[occurrence - 1].start()
    brace = module_text.find("{", matches[occurrence - 1].end())
    end = find_matching_delimiter(module_text, brace)
    return module_text[start : end + 1]


def safe_extract(fn, *args):
    try:
        return fn(*args)
    except Exception as exc:
        return {"_extraction_error": str(exc)}


def build_other_data(text: str, unknown_json: list[dict]) -> dict[str, Any]:
    """
    Extract the useful static data and calculation logic from the two
    non-data modules in this particular bundle.

    Module 35026: server timing / season status logic
    Module 44216: Hot Deals / hero / season-week event logic
    """
    server_logic = find_module_body(text, "35026")
    hot_deals = find_module_body(text, "44216")

    # Static literals in module 35026.
    season_special_weeks_src = safe_extract(extract_assignment_literal, server_logic, "u")
    if isinstance(season_special_weeks_src, str):
        season_special_weeks = safe_extract(normalize_static_js_literal, season_special_weeks_src)
    else:
        season_special_weeks = season_special_weeks_src

    # Static literals in module 44216.
    static_specs = {
        "hero_translation_keys": ("a", 1),
        "hot_deal_event_metadata": ("n", 1),
        "in_season_weekly_rotation": ("i", 1),
        "off_season_four_week_rotation": ("o", 1),
        "exclusive_weapon_schedule": ("m", 1),
    }

    static_tables = {}
    for label, (var, occurrence) in static_specs.items():
        src = safe_extract(extract_assignment_literal, hot_deals, var, occurrence)
        static_tables[label] = (
            safe_extract(normalize_static_js_literal, src)
            if isinstance(src, str)
            else src
        )

    # Preserve the important calculation logic as source, with readable labels.
    server_functions = {
        "server_age_days_utc_minus_2": ("arrow", "n", 1),
        "game_day_of_week_utc_minus_2": ("arrow", "i", 1),
        "active_event_theme": ("arrow", "o", 1),
        "is_shiny_today": ("arrow", "m", 1),
        "is_special_season_week": ("arrow", "S", 1),
        "has_season_preview": ("arrow", "p", 1),
        "season_preview_week": ("arrow", "d", 1),
        "season_age_days_utc_minus_2": ("arrow", "c", 1),
        "shiny_label": ("arrow", "k", 1),
        "infer_season_from_server_age": ("arrow", "g", 1),
        "alternating_events_current_week": ("arrow", "A", 1),
        "alternating_events_next_week": ("arrow", "v", 1),
        "format_server_start_date_utc_minus_2": ("arrow", "P", 1),
        "season_week_number": ("arrow", "W", 1),
        "server_status_text": ("arrow", "T", 1),
        "season_bucket": ("arrow", "h", 1),
        "group_servers_by_season_week": ("arrow", "l", 1),
    }

    server_logic_sources = {}
    for label, (_, var, occurrence) in server_functions.items():
        server_logic_sources[label] = safe_extract(
            extract_arrow_function, server_logic, var, occurrence
        )

    hot_deal_functions = {
        "hot_deal_display_name": ("named", "r", 1),
        "exclusive_weapon_for_season_week": ("named", "u", 1),
        "start_of_monday_utc": ("named", "S", 1),
        "season_week_info": ("named", "p", 1),
        "season_week_relative_to_date": ("named", "d", 1),
        "events_for_week": ("named", "c", 1),
        "effective_season_context": ("named", "k", 1),
        "events_for_date": ("named", "g", 1),
        "hot_deal_calendar_entries": ("named", "A", 1),
        "season_display_state": ("named", "v", 1),
    }

    hot_deal_logic_sources = {}
    for label, (_, name, occurrence) in hot_deal_functions.items():
        hot_deal_logic_sources[label] = safe_extract(
            extract_named_function, hot_deals, name, occurrence
        )

    return {
        "_meta": {
            "source_file_type": "Next.js / webpack JavaScript bundle",
            "notes": [
                "Static data is normalized without executing arbitrary JavaScript.",
                "Calculation functions are preserved as minified source so no behavior is lost.",
                "7200000 ms = 2 hours, used by the bundle for the UTC-2 game-day boundary.",
                "86400000 ms = 1 day.",
                "604800000 ms = 1 week.",
            ],
        },
        "season_transition_special_weeks": season_special_weeks,
        **static_tables,
        "derived_rules": {
            "game_day_timezone_offset_hours": -2,
            "shiny_cycle_days": 3,
            "shiny_phase_mapping": {
                "0": "Today",
                "1": "In 2 days",
                "2": "Tomorrow",
            },
            "in_season_length_weeks": 8,
            "server_age_season_threshold_days": {
                "season_0_through": 120,
                "season_1_through": 176,
                "season_2_through": 260,
                "season_3_through": 351,
                "season_4_after": 351,
            },
            "alternating_weekly_events": {
                "even_week": [
                    "Zombie Invasion (Wed-Fri)",
                    "Rampage Bosses (Sun)",
                ],
                "odd_week": [
                    "General's Trial (Wed-Fri)",
                    "Doomsday (Sun)",
                ],
            },
        },
        "server_and_season_logic_source": server_logic_sources,
        "hot_deals_logic_source": hot_deal_logic_sources,
        "unclassified_embedded_json": unknown_json,
    }


def write_json(path: Path, obj: Any) -> None:
    with tempfile.TemporaryDirectory(dir=path.parent) as folder:
        staged = Path(folder) / path.name
        staged.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        staged.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Extract embedded datasets and static game data from cpt_servers.js. "
            "Arguments override the configuration at the top of this file."
        )
    )
    parser.add_argument(
        "input",
        nargs="?",
        type=Path,
        default=INPUT_FILE,
        help=f"Input bundle (default: {INPUT_FILE})",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        help="Override the configured output directories",
    )
    args = parser.parse_args()

    text = read_js(args.input)

    embedded = extract_json_parse_objects(text)
    servers_obj, schedule_obj, unknown_json = classify_embedded_json(embedded)

    # Unwrap the single-letter webpack export keys for cleaner standalone files.
    servers = next(
        value
        for value in servers_obj.values()
        if isinstance(value, list)
        and value
        and isinstance(value[0], dict)
        and {"id", "server", "timestamp"}.issubset(value[0])
    )

    event_schedule = next(
        value
        for value in schedule_obj.values()
        if isinstance(value, list)
        and value
        and isinstance(value[0], dict)
        and {"day", "events"}.issubset(value[0])
    )

    other_data = build_other_data(text, unknown_json)

    if args.out_dir is None:
        servers_path = SERVERS_OUTPUT_FILE
        schedule_path = EVENT_SCHEDULE_OUTPUT_FILE
        other_path = OTHER_DATA_OUTPUT_FILE
    else:
        servers_path = args.out_dir / SERVERS_OUTPUT_FILE.name
        schedule_path = args.out_dir / EVENT_SCHEDULE_OUTPUT_FILE.name
        other_path = args.out_dir / OTHER_DATA_OUTPUT_FILE.name

    outputs = (
        (servers_path.resolve(), servers),
        (schedule_path.resolve(), event_schedule),
        (other_path.resolve(), other_data),
    )
    archive_root = BACKUP_DIR if args.out_dir is None else args.out_dir.resolve() / "archive"
    with ExitStack() as locks:
        for parent in sorted({path.parent for path, _ in outputs}):
            parent.mkdir(parents=True, exist_ok=True)
            lock = parent / ".extract_cpt_data.lock"
            try:
                with lock.open("x"):
                    locks.callback(lock.unlink)
            except FileExistsError:
                parser.exit(1, f"Extraction locked by {lock}.\n")

        existing = [path for path, _ in outputs if path.exists()]
        if existing:
            archive_root.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            archive = Path(tempfile.mkdtemp(prefix=f"{stamp}-", dir=archive_root))
            for path in existing:
                shutil.copy2(path, archive / path.name)
            print(f"Archived previous outputs -> {archive}", flush=True)

        for path, data in outputs:
            write_json(path, data)

    print(f"Extracted {len(servers):,} servers -> {servers_path}")
    print(f"Extracted {len(event_schedule)} schedule days -> {schedule_path}")
    print(f"Extracted static tables and logic -> {other_path}")


if __name__ == "__main__":
    main()
