import type { IngestEvent, IngestMessage, SnapshotMachine } from "@rookbox/contracts";
import { silentLogger } from "../logger.js";
import { memoryUsageStore } from "./memory-store.js";
import { createUsageService } from "./service.js";

export const T0 = Date.UTC(2026, 10, 10, 0, 0, 0);
export const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

let seq = 0;
export function resetSeq() {
  seq = 0;
}

type EventFields = Partial<Omit<IngestEvent, "type" | "observedAt">>;

/** An event as the reporter sends it, `seconds` after T0. */
export function ev(
  type: IngestEvent["type"],
  machineId: string,
  seconds: number,
  fields: EventFields = {},
): IngestEvent {
  seq += 1;
  return {
    seq,
    key: `${machineId}:${type}:${seconds}`,
    type,
    machineId,
    observedAt: at(seconds),
    state: type === "gone" ? null : type === "suspended" ? "suspended" : "running",
    owner: "u1",
    template: "seed",
    vcpu: 2,
    memoryMib: 2048,
    diskMib: 10_240,
    startedAt: at(0),
    ...fields,
  };
}

export const events = (list: IngestEvent[], reporterId = "rep1"): IngestMessage => ({
  kind: "events",
  reporterId,
  events: list,
});

export function snapshot(
  seconds: number,
  machines: Partial<SnapshotMachine>[],
  reporterId = "rep1",
): IngestMessage {
  seq += 1;
  return {
    kind: "snapshot",
    reporterId,
    seq,
    key: `snap:${seconds}`,
    takenAt: at(seconds),
    machines: machines.map((machine) => ({
      machineId: "m1",
      owner: "u1",
      template: "seed",
      vcpu: 2,
      memoryMib: 2048,
      diskMib: 10_240,
      startedAt: at(0),
      state: "running",
      ...machine,
    })),
  };
}

/** A usage service on a memory store whose clock the test moves. */
export function newUsage(options: { users?: Record<string, string>; admins?: string[] } = {}) {
  const store = memoryUsageStore();
  for (const [id, email] of Object.entries(
    options.users ?? { u1: "u1@example.test", u2: "u2@example.test" },
  )) {
    store.users.set(id, email);
  }
  const clock = { now: new Date(T0 + 3_600_000) };
  const service = createUsageService({
    store,
    logger: silentLogger,
    now: () => clock.now,
    adminEmails: options.admins ?? ["admin@example.test"],
  });
  return {
    store,
    service,
    clock,
    setNow: (seconds: number) => (clock.now = new Date(T0 + seconds * 1000)),
  };
}
