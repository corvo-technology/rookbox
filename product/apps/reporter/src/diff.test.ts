import { describe, expect, it } from "vitest";
import { diffMachines } from "./diff.js";
import { machine } from "./test-support.js";
import type { Known } from "./types.js";

const OPTIONS = { diskResizeMinMib: 1_024, missedPollsForGone: 2 };
const T = Date.UTC(2026, 10, 10, 12, 0, 0);

const known = (...machines: ReturnType<typeof machine>[]): Map<string, Known> =>
  new Map(machines.map((m) => [m.id, { ...m, lastSeenMs: T, missed: 0 }]));

describe("diffMachines", () => {
  it("reports a machine seen for the first time", () => {
    const { events, upserts } = diffMachines(new Map(), [machine("m1")], T + 30_000, OPTIONS);
    expect(events).toEqual([
      expect.objectContaining({
        type: "seen",
        machineId: "m1",
        state: "running",
        owner: "u1",
        vcpu: 2,
        observedAt: new Date(T + 30_000).toISOString(),
        key: `m1:seen:${T + 30_000}`,
      }),
    ]);
    expect(upserts).toHaveLength(1);
  });

  it("is silent when nothing changed", () => {
    expect(diffMachines(known(machine("m1")), [machine("m1")], T + 30_000, OPTIONS).events).toEqual(
      [],
    );
  });

  it("reports suspend and resume", () => {
    const suspended = diffMachines(
      known(machine("m1")),
      [machine("m1", { state: "suspended" })],
      T + 30_000,
      OPTIONS,
    );
    expect(suspended.events.map((e) => [e.type, e.state])).toEqual([["suspended", "suspended"]]);
    const resumed = diffMachines(
      known(machine("m1", { state: "suspended" })),
      [machine("m1")],
      T + 30_000,
      OPTIONS,
    );
    expect(resumed.events.map((e) => [e.type, e.state])).toEqual([["resumed", "running"]]);
  });

  it("reports a resize with the new size on the event", () => {
    const { events } = diffMachines(
      known(machine("m1")),
      [machine("m1", { vcpu: 4, memoryMib: 4_096 })],
      T + 30_000,
      OPTIONS,
    );
    expect(events).toEqual([
      expect.objectContaining({ type: "resized", vcpu: 4, memoryMib: 4_096 }),
    ]);
  });

  it("carries a size change that happens with a state change on that one event", () => {
    const { events } = diffMachines(
      known(machine("m1")),
      [machine("m1", { state: "suspended", vcpu: 4 })],
      T + 30_000,
      OPTIONS,
    );
    expect(events).toEqual([expect.objectContaining({ type: "suspended", vcpu: 4 })]);
  });

  it("does not count small disk drift as a resize, and keeps the last reported figure", () => {
    const result = diffMachines(
      known(machine("m1")),
      [machine("m1", { diskMib: 10_240 + 300 })],
      T + 30_000,
      OPTIONS,
    );
    expect(result.events).toEqual([]);
    expect(result.upserts[0]?.diskMib).toBe(10_240);
    const big = diffMachines(
      known(machine("m1")),
      [machine("m1", { diskMib: 10_240 + 2_048 })],
      T + 30_000,
      OPTIONS,
    );
    expect(big.events.map((e) => e.type)).toEqual(["resized"]);
  });

  it("waits for the machine to be missing twice, then closes it at the last time it was seen", () => {
    const first = diffMachines(known(machine("m1")), [], T + 30_000, OPTIONS);
    expect(first.events).toEqual([]);
    expect(first.upserts[0]?.missed).toBe(1);
    const missing = new Map([["m1", { ...machine("m1"), lastSeenMs: T, missed: 1 }]]);
    const second = diffMachines(missing, [], T + 60_000, OPTIONS);
    expect(second.events).toEqual([
      expect.objectContaining({
        type: "gone",
        state: null,
        observedAt: new Date(T).toISOString(),
        key: `m1:gone:${T}`,
      }),
    ]);
    expect(second.removals).toEqual(["m1"]);
  });

  it("forgets a miss when the machine comes back", () => {
    const missing = new Map([["m1", { ...machine("m1"), lastSeenMs: T, missed: 1 }]]);
    const { events, upserts } = diffMachines(missing, [machine("m1")], T + 60_000, OPTIONS);
    expect(events).toEqual([]);
    expect(upserts[0]).toMatchObject({ missed: 0, lastSeenMs: T + 60_000 });
  });

  it("keeps a machine's owner tag if a later listing drops it", () => {
    const { upserts } = diffMachines(
      known(machine("m1")),
      [machine("m1", { owner: null })],
      T + 30_000,
      OPTIONS,
    );
    expect(upserts[0]?.owner).toBe("u1");
  });

  it("gives the same key to the same event, so a repeated delivery is recognised", () => {
    const a = diffMachines(new Map(), [machine("m1")], T, OPTIONS).events[0]?.key;
    const b = diffMachines(new Map(), [machine("m1")], T, OPTIONS).events[0]?.key;
    expect(a).toBe(b);
  });
});
