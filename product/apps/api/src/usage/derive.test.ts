import { describe, expect, it } from "vitest";
import { deriveIntervals, type EventRow } from "./derive.js";

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1000);

let nextId = 1;
function event(type: EventRow["type"], seconds: number, fields: Partial<EventRow> = {}): EventRow {
  const gone = type === "gone";
  return {
    id: nextId++,
    machineId: "m1",
    type,
    observedAt: at(seconds),
    state: gone ? null : type === "suspended" ? "suspended" : "running",
    template: "seed",
    vcpu: 2,
    memoryMib: 2048,
    diskMib: 10_240,
    ...fields,
  };
}

const spans = (rows: ReturnType<typeof deriveIntervals>) =>
  rows.map((row) => [
    row.state,
    (row.startedAt.getTime() - T0) / 1000,
    row.endedAt && (row.endedAt.getTime() - T0) / 1000,
    row.seconds,
  ]);

describe("deriveIntervals", () => {
  it("opens an interval at creation and leaves it open", () => {
    const rows = deriveIntervals([event("seen", 0)], "u1");
    expect(spans(rows)).toEqual([["running", 0, null, null]]);
    expect(rows[0]?.ownerUserId).toBe("u1");
  });

  it("follows create, suspend, resume and delete", () => {
    const rows = deriveIntervals(
      [event("seen", 0), event("suspended", 60), event("resumed", 360), event("gone", 420)],
      "u1",
    );
    expect(spans(rows)).toEqual([
      ["running", 0, 60, 60],
      ["suspended", 60, 360, 300],
      ["running", 360, 420, 60],
    ]);
  });

  it("splits an interval when the size changes", () => {
    const rows = deriveIntervals(
      [event("seen", 0), event("resized", 100, { vcpu: 4, memoryMib: 4096 })],
      null,
    );
    expect(rows.map((row) => [row.vcpu, row.memoryMib, row.seconds])).toEqual([
      [2, 2048, 100],
      [4, 4096, null],
    ]);
  });

  it("gives the same answer whatever order the events arrive in", () => {
    const ordered = [
      event("seen", 0),
      event("suspended", 60),
      event("resumed", 360),
      event("gone", 420),
    ];
    const shuffled = [ordered[3], ordered[1], ordered[0], ordered[2]] as EventRow[];
    expect(deriveIntervals(shuffled, "u1")).toEqual(deriveIntervals(ordered, "u1"));
  });

  it("ignores an event that repeats what is already true", () => {
    const rows = deriveIntervals([event("seen", 0), event("seen", 30), event("resumed", 60)], "u1");
    expect(spans(rows)).toEqual([["running", 0, null, null]]);
  });

  it("starts a machine first seen suspended as suspended", () => {
    const rows = deriveIntervals([event("seen", 0, { state: "suspended" })], "u1");
    expect(spans(rows)).toEqual([["suspended", 0, null, null]]);
  });

  it("closes at the delete even when a machine is deleted straight from running", () => {
    expect(spans(deriveIntervals([event("seen", 10), event("gone", 25)], "u1"))).toEqual([
      ["running", 10, 25, 15],
    ]);
  });

  it("does not make a row of an interval that lasted no time", () => {
    expect(deriveIntervals([event("seen", 10), event("gone", 10)], "u1")).toEqual([]);
  });

  it("opens a new interval for a machine that comes back after a gap", () => {
    const rows = deriveIntervals([event("seen", 0), event("gone", 100), event("seen", 500)], "u1");
    expect(spans(rows)).toEqual([
      ["running", 0, 100, 100],
      ["running", 500, null, null],
    ]);
  });

  it("returns nothing for a machine with no events", () => {
    expect(deriveIntervals([], "u1")).toEqual([]);
  });
});
