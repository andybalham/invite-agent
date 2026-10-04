import { PollService } from "../../backend/dist/application/index.js";
import { selectOwnedPolls, toOwnedPollSummary } from "../../backend/dist/domain/index.js";
import { createNavigationFixture, navigationOrigin, navigationOwners } from "./organiser-navigation-fixture.mjs";

// T-120: exercise existing lifecycle commands with an in-memory repository.
// Only persistence/transport are substitutes; summaries and mutations use real code.
export function createLifecycleFixture() {
  const navigation = createNavigationFixture();
  const { records, requests, tokens } = navigation;
  const participants = new Map();
  const writes = [];
  for (const [index, poll] of [...records.values()].entries()) {
    poll.createdAt = `2026-09-0${index + 1}T08:00:00.000Z`;
    poll.participantCount = 0;
    if (poll.status === "closed") poll.selectedDateId = `${poll.id}-date-1`;
    participants.set(poll.id, []);
  }
  const save = async (poll, audit) => {
    records.set(poll.id, structuredClone(poll));
    writes.push(structuredClone({ poll, audit }));
  };
  const repository = {
    getPoll: async (id) => structuredClone(records.get(id)),
    listParticipants: async (id) => structuredClone(participants.get(id) ?? []),
    createPoll: save, updatePoll: save, publishPoll: save, closePoll: save, reopenPoll: save,
    listOwnedSummaries: async (owner, query, key) => {
      const all = selectOwnedPolls([...records.values()], owner, query);
      const offset = key ? all.findIndex(({ id }) => key.PK.S === `POLL#${id}`) + 1 : 0;
      const page = all.slice(offset, offset + query.pageSize);
      const last = page.at(-1);
      return {
        items: page.map((poll) => toOwnedPollSummary(poll, poll.participantCount)),
        ...(offset + page.length < all.length ? { lastEvaluatedKey: {
          PK: { S: `POLL#${last.id}` }, SK: { S: "METADATA" },
          GSI1PK: { S: `ORGANISER#${owner}` }, GSI1SK: { S: `POLL#${last.createdAt}#${last.id}` }
        } } : {})
      };
    }
  };
  const service = new PollService(repository, {
    baseUrl: navigationOrigin, tokenHashKey: "t120-lifecycle-fixture",
    dashboardCursorSecret: "t120-cursor-secret-with-at-least-32-bytes"
  });

  function setParticipants(id, names) {
    const rows = names.map((displayName, index) => ({
      id: `${id}-participant-${index}`, pollId: id, displayName,
      normalizedName: displayName.toLowerCase(),
      availability: Object.fromEntries(records.get(id).proposedDates.map((_, dateIndex) => [`${id}-date-${dateIndex + 1}`, "yes"])),
      createdAt: "2026-10-04T10:00:00.000Z", updatedAt: "2026-10-04T10:00:00.000Z"
    }));
    participants.set(id, rows);
    // Controlled external activity, separate from organiser navigation/mutations.
    records.get(id).participantCount = rows.length;
    records.get(id).version += 1;
  }

  async function respond(request) {
    const { pathname, searchParams } = new URL(request.url);
    const { method, body, identity } = request;
    const match = /^\/api\/organiser\/polls(?:\/([^/]+)(?:\/(publish|close|reopen))?)?$/.exec(pathname);
    const publicMatch = /^\/api\/public\/polls\/([^/]+)$/.exec(pathname);
    if (publicMatch && method === "GET" && tokens.has(publicMatch[1])) {
      requests.push(structuredClone(request));
      return { status: 200, body: await service.get(tokens.get(publicMatch[1]), navigationOwners.olivia) };
    }
    if (!match) return navigation.respond(request);
    requests.push(structuredClone(request));
    if (identity !== navigationOwners.olivia) throw new Error(`Unexpected lifecycle fixture identity: ${identity}`);
    const [, id, command] = match;
    try {
      let result;
      if (!id && method === "GET") result = await service.listOwned({
        ...Object.fromEntries(searchParams), pageSize: Number(searchParams.get("pageSize") ?? 25)
      }, identity);
      else if (!id && method === "POST") result = await service.create(body, identity);
      else if (id && !command && method === "GET") result = await service.get(id, identity);
      else if (id && !command && method === "PUT") result = await service.update(id, body, identity);
      else if (command === "publish" && method === "POST") {
        result = await service.publish(id, identity);
        tokens.set(new URL(result.publicUrl).pathname.split("/").at(-1), id);
      } else if (command === "close" && method === "POST") result = await service.close(id, body, identity);
      else if (command === "reopen" && method === "POST") result = await service.reopen(id, body, identity);
      else throw new Error(`Unconfigured lifecycle request: ${method} ${pathname}`);
      return { status: !id && method === "POST" ? 201 : 200, body: result };
    } catch (error) {
      if (!error.code) throw error;
      return { status: error.status, body: { error: { code: error.code, message: error.message } } };
    }
  }

  return { ...navigation, service, writes, participants, setParticipants, respond };
}
