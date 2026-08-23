export type SerenityEngineErrorCode =
  | "INVALID_DATE"
  | "INVALID_DATE_RANGE"
  | "INVALID_EVENT_OPERATIONS"
  | "INVALID_LAYERS"
  | "LIMIT_EXCEEDED"
  | "INVALID_REQUEST"

export class SerenityEngineError extends Error {
  constructor(public readonly code: SerenityEngineErrorCode, message: string) {
    super(message)
    this.name = "SerenityEngineError"
  }
}

export const engineError = (code: SerenityEngineErrorCode, message: string): never => {
  throw new SerenityEngineError(code, message)
}
