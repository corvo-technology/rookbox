import type { IntervalRow } from "./aggregate.js";
import type { EventRow, IntervalDraft } from "./derive.js";

export type NewEvent = {
  reporterId: string;
  seq: number;
  idempotencyKey: string;
  type: EventRow["type"];
  machineId: string;
  observedAt: Date;
  state: "running" | "suspended" | null;
  ownerTag: string | null;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
  machineStartedAt: Date | null;
  source: "reporter" | "snapshot";
};

/** An event as read back: what interval derivation needs, plus the owner tag. */
export type StoredEvent = EventRow & { ownerTag: string | null };

export type ReporterRow = {
  id: string;
  lastContactAt: Date;
  lastEventAt: Date | null;
  lastSeq: number;
  pollIntervalS: number;
};

/** Where usage lives. The Prisma implementation is `prisma-store.ts`; tests use a memory one. */
export interface UsageStore {
  /** Stores events not seen before (by idempotency key); returns how many were new. */
  insertEvents(events: readonly NewEvent[]): Promise<number>;
  eventsForMachines(machineIds: readonly string[]): Promise<StoredEvent[]>;
  /** Replaces every interval of one machine, atomically. */
  replaceIntervals(machineId: string, intervals: readonly IntervalDraft[]): Promise<void>;
  /** The owner a machine's intervals have now, if any. */
  currentOwners(machineIds: readonly string[]): Promise<Map<string, string>>;
  /** Intervals still open. */
  openIntervals(filter?: { ownerUserId?: string }): Promise<IntervalRow[]>;
  /** Which of these machines this reporter has ever reported. */
  reporterMachineIds(reporterId: string, machineIds: readonly string[]): Promise<Set<string>>;
  /** Machines the API created, with their owner and name. */
  machineRows(
    machineIds: readonly string[],
  ): Promise<Map<string, { ownerId: string; name: string }>>;
  /** Which of these ids are accounts. */
  existingUsers(userIds: readonly string[]): Promise<Set<string>>;
  /** Machine ids that have an interval with no owner. */
  unassignedMachineIds(limit: number): Promise<string[]>;
  setOwner(machineId: string, ownerUserId: string): Promise<void>;
  touchReporter(
    id: string,
    at: Date,
    update: { seq: number; eventReceived: boolean; pollIntervalS?: number },
  ): Promise<void>;
  reporters(): Promise<ReporterRow[]>;
  /** Intervals that overlap `[from, to)`. `ownerUserId: undefined` means everyone's. */
  intervalsOverlapping(
    range: { from: Date; to: Date },
    filter?: { ownerUserId?: string },
  ): Promise<IntervalRow[]>;
  userEmails(userIds: readonly string[]): Promise<Map<string, string>>;
}
