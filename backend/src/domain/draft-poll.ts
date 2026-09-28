import {
  createPollRequestSchema,
  isProposedDateInput,
  isValidIanaTimeZone,
  type ApiErrorCode,
  type CreatePollRequest,
  type LifecycleState,
  type ProposedDateInput
} from "@invite-a-gent/contracts";
import { validateLocationMarkdown, type LocationValidationCode } from "./location-markdown.js";
import {
  proposedDateKey,
  resolveProposedDate,
  type DateChoiceResolutionCode
} from "./date-choice.js";

export type DraftValidationCode =
  | "DRAFT_INVALID"
  | "TITLE_REQUIRED"
  | "TIME_ZONE_INVALID"
  | "CHOICES_INVALID"
  | "CHOICES_DUPLICATE"
  | DateChoiceResolutionCode
  | LocationValidationCode;

export type PublicationValidationCode =
  | "TITLE_REQUIRED"
  | "CHOICES_MINIMUM"
  | "CHOICES_INVALID"
  | "CHOICES_DUPLICATE"
  | LocationValidationCode;

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
  if (typeof input.location === "string") {
    const locationIssue = validateLocationMarkdown(input.location);
    if (locationIssue) {
      issues.push({ ...locationIssue, field: "location" });
    }
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
  } else if (Array.isArray(input.proposedDates) && isValidIanaTimeZone(input.timeZone)) {
    const resolved = input.proposedDates.map((choice) =>
      resolveProposedDate(choice, input.timeZone as string)
    );
    for (const [index, result] of resolved.entries()) {
      if (!result.success) {
        issues.push({
          code: result.issue.code,
          field: `proposedDates.${index}`,
          message: result.issue.message
        });
      }
    }
    const keys = resolved
      .filter((result) => result.success)
      .map((result) => proposedDateKey(result.data));
    if (new Set(keys).size !== keys.length) {
      issues.push({
        code: "CHOICES_DUPLICATE",
        field: "proposedDates",
        message: "Use distinct date choices"
      });
    }
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
  if (new Set(input.map(proposedDateKey)).size !== input.length) {
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

export function validateDraftPublication(
  input: unknown
): ValidationResult<CreatePollRequest, PublicationValidationCode> {
  if (!isRecord(input)) {
    return {
      success: false,
      input,
      issues: [{ code: "CHOICES_INVALID", field: "draft", message: "Enter valid poll details." }]
    };
  }
  const issues: ValidationIssue<PublicationValidationCode>[] = [];
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    issues.push({ code: "TITLE_REQUIRED", field: "title", message: "Add a title." });
  }
  if (!Array.isArray(input.proposedDates) || input.proposedDates.length === 0) {
    issues.push({
      code: "CHOICES_MINIMUM",
      field: "proposedDates",
      message: "Add at least two proposed dates."
    });
  } else if (input.proposedDates.length === 1) {
    issues.push({
      code: "CHOICES_MINIMUM",
      field: "proposedDates",
      message: "Add at least one more proposed date (minimum two)."
    });
  } else if (isValidIanaTimeZone(input.timeZone)) {
    const seen = new Map<string, number>();
    for (const [index, choice] of input.proposedDates.entries()) {
      const result = resolveProposedDate(choice, input.timeZone as string);
      if (!result.success) {
        issues.push({
          code: "CHOICES_INVALID",
          field: `proposedDates.${index}`,
          message: `Date ${index + 1} isn't a valid date.`
        });
        continue;
      }
      const key = proposedDateKey(result.data);
      const first = seen.get(key);
      if (first !== undefined) {
        issues.push({
          code: "CHOICES_DUPLICATE",
          field: `proposedDates.${index}`,
          message: `Date ${index + 1} is the same as date ${first + 1}.`
        });
      } else {
        seen.set(key, index);
      }
    }
  }
  if (typeof input.location === "string") {
    const locationIssue = validateLocationMarkdown(input.location);
    if (locationIssue) {
      issues.push({
        code: locationIssue.code,
        field: "location",
        message:
          locationIssue.code === "LOCATION_LINK_UNSAFE"
            ? "Location: Use secure HTTPS links only"
            : `Location: ${locationIssue.message}`
      });
    }
  }
  if (issues.length > 0) return { success: false, input, issues };
  const parsed = createPollRequestSchema.safeParse(input);
  return parsed.success
    ? parsed
    : {
        success: false,
        input,
        issues: [{ code: "CHOICES_INVALID", field: "draft", message: "Enter valid poll details." }]
      };
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
