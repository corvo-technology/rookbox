import { describe, expect, it } from "vitest";
import { mapStatus, OP_TTL_MS } from "./state.js";

const now = new Date("2026-03-10T12:00:00Z");
const recent = new Date(now.getTime() - 5_000);
const stale = new Date(now.getTime() - OP_TTL_MS - 1);

describe("mapStatus", () => {
  it("maps SPACE states: paused is suspended", () => {
    expect(mapStatus({ space: "running", op: null, opAt: null, now })).toBe("running");
    expect(mapStatus({ space: "paused", op: null, opAt: null, now })).toBe("suspended");
    expect(mapStatus({ space: "failed", op: null, opAt: null, now })).toBe("failed");
  });

  it("reports a machine SPACE no longer has as gone", () => {
    expect(mapStatus({ space: "missing", op: null, opAt: null, now })).toBeNull();
    expect(mapStatus({ space: "missing", op: "deleting", opAt: recent, now })).toBeNull();
  });

  it("shows a transition while its call is in flight and SPACE has not moved yet", () => {
    expect(mapStatus({ space: "running", op: "suspending", opAt: recent, now })).toBe("suspending");
    expect(mapStatus({ space: "paused", op: "restoring", opAt: recent, now })).toBe("restoring");
    expect(mapStatus({ space: "running", op: "deleting", opAt: recent, now })).toBe("deleting");
  });

  it("drops the transition once SPACE shows the target state", () => {
    expect(mapStatus({ space: "paused", op: "suspending", opAt: recent, now })).toBe("suspended");
    expect(mapStatus({ space: "running", op: "restoring", opAt: recent, now })).toBe("running");
  });

  it("stops trusting a transition that has been in flight too long", () => {
    expect(mapStatus({ space: "running", op: "suspending", opAt: stale, now })).toBe("running");
    expect(mapStatus({ space: "running", op: "deleting", opAt: stale, now })).toBe("running");
  });
});
