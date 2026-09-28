import type { CreatePollRequest, SafeParseResult } from "@invite-a-gent/contracts";
import { validateDraftPoll } from "./draft-poll.js";

export function validateCreatePollRequest(input: unknown): SafeParseResult<CreatePollRequest> {
  const result = validateDraftPoll(input);
  return result.success
    ? result
    : { success: false, issues: result.issues.map((issue) => issue.message) };
}
