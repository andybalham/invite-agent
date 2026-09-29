import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rankingUrl = pathToFileURL(path.join(root, "backend/dist/domain/ranking.js")).href;

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function expectedRanking(choiceIds, participants) {
  return choiceIds
    .map((choiceId, originalIndex) => ({
      choiceId,
      yesTotal: participants.reduce(
        (total, participant) => total + (participant.availability[choiceId] === "yes" ? 1 : 0),
        0
      ),
      originalIndex
    }))
    .sort((left, right) => right.yesTotal - left.yesTotal || left.originalIndex - right.originalIndex)
    .slice(0, 5)
    .map(({ choiceId, yesTotal }) => ({ choiceId, yesTotal }));
}

// S-015 / US-17 / US-18: rank Yes totals descending, breaking every tie by proposal order.
test("ranking is Yes-descending, stable for ties, limited to five, and includes every smaller set", async () => {
  const { calculateTopFiveRanking } = await import(rankingUrl);
  const choiceIds = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
  const participants = [
    { id: "p-1", availability: { first: "yes", second: "yes", third: "no", fourth: "yes", fifth: "no", sixth: "yes", seventh: "no" } },
    { id: "p-2", availability: { first: "no", second: "yes", third: "yes", fourth: "yes", fifth: "no", sixth: "yes", seventh: "no" } }
  ];

  assert.deepEqual(calculateTopFiveRanking(choiceIds, participants), [
    { choiceId: "second", yesTotal: 2 },
    { choiceId: "fourth", yesTotal: 2 },
    { choiceId: "sixth", yesTotal: 2 },
    { choiceId: "first", yesTotal: 1 },
    { choiceId: "third", yesTotal: 1 }
  ]);
  assert.deepEqual(calculateTopFiveRanking(choiceIds.slice(0, 3), []), [
    { choiceId: "first", yesTotal: 0 },
    { choiceId: "second", yesTotal: 0 },
    { choiceId: "third", yesTotal: 0 }
  ]);
});

test("No totals and participant order never affect ranking", async () => {
  const { calculateTopFiveRanking } = await import(rankingUrl);
  const choiceIds = ["a", "b", "c"];
  const participants = [
    { id: "alice", availability: { a: "yes", b: "no", c: "yes" } },
    { id: "bob", availability: { a: "no", b: "yes", c: "no" } }
  ];
  const expected = calculateTopFiveRanking(choiceIds, participants);

  assert.deepEqual(calculateTopFiveRanking(choiceIds, [...participants].reverse()), expected);
  assert.deepEqual(
    calculateTopFiveRanking(choiceIds, [
      ...participants,
      { id: "no-only-1", availability: { a: "no", b: "no", c: "no" } },
      { id: "no-only-2", availability: { a: "no", b: "no", c: "no" } }
    ]),
    expected
  );
});

test("property: arbitrary response matrices match the ranking oracle deterministically", async () => {
  const { calculateTopFiveRanking } = await import(rankingUrl);
  const random = makeRandom(0x5005_0015);

  for (let example = 0; example < 500; example += 1) {
    const choiceIds = Array.from({ length: Math.floor(random() * 13) }, (_, index) => `choice-${index}`);
    const participants = Array.from({ length: Math.floor(random() * 21) }, (_, participantIndex) => ({
      id: `participant-${participantIndex}`,
      availability: Object.fromEntries(
        choiceIds.map((choiceId) => [choiceId, random() < 0.5 ? "no" : "yes"])
      )
    }));
    const snapshot = structuredClone({ choiceIds, participants });
    const expected = expectedRanking(choiceIds, participants);

    assert.deepEqual(calculateTopFiveRanking(choiceIds, participants), expected);
    assert.deepEqual(calculateTopFiveRanking(choiceIds, participants), expected);
    assert.deepEqual({ choiceIds, participants }, snapshot, "ranking must not mutate observable input state");
  }
});
