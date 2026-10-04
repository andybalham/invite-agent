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

export interface ResolvedDateTimeChoice {
  kind: "date-time";
  localDateTime: string;
  utcInstant: string;
  timeZone: string;
  utcOffset: string;
}

export type ProposedDate = DateChoice | ResolvedDateTimeChoice;

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

export interface PublicRankingEntry {
  choiceId: string;
  yesTotal: number;
}

export interface CreateParticipantRequest {
  displayName: string;
}

export interface RenameParticipantRequest {
  displayName: string;
}

export interface SetAvailabilityRequest {
  dateId: string;
  availability: Availability;
}

export interface DeleteParticipantRequest {
  confirmation: string;
}

export interface PublicPollResponse {
  id: string;
  title: string;
  status: LifecycleState;
  version: number;
  proposedDates: PublicProposedDate[];
  participants: PublicParticipant[];
  ranking: PublicRankingEntry[];
  selectedDateId?: string;
  provisional?: true;
  description?: string;
  instructions?: string;
  location?: string;
  locationHtml?: string;
  timeZone: string;
}

export interface ClosePollRequest {
  selectedDateId: string;
  confirmed: true;
}

export interface ClosePollResult {
  poll: PublicPollResponse & { status: "closed"; selectedDateId: string };
}

export interface ReopenPollRequest {
  confirmed: true;
}

export interface ReopenPollResult {
  poll: PublicPollResponse & { status: "open"; selectedDateId: string; provisional: true };
}

export type AuditActorCategory = "organiser" | "anonymous-link-holder";
export type AuditEntityType = "poll" | "date" | "participant" | "availability";

export interface AuditHistoryEvent {
  id: string;
  revision: number;
  entity: { type: AuditEntityType; id: string };
  action: string;
  summary: string;
  before: unknown;
  after: unknown;
  occurredAt: string;
  actor: { category: AuditActorCategory; subject?: string };
  undoOf?: { id: string; revision: number };
}

export interface UndoPreview {
  eventId: string;
  revision: number;
  action: string;
  summary: string;
  restoredBefore: unknown;
  restoredAfter: unknown;
  requiresConfirmation: true;
  wouldOverwrite: boolean;
  warning?: string;
}

export interface UndoResult {
  poll: PublicPollResponse;
  event: AuditHistoryEvent;
}

export interface ConfirmUndoRequest {
  confirmed: true;
}

export interface AuditHistoryPage {
  items: AuditHistoryEvent[];
  total: number;
  nextCursor?: string;
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

export const OWNED_POLL_FILTERS = ["active", "draft", "open", "closed"] as const;
export type OwnedPollFilter = (typeof OWNED_POLL_FILTERS)[number];
export const OWNED_POLL_DEFAULT_PAGE_SIZE = 25;
export const OWNED_POLL_MAX_PAGE_SIZE = 50;
export const OWNED_POLL_SEARCH_MAX_CODE_POINTS = 200;
export const OWNED_POLL_CURSOR_MAX_LENGTH = 2048;

export interface OwnedPollListRequest {
  filter?: OwnedPollFilter;
  search?: string;
  pageSize?: number;
  cursor?: string;
}

export interface ResolvedOwnedPollListQuery {
  filter: OwnedPollFilter;
  search: string;
  pageSize: number;
  cursor?: string;
}

export interface OwnedPollSummary {
  id: string;
  title: string;
  status: LifecycleState;
  createdAt: string;
  timeZone: string;
  proposedDates: ProposedDateInput[];
  participantCount: number;
}

export interface OwnedPollListResponse {
  items: OwnedPollSummary[];
  nextCursor?: string;
}

// The HTTP handler's error envelope differs from the existing status-bearing ApiError value.
export interface OwnedPollListErrorResponse {
  error: {
    code: ApiErrorCode | "INTERNAL_ERROR";
    message: string;
    correlationId?: string;
  };
}

export function normalizeDashboardTitle(value: string): string {
  return value.normalize("NFC").replace(/[\p{White_Space}\uFEFF]+/gu, " ").trim().toLowerCase();
}

/** Resolve defaults only after validation; the transport remains responsible for URL decoding. */
export function resolveOwnedPollListQuery(input: unknown): SafeParseResult<ResolvedOwnedPollListQuery> {
  const parsed = ownedPollListRequestSchema.safeParse(input);
  if (!parsed.success) return parsed;
  return {
    success: true,
    data: {
      filter: parsed.data.filter ?? "active",
      search: normalizeDashboardTitle(parsed.data.search ?? ""),
      pageSize: parsed.data.pageSize ?? OWNED_POLL_DEFAULT_PAGE_SIZE,
      ...(parsed.data.cursor === undefined ? {} : { cursor: parsed.data.cursor })
    }
  };
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

function isPublicRankingEntry(input: unknown): input is PublicRankingEntry {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, ["choiceId", "yesTotal"]) &&
    isNonBlankString(input.choiceId) &&
    Number.isSafeInteger(input.yesTotal) &&
    Number(input.yesTotal) >= 0
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
      "ranking",
      "selectedDateId",
      "provisional",
      "description",
      "instructions",
      "location",
      "locationHtml",
      "timeZone"
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
    Array.isArray(input.ranking) &&
    input.ranking.length <= 5 &&
    input.ranking.every(isPublicRankingEntry) &&
    (input.status === "closed"
      ? isNonBlankString(input.selectedDateId) && input.provisional === undefined
      : input.status === "open" && input.provisional === true
        ? isNonBlankString(input.selectedDateId)
        : input.selectedDateId === undefined && input.provisional === undefined) &&
    (input.description === undefined || typeof input.description === "string") &&
    (input.instructions === undefined || typeof input.instructions === "string") &&
    (input.location === undefined || typeof input.location === "string") &&
    (input.locationHtml === undefined || typeof input.locationHtml === "string") &&
    isValidIanaTimeZone(input.timeZone)
  );
}

function isClosePollRequest(input: unknown): input is ClosePollRequest {
  return isRecord(input) && hasOnlyKeys(input, ["selectedDateId", "confirmed"]) &&
    isNonBlankString(input.selectedDateId) && input.confirmed === true;
}

function isClosePollResult(input: unknown): input is ClosePollResult {
  return isRecord(input) && hasOnlyKeys(input, ["poll"]) &&
    isPublicPollResponse(input.poll) && input.poll.status === "closed" &&
    isNonBlankString(input.poll.selectedDateId);
}

function isReopenPollRequest(input: unknown): input is ReopenPollRequest {
  return isRecord(input) && hasOnlyKeys(input, ["confirmed"]) && input.confirmed === true;
}

function isReopenPollResult(input: unknown): input is ReopenPollResult {
  return isRecord(input) && hasOnlyKeys(input, ["poll"]) &&
    isPublicPollResponse(input.poll) && input.poll.status === "open" &&
    input.poll.provisional === true && isNonBlankString(input.poll.selectedDateId);
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

function isAuditActor(input: unknown): input is AuditHistoryEvent["actor"] {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, ["category", "subject"]) &&
    (input.category === "organiser" || input.category === "anonymous-link-holder") &&
    (input.subject === undefined || isNonBlankString(input.subject)) &&
    (input.category === "organiser" ? isNonBlankString(input.subject) : input.subject === undefined)
  );
}

function isAuditEntity(input: unknown): input is AuditHistoryEvent["entity"] {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, ["type", "id"]) &&
    ["poll", "date", "participant", "availability"].includes(String(input.type)) &&
    isNonBlankString(input.id)
  );
}

function isAuditHistoryEvent(input: unknown): input is AuditHistoryEvent {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, ["id", "revision", "entity", "action", "summary", "before", "after", "occurredAt", "actor", "undoOf"]) &&
    isNonBlankString(input.id) &&
    Number.isSafeInteger(input.revision) && Number(input.revision) > 0 &&
    isAuditEntity(input.entity) &&
    isNonBlankString(input.action) &&
    isNonBlankString(input.summary) &&
    isNonBlankString(input.occurredAt) && !Number.isNaN(Date.parse(input.occurredAt)) &&
    isAuditActor(input.actor) &&
    (input.undoOf === undefined || (
      isRecord(input.undoOf) &&
      hasOnlyKeys(input.undoOf, ["id", "revision"]) &&
      isNonBlankString(input.undoOf.id) &&
      Number.isSafeInteger(input.undoOf.revision) && Number(input.undoOf.revision) > 0
    ))
  );
}

function isAuditHistoryPage(input: unknown): input is AuditHistoryPage {
  return (
    isRecord(input) &&
    hasOnlyKeys(input, ["items", "total", "nextCursor"]) &&
    Array.isArray(input.items) && input.items.every(isAuditHistoryEvent) &&
    Number.isSafeInteger(input.total) && Number(input.total) >= input.items.length &&
    (input.nextCursor === undefined || isNonBlankString(input.nextCursor))
  );
}

function isUndoPreview(input: unknown): input is UndoPreview {
  return isRecord(input) &&
    hasOnlyKeys(input, ["eventId", "revision", "action", "summary", "restoredBefore", "restoredAfter", "requiresConfirmation", "wouldOverwrite", "warning"]) &&
    isNonBlankString(input.eventId) &&
    Number.isSafeInteger(input.revision) && Number(input.revision) > 0 &&
    isNonBlankString(input.action) && isNonBlankString(input.summary) &&
    "restoredBefore" in input && "restoredAfter" in input &&
    input.requiresConfirmation === true && typeof input.wouldOverwrite === "boolean" &&
    (input.wouldOverwrite ? isNonBlankString(input.warning) : input.warning === undefined);
}

function isUndoResult(input: unknown): input is UndoResult {
  return isRecord(input) && hasOnlyKeys(input, ["poll", "event"]) &&
    isPublicPollResponse(input.poll) && isAuditHistoryEvent(input.event) &&
    input.event.action === "UNDO" && input.event.undoOf !== undefined;
}

function isConfirmUndoRequest(input: unknown): input is ConfirmUndoRequest {
  return isRecord(input) && hasOnlyKeys(input, ["confirmed"]) && input.confirmed === true;
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
export const closePollRequestSchema = schema<ClosePollRequest>(
  isClosePollRequest,
  "Closing requires a proposed date and explicit confirmation"
);
export const closePollResultSchema = schema<ClosePollResult>(
  isClosePollResult,
  "Invalid close-poll result"
);
export const reopenPollRequestSchema = schema<ReopenPollRequest>(
  isReopenPollRequest,
  "Reopening requires explicit confirmation"
);
export const reopenPollResultSchema = schema<ReopenPollResult>(
  isReopenPollResult,
  "Invalid reopen-poll result"
);
export const apiErrorSchema = schema<ApiError>(isApiError, "Invalid API error");
export const auditHistoryPageSchema = schema<AuditHistoryPage>(
  isAuditHistoryPage,
  "Invalid audit-history page"
);
export const undoPreviewSchema = schema<UndoPreview>(isUndoPreview, "Invalid undo preview");
export const undoResultSchema = schema<UndoResult>(isUndoResult, "Invalid undo result");
export const confirmUndoRequestSchema = schema<ConfirmUndoRequest>(
  isConfirmUndoRequest,
  "Undo must be explicitly confirmed"
);

function isOwnedPollCursor(input: unknown): input is string {
  // Shape only: verifying the signature, claims and owner/query binding belongs to the backend.
  return typeof input === "string" && input.length <= OWNED_POLL_CURSOR_MAX_LENGTH &&
    /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(input);
}

function isOwnedPollListRequest(input: unknown): input is OwnedPollListRequest {
  return isRecord(input) && hasOnlyKeys(input, ["filter", "search", "pageSize", "cursor"]) &&
    (input.filter === undefined || (OWNED_POLL_FILTERS as readonly unknown[]).includes(input.filter)) &&
    (input.search === undefined || (typeof input.search === "string" &&
      [...input.search].length <= OWNED_POLL_SEARCH_MAX_CODE_POINTS)) &&
    (input.pageSize === undefined || (Number.isSafeInteger(input.pageSize) &&
      Number(input.pageSize) >= 1 && Number(input.pageSize) <= OWNED_POLL_MAX_PAGE_SIZE)) &&
    (input.cursor === undefined || isOwnedPollCursor(input.cursor));
}

function isCanonicalCreationInstant(input: unknown): input is string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)) {
    return false;
  }
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === input;
}

function isOwnedPollSummary(input: unknown): input is OwnedPollSummary {
  return isRecord(input) &&
    hasOnlyKeys(input, ["id", "title", "status", "createdAt", "timeZone", "proposedDates", "participantCount"]) &&
    isNonBlankString(input.id) && isNonBlankString(input.title) && isLifecycleState(input.status) &&
    isCanonicalCreationInstant(input.createdAt) && isValidIanaTimeZone(input.timeZone) &&
    Array.isArray(input.proposedDates) && input.proposedDates.every(isProposedDateInput) &&
    Number.isSafeInteger(input.participantCount) && Number(input.participantCount) >= 0;
}

function isOwnedPollListResponse(input: unknown): input is OwnedPollListResponse {
  return isRecord(input) && hasOnlyKeys(input, ["items", "nextCursor"]) &&
    Array.isArray(input.items) && input.items.length <= OWNED_POLL_MAX_PAGE_SIZE &&
    input.items.every(isOwnedPollSummary) &&
    (input.nextCursor === undefined || isOwnedPollCursor(input.nextCursor));
}

function isOwnedPollListErrorResponse(input: unknown): input is OwnedPollListErrorResponse {
  if (!isRecord(input) || !hasOnlyKeys(input, ["error"]) || !isRecord(input.error)) return false;
  const error = input.error;
  return hasOnlyKeys(error, ["code", "message", "correlationId"]) &&
    typeof error.code === "string" &&
    (Object.hasOwn(API_ERROR_STATUS, error.code) || error.code === "INTERNAL_ERROR") &&
    isNonBlankString(error.message) &&
    (error.correlationId === undefined || isNonBlankString(error.correlationId));
}

export const ownedPollListRequestSchema = schema<OwnedPollListRequest>(
  isOwnedPollListRequest, "Invalid owned-poll list request"
);
export const ownedPollSummarySchema = schema<OwnedPollSummary>(
  isOwnedPollSummary, "Invalid owned-poll summary"
);
export const ownedPollListResponseSchema = schema<OwnedPollListResponse>(
  isOwnedPollListResponse, "Invalid owned-poll list response"
);
export const ownedPollListErrorResponseSchema = schema<OwnedPollListErrorResponse>(
  isOwnedPollListErrorResponse, "Invalid owned-poll list error response"
);
