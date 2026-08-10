import { ENGINE_VERSION } from "./core"
import { generateDailyReminders } from "./reports/reminders"

type EngineRequest = {
  operation: "daily-reminders"
  input: Parameters<typeof generateDailyReminders>[0]
}

export { ENGINE_VERSION, generateDailyReminders }

export const invoke = (requestJson: string): string => {
  try {
    const request = JSON.parse(requestJson) as EngineRequest
    if (request?.operation !== "daily-reminders" || !request.input) {
      throw new Error(`Unsupported Serenity engine operation ${JSON.stringify(request?.operation)}`)
    }
    return JSON.stringify({
      ok: true,
      engineVersion: ENGINE_VERSION,
      result: generateDailyReminders(request.input),
    })
  } catch (error) {
    return JSON.stringify({
      ok: false,
      engineVersion: ENGINE_VERSION,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
