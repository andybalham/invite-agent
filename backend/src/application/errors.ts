import { API_ERROR_STATUS, type ApiErrorCode } from "@invite-a-gent/contracts";

export class ApplicationError extends Error {
  public readonly status: (typeof API_ERROR_STATUS)[ApiErrorCode];

  public constructor(
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApplicationError";
    this.status = API_ERROR_STATUS[code];
  }
}
