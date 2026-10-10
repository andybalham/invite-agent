import { API_ERROR_STATUS, OWNED_POLL_SHARE_ERROR_STATUS, type ApiErrorCode } from "@invite-a-gent/contracts";

export const OWNED_POLL_SHARE_ERROR_MESSAGES = Object.freeze({
  VALIDATION_ERROR: "Share requests do not accept a body or query parameters",
  UNAUTHENTICATED: "Verified organiser authentication is required",
  FORBIDDEN: "The organiser does not own this poll",
  NOT_FOUND: "Poll not found",
  LINK_RECOVERY_REQUIRED: "The original link cannot be recovered; confirm replacement to create a new link",
  LINK_REVOKED: "This poll link is no longer valid",
  INVALID_LIFECYCLE: "Publish the poll before retrieving its link",
  INTERNAL_ERROR: "The poll link could not be retrieved"
});

export class OwnedPollShareError extends Error {
  public readonly status: number;

  public constructor(public readonly code: keyof typeof OWNED_POLL_SHARE_ERROR_STATUS) {
    super(OWNED_POLL_SHARE_ERROR_MESSAGES[code]);
    this.name = "OwnedPollShareError";
    this.status = OWNED_POLL_SHARE_ERROR_STATUS[code];
  }
}

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
