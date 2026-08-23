import { ENGINE_VERSION } from "./core"
import { generateDailyReminders, generateDailyRemindersFromLayers } from "./reports/reminders"
import { generateAgenda, generateAgendaFromLayers } from "./reports/agenda"
import { composeConfiguration, composeEventsForDate } from "./composition"
import { normalizeEventOperations, validateNormalizedEventOperations } from "./event-operations"
import { SerenityEngineError } from "./errors"
import { nextScheduleOccurrence } from "./schedule"

type EngineRequest = {
  operation: "daily-reminders"
  input: Parameters<typeof generateDailyReminders>[0]
} | {
  operation: "agenda"
  input: Parameters<typeof generateAgenda>[0]
} | {
  operation: "compose"
  input: { layers: Parameters<typeof composeConfiguration>[0] }
} | {
  operation: "schedule-next"
  input: {
    schedule: Parameters<typeof nextScheduleOccurrence>[0]
    nowMs: number
    includeActiveWindow?: boolean
  }
} | {
  operation: "compose-events-for-date"
  input: Parameters<typeof composeEventsForDate>[0]
} | {
  operation: "agenda-from-layers"
  input: Parameters<typeof generateAgendaFromLayers>[0]
} | {
  operation: "daily-reminders-from-layers"
  input: Parameters<typeof generateDailyRemindersFromLayers>[0]
} | {
  operation: "normalize-event-operations"
  input: { document: unknown }
}

export {
  composeConfiguration,
  composeEventsForDate,
  ENGINE_VERSION,
  generateAgenda,
  generateAgendaFromLayers,
  generateDailyReminders,
  generateDailyRemindersFromLayers,
  nextScheduleOccurrence,
  normalizeEventOperations,
  validateNormalizedEventOperations,
}
export type { ConfigurationLayer, DateComposition } from "./composition"
export type { EventOperation, EventOperationsDocument, NormalizedEventOperations } from "./event-operations"
export { SerenityEngineError } from "./errors"
export type { SerenityEngineErrorCode } from "./errors"

export const invoke = (requestJson: string): string => {
  try {
    const request = JSON.parse(requestJson) as EngineRequest
    if (!request?.input || ![
      "daily-reminders",
      "agenda",
      "compose",
      "schedule-next",
      "compose-events-for-date",
      "agenda-from-layers",
      "daily-reminders-from-layers",
      "normalize-event-operations",
    ].includes(request.operation)) {
      throw new Error(`Unsupported Serenity engine operation ${JSON.stringify(request?.operation)}`)
    }
    const result = request.operation === "daily-reminders"
      ? generateDailyReminders(request.input)
      : request.operation === "agenda"
        ? generateAgenda(request.input)
        : request.operation === "compose"
          ? composeConfiguration(request.input.layers)
          : request.operation === "compose-events-for-date"
            ? composeEventsForDate(request.input)
            : request.operation === "agenda-from-layers"
              ? generateAgendaFromLayers(request.input)
              : request.operation === "daily-reminders-from-layers"
                ? generateDailyRemindersFromLayers(request.input)
                : request.operation === "normalize-event-operations"
                  ? normalizeEventOperations(request.input.document)
                  : nextScheduleOccurrence(
                      request.input.schedule,
                      request.input.nowMs,
                      request.input.includeActiveWindow,
                    )
    return JSON.stringify({
      ok: true,
      engineVersion: ENGINE_VERSION,
      result,
    })
  } catch (error) {
    return JSON.stringify({
      ok: false,
      engineVersion: ENGINE_VERSION,
      errorCode: error instanceof SerenityEngineError ? error.code : "INVALID_REQUEST",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
