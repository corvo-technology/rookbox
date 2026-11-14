import {
  type AdminUsage,
  type AdminUsageCustomer,
  CUSTOMER_OWNER_PREFIX,
  type IngestAck,
  type IngestMessage,
  parseCustomerOwner,
  type UsagePeriod,
  type UsageSummary,
} from "@rookbox/contracts";
import type { Logger } from "../logger.js";
import { periodRange, summarize } from "./aggregate.js";
import { deriveIntervals } from "./derive.js";
import type { NewEvent, ReporterRow, UsageStore } from "./store.js";

export type UsageServiceOptions = {
  store: UsageStore;
  logger: Logger;
  now?: () => Date;
  /** Emails allowed to see everyone's usage. */
  adminEmails: readonly string[];
  /**
   * After this many seconds without a word from the reporter, machines still open stop accruing
   * time at the last contact instead of at now: a dead meter must not keep counting.
   */
  staleAfterS?: number;
  /** Precision to report when no reporter has said how often it looks. */
  defaultPollIntervalS?: number;
};

export const DEFAULT_STALE_AFTER_S = 900;

export interface UsageService {
  ingest(message: IngestMessage): Promise<IngestAck>;
  summary(userId: string, period: UsagePeriod): Promise<UsageSummary>;
  admin(period: UsagePeriod): Promise<AdminUsage>;
  isAdmin(email: string): boolean;
}

const iso = (at: Date) => at.toISOString();
const ageS = (at: Date | null, now: Date) =>
  at ? Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000)) : null;

export function createUsageService(options: UsageServiceOptions): UsageService {
  const { store, logger } = options;
  const clock = options.now ?? (() => new Date());
  const staleAfterS = options.staleAfterS ?? DEFAULT_STALE_AFTER_S;
  const admins = new Set(options.adminEmails.map((email) => email.trim().toLowerCase()));

  /**
   * Re-derives each machine's intervals from all of its events. The owner is the `rookbox.owner`
   * tag when it names a real account, else the owner of the API's own record of the machine
   * (this is how a fork, which loses its tag, is found), else the customer the reporter's rules
   * named (`customer:<id>`, a customer app on the same sandbox key), else whoever owned it
   * before, else nobody.
   */
  async function rebuild(machineIds: readonly string[]) {
    if (machineIds.length === 0) return;
    const [events, rows, current] = await Promise.all([
      store.eventsForMachines(machineIds),
      store.machineRows(machineIds),
      store.currentOwners(machineIds),
    ]);
    const tagOf = new Map<string, string>();
    for (const event of [...events].sort(
      (a, b) => a.observedAt.getTime() - b.observedAt.getTime() || a.id - b.id,
    )) {
      if (event.ownerTag) tagOf.set(event.machineId, event.ownerTag);
    }
    const known = await store.existingUsers(
      [...new Set(tagOf.values())].filter((tag) => !tag.startsWith(CUSTOMER_OWNER_PREFIX)),
    );
    for (const id of machineIds) {
      const mine = events.filter((event) => event.machineId === id);
      const tag = tagOf.get(id);
      const owner =
        (tag && known.has(tag) ? tag : null) ??
        rows.get(id)?.ownerId ??
        (parseCustomerOwner(tag) ? tag : null) ??
        current.get(id) ??
        null;
      await store.replaceIntervals(id, deriveIntervals(mine, owner));
    }
  }

  /** Gives machines that arrived before the API's record of them an owner now that it exists. */
  async function relabel() {
    const ids = await store.unassignedMachineIds(200);
    if (ids.length === 0) return;
    const rows = await store.machineRows(ids);
    for (const id of ids) {
      const row = rows.get(id);
      if (row) await store.setOwner(id, row.ownerId);
    }
  }

  async function ingest(message: IngestMessage): Promise<IngestAck> {
    const now = clock();
    let rows: NewEvent[];
    let ackedSeq: number;

    if (message.kind === "events") {
      ackedSeq = Math.max(...message.events.map((event) => event.seq));
      rows = message.events.map((event) => ({
        reporterId: message.reporterId,
        seq: event.seq,
        idempotencyKey: event.key,
        type: event.type,
        machineId: event.machineId,
        observedAt: new Date(event.observedAt),
        state: event.type === "gone" ? null : event.state,
        ownerTag: event.owner,
        template: event.template,
        vcpu: event.vcpu,
        memoryMib: event.memoryMib,
        diskMib: event.diskMib,
        machineStartedAt: event.startedAt ? new Date(event.startedAt) : null,
        source: "reporter",
      }));
    } else {
      ackedSeq = message.seq;
      rows = await repairFromSnapshot(message);
    }

    const inserted = rows.length ? await store.insertEvents(rows) : 0;
    // Rebuild even when everything was a duplicate: a first delivery that stored the events but
    // died before rebuilding is repaired by its own retry.
    await rebuild([...new Set(rows.map((row) => row.machineId))]);
    await relabel();
    await store.touchReporter(message.reporterId, now, {
      seq: ackedSeq,
      eventReceived: inserted > 0,
      pollIntervalS: message.pollIntervalS,
    });
    return { ok: true, ackedSeq, accepted: inserted, duplicates: rows.length - inserted };
  }

  /**
   * A snapshot lists every machine the reporter sees at `takenAt`. Where that disagrees with the
   * open intervals, it is turned into the events that would have produced it: a machine it lists
   * that we think is gone or different gets a `seen`; one we think is open that the reporter
   * (and only this reporter) used to report, and the snapshot no longer lists, gets a `gone`.
   * Both are stamped `takenAt`, so the repair is as precise as the gap between snapshots.
   */
  async function repairFromSnapshot(
    message: Extract<IngestMessage, { kind: "snapshot" }>,
  ): Promise<NewEvent[]> {
    const takenAt = new Date(message.takenAt);
    const stamp = takenAt.getTime();
    const open = await store.openIntervals();
    const openBy = new Map(open.map((row) => [row.machineId, row]));
    const out: NewEvent[] = [];
    const listed = new Set<string>();
    // A machine the reporter now files under a customer, whose stored time has no owner yet (it
    // was recorded before the rule existed), is restated so the rebuild can give it that owner.
    const customerIds = message.machines
      .filter((machine) => parseCustomerOwner(machine.owner))
      .map((machine) => machine.machineId);
    const owned = customerIds.length ? await store.currentOwners(customerIds) : new Map();

    for (const machine of message.machines) {
      listed.add(machine.machineId);
      const have = openBy.get(machine.machineId);
      if (have && have.startedAt.getTime() > stamp) continue;
      const needsOwner =
        parseCustomerOwner(machine.owner) !== null && !owned.has(machine.machineId);
      if (
        !needsOwner &&
        have &&
        have.state === machine.state &&
        have.template === machine.template &&
        have.vcpu === machine.vcpu &&
        have.memoryMib === machine.memoryMib &&
        have.diskMib === machine.diskMib
      ) {
        continue;
      }
      out.push({
        reporterId: message.reporterId,
        seq: message.seq,
        idempotencyKey: `snapshot:${message.reporterId}:${machine.machineId}:${stamp}`,
        type: "seen",
        machineId: machine.machineId,
        observedAt: takenAt,
        state: machine.state,
        ownerTag: machine.owner,
        template: machine.template,
        vcpu: machine.vcpu,
        memoryMib: machine.memoryMib,
        diskMib: machine.diskMib,
        machineStartedAt: machine.startedAt ? new Date(machine.startedAt) : null,
        source: "snapshot",
      });
    }

    const mine = open.filter(
      (row) => !listed.has(row.machineId) && row.startedAt.getTime() <= stamp,
    );
    if (mine.length > 0) {
      const own = await store.reporterMachineIds(
        message.reporterId,
        mine.map((row) => row.machineId),
      );
      for (const row of mine) {
        if (!own.has(row.machineId)) continue;
        out.push({
          reporterId: message.reporterId,
          seq: message.seq,
          idempotencyKey: `snapshot:${message.reporterId}:${row.machineId}:gone:${stamp}`,
          type: "gone",
          machineId: row.machineId,
          observedAt: takenAt,
          state: null,
          ownerTag: null,
          template: row.template,
          vcpu: row.vcpu,
          memoryMib: row.memoryMib,
          diskMib: row.diskMib,
          machineStartedAt: null,
          source: "snapshot",
        });
      }
    }
    if (out.length > 0) {
      logger.info("usage snapshot repaired gaps", {
        reporterId: message.reporterId,
        events: out.length,
      });
    }
    return out;
  }

  /** Where open intervals stop counting: now, unless the reporter has gone quiet. */
  async function liveUntil(now: Date) {
    const reporters = await store.reporters();
    const latest = reporters.reduce<ReporterRow | null>(
      (best, row) => (!best || row.lastContactAt > best.lastContactAt ? row : best),
      null,
    );
    const last = latest?.lastContactAt ?? null;
    const quiet = !last || (ageS(last, now) ?? 0) > staleAfterS;
    return { reporters, latest, last, live: quiet ? (last ?? new Date(0)) : now, stale: quiet };
  }

  async function summary(userId: string, period: UsagePeriod): Promise<UsageSummary> {
    // Customer usage is never a user's: an account id cannot look like a customer owner.
    if (userId.startsWith(CUSTOMER_OWNER_PREFIX)) throw new Error("not a user account");
    const now = clock();
    const range = periodRange(period, now);
    const { latest, last, live } = await liveUntil(now);
    const [rows, open] = await Promise.all([
      store.intervalsOverlapping(range, { ownerUserId: userId }),
      store.openIntervals({ ownerUserId: userId }),
    ]);
    const machineIds = [...new Set([...rows, ...open].map((row) => row.machineId))];
    const known = await store.machineRows(machineIds);
    const names = new Map([...known].map(([id, row]) => [id, row.name]));
    const result = summarize(rows, range, live, names);
    return {
      period,
      from: iso(range.from),
      to: iso(range.to),
      sample: false,
      measuredEveryS: latest?.pollIntervalS ?? options.defaultPollIntervalS ?? 30,
      updatedAt: last ? iso(last) : null,
      ...result,
      running: open
        .filter((row) => row.state === "running")
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .map((row) => ({
          machineId: row.machineId,
          name: names.get(row.machineId) ?? null,
          template: row.template,
          vcpu: row.vcpu,
          memoryMib: row.memoryMib,
          diskMib: row.diskMib,
          since: iso(row.startedAt),
        })),
    };
  }

  async function admin(period: UsagePeriod): Promise<AdminUsage> {
    const now = clock();
    const range = periodRange(period, now);
    const { reporters, last, live, stale } = await liveUntil(now);
    const rows = await store.intervalsOverlapping(range);
    const byOwner = new Map<string | null, typeof rows>();
    for (const row of rows) {
      byOwner.set(row.ownerUserId, [...(byOwner.get(row.ownerUserId) ?? []), row]);
    }
    const isCustomer = (owner: string | null) => owner?.startsWith(CUSTOMER_OWNER_PREFIX) ?? false;
    const userIds = [...byOwner.keys()].filter(
      (id): id is string => id !== null && !isCustomer(id),
    );
    const customers: AdminUsageCustomer[] = [...byOwner.entries()]
      .flatMap(([owner, list]) => {
        const customerId = parseCustomerOwner(owner);
        if (!customerId) return [];
        const totals = summarize(list, range, live).totals;
        const now = new Set(
          list
            .filter((row) => row.endedAt === null && row.state === "running")
            .map((row) => row.machineId),
        );
        return totals.machines > 0 ? [{ customerId, ...totals, machinesNow: now.size }] : [];
      })
      .sort(
        (a, b) => b.runningSeconds - a.runningSeconds || a.customerId.localeCompare(b.customerId),
      );
    const emails = await store.userEmails(userIds);
    const users = userIds
      .map((userId) => ({
        userId,
        email: emails.get(userId) ?? null,
        ...summarize(byOwner.get(userId) ?? [], range, live).totals,
      }))
      .filter((user) => user.machines > 0)
      .sort((a, b) => b.runningSeconds - a.runningSeconds || a.userId.localeCompare(b.userId));
    const lastEventAt = reporters.reduce<Date | null>(
      (best, row) =>
        row.lastEventAt && (!best || row.lastEventAt > best) ? row.lastEventAt : best,
      null,
    );
    return {
      period,
      from: iso(range.from),
      to: iso(range.to),
      reporter: {
        lastContactAt: last ? iso(last) : null,
        lastContactAgeS: ageS(last, now),
        lastEventAt: lastEventAt ? iso(lastEventAt) : null,
        lastEventAgeS: ageS(lastEventAt, now),
        stale,
      },
      users,
      customers,
      unassigned: summarize(byOwner.get(null) ?? [], range, live).totals,
    };
  }

  return { ingest, summary, admin, isAdmin: (email) => admins.has(email.trim().toLowerCase()) };
}
