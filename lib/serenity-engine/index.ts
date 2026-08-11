import { ENGINE_VERSION } from "./core"
import { generateDailyReminders } from "./reports/reminders"
import { generateAgenda } from "./reports/agenda"
import { composeConfiguration } from "./composition"
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
}

export { composeConfiguration, ENGINE_VERSION, generateAgenda, generateDailyReminders, nextScheduleOccurrence }

export const invoke = (requestJson: string): string => {
  try {
    const request = JSON.parse(requestJson) as EngineRequest
    if (!request?.input || !["daily-reminders", "agenda", "compose", "schedule-next"].includes(request.operation)) {
      throw new Error(`Unsupported Serenity engine operation ${JSON.stringify(request?.operation)}`)
    }
    const result = request.operation === "daily-reminders"
      ? generateDailyReminders(request.input)
      : request.operation === "agenda"
        ? generateAgenda(request.input)
        : request.operation === "compose"
          ? composeConfiguration(request.input.layers)
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
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
