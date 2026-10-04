import type { OwnedPollSummary } from "@invite-a-gent/contracts";

export type MyPollsFilter = "active" | "draft" | "open" | "closed";
export interface MyPollsContext { filter: MyPollsFilter; search: string }

export function myPollsContext(params: URLSearchParams): MyPollsContext {
  const filter = params.get("filter");
  return {
    filter: filter === "draft" || filter === "open" || filter === "closed" ? filter : "active",
    search: params.get("search") ?? ""
  };
}

export function myPollsDestination(testRunId: string, context?: MyPollsContext): string {
  const params = new URLSearchParams({ testRunId });
  if (context && context.filter !== "active") params.set("filter", context.filter);
  if (context?.search) params.set("search", context.search);
  return `/?${params}`;
}

export function createPollDestination(testRunId: string): string {
  return `/?${new URLSearchParams({ view: "create", testRunId })}`;
}

export function ownedPollDestination(
  poll: Pick<OwnedPollSummary, "id" | "status">, testRunId: string, context: MyPollsContext
): string {
  return organiserPollDestination(poll.id, poll.status === "draft" ? "editor" : "manage", testRunId, context);
}

export function organiserPollDestination(
  id: string, view: "editor" | "manage" | "history", testRunId: string, context: MyPollsContext
): string {
  const params = new URLSearchParams({
    pollId: id, view, testRunId,
    returnFilter: context.filter, returnSearch: context.search
  });
  return `/?${params}`;
}

export function pollReturnContext(params: URLSearchParams): MyPollsContext {
  return myPollsContext(new URLSearchParams({
    filter: params.get("returnFilter") ?? "active", search: params.get("returnSearch") ?? ""
  }));
}
