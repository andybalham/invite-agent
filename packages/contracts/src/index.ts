export const LIFECYCLE_STATES = ["draft", "open", "closed"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const AVAILABILITY_VALUES = ["yes", "no"] as const;
export type Availability = (typeof AVAILABILITY_VALUES)[number];

export const API_ERROR_STATUS = Object.freeze({
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LINK_REVOKED: 410,
  INVALID_LIFECYCLE: 422,
  RATE_LIMITED: 429
} as const);

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export interface DateChoice {
  kind: "date";
  localDate: string;
}

export interface DateTimeChoice {
  kind: "date-time";
  localDateTime: string;
  utcOffset?: string;
}

export type ProposedDateInput = DateChoice | DateTimeChoice;

export interface CreatePollRequest {
  title: string;
  timeZone: string;
  description?: string;
  instructions?: string;
  location?: string;
  proposedDates: ProposedDateInput[];
}

export type PublicProposedDate = ProposedDateInput & { id: string };

export interface PublicParticipant {
  id: string;
  displayName: string;
  availability: Record<string, Availability>;
}

export interface PublicPollResponse {
  id: string;
  title: string;
  status: LifecycleState;
  version: number;
  proposedDates: PublicProposedDate[];
  participants: PublicParticipant[];
  description?: string;
  instructions?: string;
  location?: string;
}

export interface ApiError {
  code: ApiErrorCode;
  status: (typeof API_ERROR_STATUS)[ApiErrorCode];
  message: string;
  correlationId?: string;
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: readonly string[] };

export interface Schema<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

function schema<T>(validator: (input: unknown) => input is T, issue: string): Schema<T> {
  return Object.freeze({
    safeParse(input: unknown): SafeParseResult<T> {
      return validator(input) ? { success: true, data: input } : { success: false, issues: [issue] };
    }
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasOnlyKeys(input: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(input).every((key) => allowed.includes(key));
}

function isNonBlankString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function isIsoDate(input: unknown): input is string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return false;
  }
  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 0) - 1 &&
    date.getUTCDate() === day
  );
}

function isIsoLocalDateTime(input: unknown): input is string {
  if (typeof input !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input);
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const datePart = `${yearText}-${monthText}-${dayText}`;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return isIsoDate(datePart) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isProposedDateInput(input: unknown): input is ProposedDateInput {
  if (!isRecord(input)) {
    return false;
  }
  if (input.kind === "date") {
    return hasOnlyKeys(input, ["kind", "localDate"]) && isIsoDate(input.localDate);
  }
  if (input.kind === "date-time") {
    return (
      hasOnlyKeys(input, ["kind", "localDateTime", "utcOffset"]) &&
      isIsoLocalDateTime(input.localDateTime) &&
      (input.utcOffset === undefined || /^[-+]\d{2}:\d{2}$/.test(String(input.utcOffset)))
    );
  }
  return false;
}

export function isValidIanaTimeZone(input: unknown): input is string {
  if (typeof input !== "string" || input.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: input }).format();
    return true;
  } catch {
    return false;
  }
}

function isPublicProposedDate(input: unknown): input is PublicProposedDate {
  if (!isRecord(input) || !isNonBlankString(input.id)) {
    return false;
  }
  const choice = { ...input };
  delete choice.id;
  return isProposedDateInput(choice);
}

function isPublicParticipant(input: unknown): input is PublicParticipant {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, ["id", "displayName", "availability"]) &&
    isNonBlankString(input.id) &&
    isNonBlankString(input.displayName) &&
    isRecord(input.availability) &&
    Object.values(input.availability).every(isAvailability)
  );
}

function isLifecycleState(input: unknown): input is LifecycleState {
  return typeof input === "string" && (LIFECYCLE_STATES as readonly string[]).includes(input);
}

function isAvailability(input: unknown): input is Availability {
  return typeof input === "string" && (AVAILABILITY_VALUES as readonly string[]).includes(input);
}

function isCreatePollRequest(input: unknown): input is CreatePollRequest {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, [
      "title",
      "timeZone",
      "description",
      "instructions",
      "location",
      "proposedDates"
    ]) &&
    isNonBlankString(input.title) &&
    isValidIanaTimeZone(input.timeZone) &&
    (input.description === undefined || typeof input.description === "string") &&
    (input.instructions === undefined || typeof input.instructions === "string") &&
    (input.location === undefined || typeof input.location === "string") &&
    Array.isArray(input.proposedDates) &&
    input.proposedDates.every(isProposedDateInput)
  );
}

function isPublicPollResponse(input: unknown): input is PublicPollResponse {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, [
      "id",
      "title",
      "status",
      "version",
      "proposedDates",
      "participants",
      "description",
      "instructions",
      "location"
    ]) &&
    isNonBlankString(input.id) &&
    isNonBlankString(input.title) &&
    isLifecycleState(input.status) &&
    Number.isSafeInteger(input.version) &&
    Number(input.version) >= 0 &&
    Array.isArray(input.proposedDates) &&
    input.proposedDates.every(isPublicProposedDate) &&
    Array.isArray(input.participants) &&
    input.participants.every(isPublicParticipant) &&
    (input.description === undefined || typeof input.description === "string") &&
    (input.instructions === undefined || typeof input.instructions === "string") &&
    (input.location === undefined || typeof input.location === "string")
  );
}

function isApiError(input: unknown): input is ApiError {
  if (
    !isRecord(input) ||
    !isNonBlankString(input.code) ||
    !isNonBlankString(input.message) ||
    !(input.code in API_ERROR_STATUS)
  ) {
    return false;
  }
  const code = input.code as ApiErrorCode;
  return (
    hasOnlyKeys(input, ["code", "status", "message", "correlationId"]) &&
    input.status === API_ERROR_STATUS[code] &&
    (input.correlationId === undefined || isNonBlankString(input.correlationId))
  );
}

export const lifecycleStateSchema = schema<LifecycleState>(
  isLifecycleState,
  "Expected one of: draft, open, closed"
);
export const availabilitySchema = schema<Availability>(isAvailability, "Expected one of: yes, no");
export const createPollRequestSchema = schema<CreatePollRequest>(
  isCreatePollRequest,
  "Invalid create-poll request"
);
export const publicPollResponseSchema = schema<PublicPollResponse>(
  isPublicPollResponse,
  "Invalid public-poll response"
);
export const apiErrorSchema = schema<ApiError>(isApiError, "Invalid API error");
