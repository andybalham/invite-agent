export { createDynamoClient } from "./dynamodb-client.js";
export { DynamoPollRepository } from "./dynamodb-poll-repository.js";
export { initializeTables } from "./initialize-tables.js";
export type {
  AuditEvent,
  ParticipantRecord,
  PollRecord,
  PublicTokenRecord,
  RepositoryHealth
} from "./types.js";
