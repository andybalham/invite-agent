import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = pathToFileURL(path.join(root, "backend/dist/domain/closing-attendance.js")).href;

// S-021 / US-24: the close preview is a deterministic projection of the selected date.
test("close attendance separates Yes and No names without mutating participant order", async () => {
  const { projectClosingAttendance } = await import(moduleUrl);
  const participants = [
    { id: "p-1", displayName: "Alice", availability: { d1: "yes", d2: "no" } },
    { id: "p-2", displayName: "Bob", availability: { d1: "no", d2: "yes" } },
    { id: "p-3", displayName: "Chandra", availability: { d1: "yes", d2: "yes" } }
  ];
  const snapshot = structuredClone(participants);

  assert.deepEqual(projectClosingAttendance("d1", participants), {
    selectedDateId: "d1",
    yes: ["Alice", "Chandra"],
    no: ["Bob"]
  });
  assert.deepEqual(projectClosingAttendance("d2", participants), {
    selectedDateId: "d2",
    yes: ["Bob", "Chandra"],
    no: ["Alice"]
  });
  assert.deepEqual(participants, snapshot);
});

test("close attendance represents empty lists explicitly", async () => {
  const { projectClosingAttendance } = await import(moduleUrl);
  assert.deepEqual(projectClosingAttendance("d1", []), {
    selectedDateId: "d1",
    yes: [],
    no: []
  });
});
