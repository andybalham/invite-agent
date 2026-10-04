import { ApplicationError } from "../application/errors.js";

/** Preserve duplicates until validation; object conversion alone silently drops them. */
export function parseOwnedPollQuery(rawQuery: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(rawQuery)) {
    if (!["filter", "search", "pageSize", "cursor"].includes(key) || Object.hasOwn(result, key)) {
      throw new ApplicationError("VALIDATION_ERROR", "Unknown or duplicate poll list parameter");
    }
    if (key === "pageSize" && !/^[1-9][0-9]*$/.test(value)) {
      throw new ApplicationError("VALIDATION_ERROR", "Invalid poll list page size");
    }
    result[key] = key === "pageSize" ? Number(value) : value;
  }
  return result;
}
