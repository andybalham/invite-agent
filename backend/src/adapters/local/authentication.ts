import { ApplicationError } from "../../application/index.js";
import type { Authenticate } from "../../http/index.js";

const organiserPattern = /^local-organiser-[a-z0-9-]+$/;

export function createLocalAuthentication(appEnv: string): Authenticate {
  if (appEnv !== "local" && appEnv !== "test") {
    throw new Error("Local authentication is permitted only in local or test environments");
  }
  return (headers) => {
    const subject = headers["x-local-organiser-id"];
    if (!subject || !organiserPattern.test(subject)) {
      throw new ApplicationError("UNAUTHENTICATED", "Local organiser authentication is required");
    }
    return subject;
  };
}
