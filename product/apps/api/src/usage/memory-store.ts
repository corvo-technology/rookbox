import type { IntervalRow } from "./aggregate.js";
import type { IntervalDraft } from "./derive.js";
import type { NewEvent, ReporterRow, StoredEvent, UsageStore } from "./store.js";

/** An in-memory `UsageStore` for tests, behaving like the Prisma one. */
export function memoryUsageStore() {
  const events: (NewEvent & { id: number })[] = [];
  let intervals: IntervalDraft[] = [];
  const reporters = new Map<string, ReporterRow>();
  const machines = new Map<string, { ownerId: string; name: string }>();
  const users = new Map<string, string>();
  let nextId = 1;

  const store: UsageStore & {
    events: typeof events;
    intervals: () => IntervalDraft[];
    machines: typeof machines;
    users: typeof users;
  } = {
    events,
    intervals: () => intervals,
    machines,
    users,
    async insertEvents(rows) {
      let added = 0;
      for (const row of rows) {
        if (events.some((event) => event.idempotencyKey === row.idempotencyKey)) continue;
        events.push({ ...row, id: nextId++ });
        added += 1;
      }
      return added;
    },
    async eventsForMachines(ids) {
      return events
        .filter((event) => ids.includes(event.machineId))
        .map(
          (event): StoredEvent => ({
            id: event.id,
            machineId: event.machineId,
            type: event.type,
            observedAt: event.observedAt,
            state: event.state,
            template: event.template,
            vcpu: event.vcpu,
            memoryMib: event.memoryMib,
            diskMib: event.diskMib,
            ownerTag: event.ownerTag,
          }),
        );
    },
    async replaceIntervals(machineId, drafts) {
      intervals = [...intervals.filter((row) => row.machineId !== machineId), ...drafts];
    },
    async currentOwners(ids) {
      return new Map(
        intervals.flatMap((row) =>
          ids.includes(row.machineId) && row.ownerUserId ? [[row.machineId, row.ownerUserId]] : [],
        ),
      );
    },
    async openIntervals(filter) {
      return intervals.filter(
        (row) =>
          row.endedAt === null && (!filter?.ownerUserId || row.ownerUserId === filter.ownerUserId),
      );
    },
    async reporterMachineIds(reporterId, ids) {
      return new Set(
        events
          .filter((event) => event.reporterId === reporterId && ids.includes(event.machineId))
          .map((event) => event.machineId),
      );
    },
    async machineRows(ids) {
      return new Map([...machines].filter(([id]) => ids.includes(id)));
    },
    async existingUsers(ids) {
      return new Set(ids.filter((id) => users.has(id)));
    },
    async unassignedMachineIds(limit) {
      return [
        ...new Set(intervals.filter((row) => row.ownerUserId === null).map((row) => row.machineId)),
      ].slice(0, limit);
    },
    async setOwner(machineId, ownerUserId) {
      intervals = intervals.map((row) =>
        row.machineId === machineId ? { ...row, ownerUserId } : row,
      );
    },
    async touchReporter(id, at, update) {
      const before = reporters.get(id);
      reporters.set(id, {
        id,
        lastContactAt: at,
        lastEventAt: update.eventReceived ? at : (before?.lastEventAt ?? null),
        lastSeq: Math.max(before?.lastSeq ?? 0, update.seq),
        pollIntervalS: update.pollIntervalS ?? before?.pollIntervalS ?? 30,
      });
    },
    async reporters() {
      return [...reporters.values()];
    },
    async intervalsOverlapping(range, filter) {
      return intervals.filter(
        (row): row is IntervalDraft =>
          row.startedAt < range.to &&
          (row.endedAt === null || row.endedAt > range.from) &&
          (!filter?.ownerUserId || row.ownerUserId === filter.ownerUserId),
      ) satisfies IntervalRow[];
    },
    async userEmails(ids) {
      return new Map(ids.flatMap((id) => (users.has(id) ? [[id, users.get(id) as string]] : [])));
    },
  };
  return store;
}
