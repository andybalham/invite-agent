import {
  createPollRequestSchema,
  isProposedDateInput,
  isValidIanaTimeZone,
  type ApiErrorCode,
  type CreatePollRequest,
  type LifecycleState,
  type ProposedDateInput
} from "@invite-a-gent/contracts";

export type DraftValidationCode =
  | "DRAFT_INVALID"
  | "TITLE_REQUIRED"
  | "TIME_ZONE_INVALID"
  | "CHOICES_INVALID";

export type PublicationValidationCode =
  | "CHOICES_MINIMUM"
  | "CHOICES_INVALID"
  | "CHOICES_DUPLICATE";

export interface ValidationIssue<Code extends string> {
  readonly code: Code;
  readonly field: string;
  readonly message: string;
}

export type ValidationResult<T, Code extends string> =
  | { readonly success: true; readonly data: T }
  | {
      readonly success: false;
      readonly input: unknown;
      readonly issues: readonly ValidationIssue<Code>[];
    };

export type LifecycleTransitionResult =
  | { readonly success: true; readonly data: LifecycleState }
  | {
      readonly success: false;
      readonly input: { readonly current: LifecycleState; readonly target: LifecycleState };
      readonly error: { readonly code: ApiErrorCode; readonly message: string };
    };

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function validateDraftPoll(
  input: unknown
): ValidationResult<CreatePollRequest, DraftValidationCode> {
  if (!isRecord(input)) {
    return {
      success: false,
      input,
      issues: [{ code: "DRAFT_INVALID", field: "draft", message: "Enter valid poll details" }]
    };
  }

  const issues: ValidationIssue<DraftValidationCode>[] = [];
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    issues.push({ code: "TITLE_REQUIRED", field: "title", message: "Enter a poll title" });
  }
  if (!isValidIanaTimeZone(input.timeZone)) {
    issues.push({
      code: "TIME_ZONE_INVALID",
      field: "timeZone",
      message: "Select a valid time zone"
    });
  }
  if (
    Array.isArray(input.proposedDates) &&
    input.proposedDates.some((choice) => !isProposedDateInput(choice))
  ) {
    issues.push({
      code: "CHOICES_INVALID",
      field: "proposedDates",
      message: "Correct the invalid date choices"
    });
  }

  if (issues.length > 0) {
    return { success: false, input, issues };
  }

  const parsed = createPollRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      input,
      issues: [{ code: "DRAFT_INVALID", field: "draft", message: "Enter valid poll details" }]
    };
  }
  return parsed;
}

function choiceKey(choice: ProposedDateInput): string {
  return choice.kind === "date"
    ? `date:${choice.localDate}`
    : `date-time:${choice.localDateTime}:${choice.utcOffset ?? ""}`;
}

export function validatePublicationReadiness(
  input: unknown
): ValidationResult<ProposedDateInput[], PublicationValidationCode> {
  if (!Array.isArray(input) || input.some((choice) => !isProposedDateInput(choice))) {
    return {
      success: false,
      input,
      issues: [
        {
          code: "CHOICES_INVALID",
          field: "proposedDates",
          message: "Correct the invalid date choices before publishing"
        }
      ]
    };
  }
  if (input.length < 2) {
    return {
      success: false,
      input,
      issues: [
        {
          code: "CHOICES_MINIMUM",
          field: "proposedDates",
          message: "Add at least two date choices before publishing"
        }
      ]
    };
  }
  if (new Set(input.map(choiceKey)).size !== input.length) {
    return {
      success: false,
      input,
      issues: [
        {
          code: "CHOICES_DUPLICATE",
          field: "proposedDates",
          message: "Use distinct date choices before publishing"
        }
      ]
    };
  }
  return { success: true, data: input };
}

const ALLOWED_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  draft: ["open"],
  open: ["closed"],
  closed: ["open"]
};

export function transitionLifecycle(
  current: LifecycleState,
  target: LifecycleState
): LifecycleTransitionResult {
  if (ALLOWED_TRANSITIONS[current].includes(target)) {
    return { success: true, data: target };
  }
  return {
    success: false,
    input: { current, target },
    error: {
      code: "INVALID_LIFECYCLE",
      message: `Cannot move a poll from ${current} to ${target}`
    }
  };
}
