import { describe, expect, it } from "vitest";
import { IngestMessageSchema, usagePeriodRange } from "./usage.js";

const event = {
  seq: 1,
  key: "m1:seen:1",
  type: "seen",
  observedAt: "2026-11-10T00:00:00.000Z",
  state: "running",
  machineId: "m1",
  owner: null,
  template: "seed",
  vcpu: 2,
  memoryMib: 2048,
  diskMib: 10240,
  startedAt: null,
};

describe("usagePeriodRange", () => {
  const now = new Date("2026-11-14T15:30:00Z");
  it("counts whole UTC days ending today, or from the first of the month", () => {
    expect(usagePeriodRange("7d", now).from.toISOString()).toBe("2026-11-08T00:00:00.000Z");
    expect(usagePeriodRange("30d", now).from.toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(usagePeriodRange("month", now).from.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(usagePeriodRange("7d", now).to).toEqual(now);
  });
});

describe("IngestMessageSchema", () => {
  it("accepts a batch of events and a snapshot", () => {
    expect(
      IngestMessageSchema.safeParse({ kind: "events", reporterId: "box-1", events: [event] })
        .success,
    ).toBe(true);
    expect(
      IngestMessageSchema.safeParse({
        kind: "snapshot",
        reporterId: "box-1",
        pollIntervalS: 30,
        seq: 2,
        key: "snapshot:box-1:1",
        takenAt: "2026-11-10T00:05:00.000Z",
        machines: [
          { ...event, seq: undefined, key: undefined, type: undefined, observedAt: undefined },
        ],
      }).success,
    ).toBe(true);
  });

  it("refuses what the API must not store", () => {
    const base = { kind: "events", reporterId: "box-1" };
    expect(IngestMessageSchema.safeParse({ ...base, events: [] }).success).toBe(false);
    expect(
      IngestMessageSchema.safeParse({ ...base, events: [{ ...event, type: "exploded" }] }).success,
    ).toBe(false);
    expect(
      IngestMessageSchema.safeParse({ ...base, events: [{ ...event, vcpu: -1 }] }).success,
    ).toBe(false);
    expect(
      IngestMessageSchema.safeParse({ ...base, reporterId: "bad id!", events: [event] }).success,
    ).toBe(false);
  });
});
