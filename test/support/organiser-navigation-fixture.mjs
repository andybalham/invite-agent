// T-108: controlled transport fixtures, independent of the list API and DynamoDB.
export const navigationOrigin = "http://invite-a-gent.test";
export const navigationOwners = Object.freeze({
  olivia: "local-organiser-olivia",
  sam: "local-organiser-sam"
});

const proposedDates = [
  { id: "date-1", kind: "date", localDate: "2026-10-12" },
  { id: "date-2", kind: "date", localDate: "2026-10-13" }
];

export function createNavigationFixture({ owner = navigationOwners.olivia } = {}) {
  const records = new Map();
  for (const [id, title, status, organiserId] of [
    ["draft-1", "Olivia draft dinner", "draft", owner],
    ["open-1", "Olivia open dinner", "open", owner],
    ["closed-1", "Olivia closed dinner", "closed", owner],
    ["sam-1", "Sam private planning", "draft", navigationOwners.sam]
  ]) {
    records.set(id, {
      id, title, status, organiserId, version: 1,
      createdAt: "2026-10-04T08:00:00.000Z", timeZone: "Europe/London",
      proposedDates: structuredClone(proposedDates), participants: [],
      ranking: proposedDates.map(({ id: choiceId }) => ({ choiceId, yesTotal: 0 })),
      ...(status === "closed" ? { selectedDateId: "date-1" } : {})
    });
  }
  const tokens = new Map([
    ["o".repeat(32), "open-1"], ["c".repeat(32), "closed-1"]
  ]);
  const requests = [];
  const publicUrl = (id) => {
    const token = [...tokens].find(([, pollId]) => pollId === id)?.[0];
    return token ? `${navigationOrigin}/p/${token}` : undefined;
  };
  const pollResponse = ({ organiserId: _owner, ranking: _ranking, participants: _participants,
    createdAt: _createdAt, selectedDateId: _selectedDateId, ...poll }) => poll;
  const publicResponse = ({ organiserId: _owner, createdAt: _createdAt, ...poll }) => poll;
  const summary = ({ id, title, status, createdAt, timeZone, proposedDates, participants }) => ({
    id, title, status, createdAt, timeZone,
    proposedDates: proposedDates.map(({ id: _id, ...choice }) => choice),
    participantCount: participants.length
  });
  const error = (status, code, message) => ({ status, body: { error: { code, message } } });

  function respond(request) {
    const { pathname, searchParams } = new URL(request.url);
    const { method, identity, body } = request;
    requests.push(structuredClone(request));
    if (pathname === "/health") return { status: 200, body: { status: "healthy" } };
    const publicMatch = /^\/api\/public\/polls\/([^/]+)$/.exec(pathname);
    if (publicMatch && method === "GET") {
      const poll = records.get(tokens.get(publicMatch[1]));
      return poll ? { status: 200, body: publicResponse(poll) }
        : error(404, "NOT_FOUND", "Public poll not found");
    }
    if (!pathname.startsWith("/api/organiser/polls")) {
      throw new Error(`Unconfigured component request: ${method} ${pathname}`);
    }
    // Same acceptance boundary as backend/src/adapters/local/authentication.ts.
    if (!/^local-organiser-[a-z0-9-]+$/.test(identity ?? "")) {
      return error(401, "UNAUTHENTICATED", "Local organiser authentication is required");
    }
    if (pathname === "/api/organiser/polls" && method === "GET") {
      const filter = searchParams.get("filter") ?? "active";
      const items = [...records.values()].filter((poll) => poll.organiserId === identity &&
        (filter === "active" ? poll.status !== "closed" : poll.status === filter));
      return { status: 200, body: { items: items.map(summary) } };
    }
    if (pathname === "/api/organiser/polls" && method === "POST") {
      const poll = {
        ...structuredClone(body), id: "created-1", status: "draft", version: 1,
        organiserId: identity, createdAt: "2026-10-04T09:00:00.000Z",
        participants: [], ranking: []
      };
      records.set(poll.id, poll);
      return { status: 201, body: pollResponse(poll) };
    }
    const match = /^\/api\/organiser\/polls\/([^/]+)(?:\/(history|publish))?$/.exec(pathname);
    const poll = records.get(match?.[1]);
    if (!poll) return error(404, "NOT_FOUND", "Poll not found");
    if (poll.organiserId !== identity) return error(403, "FORBIDDEN", "Only the organiser can access this poll");
    if (!match[2] && method === "GET") return { status: 200, body: pollResponse(poll) };
    if (match[2] === "history" && method === "GET") {
      return { status: 200, body: { items: [], total: 0 } };
    }
    if (!match[2] && method === "PUT") {
      Object.assign(poll, structuredClone(body), { version: poll.version + 1 });
      return { status: 200, body: pollResponse(poll) };
    }
    if (match[2] === "publish" && method === "POST") {
      poll.status = "open";
      poll.version += 1;
      poll.proposedDates = poll.proposedDates.map((choice, index) => ({ ...choice, id: `date-${index + 1}` }));
      poll.ranking = poll.proposedDates.map(({ id: choiceId }) => ({ choiceId, yesTotal: 0 }));
      tokens.set("n".repeat(32), poll.id);
      return { status: 200, body: { poll: pollResponse(poll), publicUrl: publicUrl(poll.id) } };
    }
    throw new Error(`Unconfigured component request: ${method} ${pathname}`);
  }

  return { records, tokens, requests, publicUrl, respond };
}
