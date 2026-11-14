import { asSystem, inTransaction, systemStore, withUser } from "../database-access.js";
import type { Db } from "../db.js";
import type { IntervalRow } from "./aggregate.js";
import type { EventRow } from "./derive.js";
import type { UsageStore } from "./store.js";

const toInterval = (row: {
  machineId: string;
  ownerUserId: string | null;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
  state: string;
  startedAt: Date;
  endedAt: Date | null;
}): IntervalRow => ({
  machineId: row.machineId,
  ownerUserId: row.ownerUserId,
  template: row.template,
  vcpu: row.vcpu,
  memoryMib: row.memoryMib,
  diskMib: row.diskMib,
  state: row.state === "suspended" ? "suspended" : "running",
  startedAt: row.startedAt,
  endedAt: row.endedAt,
});

function buildUsageStore(db: Db): UsageStore {
  return {
    async insertEvents(events) {
      const result = await db.usageEvent.createMany({
        data: events.map((event) => ({ ...event })),
        skipDuplicates: true,
      });
      return result.count;
    },

    async eventsForMachines(machineIds) {
      const rows = await db.usageEvent.findMany({
        where: { machineId: { in: [...machineIds] } },
        orderBy: [{ observedAt: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        machineId: row.machineId,
        type: row.type as EventRow["type"],
        observedAt: row.observedAt,
        state: row.state === "running" || row.state === "suspended" ? row.state : null,
        template: row.template,
        vcpu: row.vcpu,
        memoryMib: row.memoryMib,
        diskMib: row.diskMib,
        ownerTag: row.ownerTag,
      }));
    },

    async replaceIntervals(machineId, intervals) {
      await inTransaction(db, async (tx) => {
        await tx.usageInterval.deleteMany({ where: { machineId } });
        await tx.usageInterval.createMany({ data: intervals.map((interval) => ({ ...interval })) });
      });
    },

    async currentOwners(machineIds) {
      const rows = await db.usageInterval.findMany({
        where: { machineId: { in: [...machineIds] }, ownerUserId: { not: null } },
        select: { machineId: true, ownerUserId: true },
        distinct: ["machineId"],
      });
      return new Map(
        rows.flatMap((row) => (row.ownerUserId ? [[row.machineId, row.ownerUserId]] : [])),
      );
    },

    async openIntervals(filter) {
      const rows = await db.usageInterval.findMany({
        where: {
          endedAt: null,
          ...(filter?.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
        },
      });
      return rows.map(toInterval);
    },

    async reporterMachineIds(reporterId, machineIds) {
      const rows = await db.usageEvent.findMany({
        where: { reporterId, machineId: { in: [...machineIds] } },
        select: { machineId: true },
        distinct: ["machineId"],
      });
      return new Set(rows.map((row) => row.machineId));
    },

    async machineRows(machineIds) {
      const rows = await db.machine.findMany({
        where: { id: { in: [...machineIds] } },
        select: { id: true, ownerId: true, name: true },
      });
      return new Map(rows.map((row) => [row.id, { ownerId: row.ownerId, name: row.name }]));
    },

    async existingUsers(userIds) {
      if (userIds.length === 0) return new Set();
      const rows = await db.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true },
      });
      return new Set(rows.map((row) => row.id));
    },

    async unassignedMachineIds(limit) {
      const rows = await db.usageInterval.findMany({
        where: { ownerUserId: null },
        select: { machineId: true },
        distinct: ["machineId"],
        take: limit,
      });
      return rows.map((row) => row.machineId);
    },

    async setOwner(machineId, ownerUserId) {
      await db.usageInterval.updateMany({ where: { machineId }, data: { ownerUserId } });
    },

    async touchReporter(id, at, update) {
      await db.usageReporter.upsert({
        where: { id },
        create: {
          id,
          lastContactAt: at,
          lastEventAt: update.eventReceived ? at : null,
          lastSeq: update.seq,
          ...(update.pollIntervalS ? { pollIntervalS: update.pollIntervalS } : {}),
        },
        update: {
          lastContactAt: at,
          ...(update.eventReceived ? { lastEventAt: at } : {}),
          ...(update.pollIntervalS ? { pollIntervalS: update.pollIntervalS } : {}),
        },
      });
      // `lastSeq` only grows, even if requests are handled out of order.
      await db.usageReporter.updateMany({
        where: { id, lastSeq: { lt: update.seq } },
        data: { lastSeq: update.seq },
      });
    },

    async reporters() {
      return db.usageReporter.findMany();
    },

    async intervalsOverlapping(range, filter) {
      const rows = await db.usageInterval.findMany({
        where: {
          startedAt: { lt: range.to },
          OR: [{ endedAt: null }, { endedAt: { gt: range.from } }],
          ...(filter?.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
        },
      });
      return rows.map(toInterval);
    },

    async userEmails(userIds) {
      if (userIds.length === 0) return new Map();
      const rows = await db.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, email: true },
      });
      return new Map(rows.map((row) => [row.id, row.email]));
    },
  };
}

/**
 * Usage is written by the reporter's ingest and read by operators, so it runs as system work.
 * The two reads a customer's own dashboard makes (a filter on one owner) run as that user
 * instead, so the `usage_interval_tenant` policy backs the filter.
 */
export function createPrismaUsageStore(db: Db): UsageStore {
  const inner = buildUsageStore(db);
  const system = systemStore(inner, "usage");
  const scoped =
    <A extends unknown[], R>(
      run: (...args: A) => Promise<R>,
      ownerOf: (...args: A) => string | undefined,
    ) =>
    (...args: A): Promise<R> => {
      const owner = ownerOf(...args);
      return owner
        ? withUser(owner, () => run(...args))
        : asSystem("usage across owners", () => run(...args));
    };
  return {
    ...system,
    openIntervals: scoped(inner.openIntervals, (filter) => filter?.ownerUserId),
    intervalsOverlapping: scoped(
      inner.intervalsOverlapping,
      (_range, filter) => filter?.ownerUserId,
    ),
  };
}
