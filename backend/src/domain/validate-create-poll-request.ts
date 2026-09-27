import {
  createPollRequestSchema,
  type CreatePollRequest,
  type SafeParseResult
} from "@invite-a-gent/contracts";

export function validateCreatePollRequest(input: unknown): SafeParseResult<CreatePollRequest> {
  return createPollRequestSchema.safeParse(input);
}
