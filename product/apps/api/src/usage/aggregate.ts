import {
  startOfUtcDay,
  type UsageAmounts,
  type UsageDay,
  type UsageMachine,
  type UsageTotals,
  usagePeriodRange,
} from "@rookbox/contracts";

/** An interval as read back from the store. */
export type IntervalRow = {
  machineId: string;
  ownerUserId: string | null;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
  state: "running" | "suspended";
  startedAt: Date;
  endedAt: Date | null;
};

const DAY_MS = 86_400_000;

export { usagePeriodRange as periodRange };

type Ms = {
  running: number;
  vcpu: number;
  memory: number;
  disk: number;
  suspended: number;
  suspendedDisk: number;
};

const zero = (): Ms => ({
  running: 0,
  vcpu: 0,
  memory: 0,
  disk: 0,
  suspended: 0,
  suspendedDisk: 0,
});

function add(into: Ms, row: IntervalRow, ms: number) {
  if (row.state === "running") {
    into.running += ms;
    into.vcpu += ms * row.vcpu;
    into.memory += ms * row.memoryMib;
    into.disk += ms * row.diskMib;
  } else {
    into.suspended += ms;
    into.suspendedDisk += ms * row.diskMib;
  }
}

const seconds = (ms: number) => Math.round(ms / 1000);

function amounts(ms: Ms): UsageAmounts {
  return {
    runningSeconds: seconds(ms.running),
    vcpuSeconds: seconds(ms.vcpu),
    memoryMibSeconds: seconds(ms.memory),
    diskMibSeconds: seconds(ms.disk),
    suspendedSeconds: seconds(ms.suspended),
    suspendedDiskMibSeconds: seconds(ms.suspendedDisk),
  };
}

const sum = (list: readonly UsageAmounts[]): UsageAmounts => ({
  runningSeconds: list.reduce((n, a) => n + a.runningSeconds, 0),
  vcpuSeconds: list.reduce((n, a) => n + a.vcpuSeconds, 0),
  memoryMibSeconds: list.reduce((n, a) => n + a.memoryMibSeconds, 0),
  diskMibSeconds: list.reduce((n, a) => n + a.diskMibSeconds, 0),
  suspendedSeconds: list.reduce((n, a) => n + a.suspendedSeconds, 0),
  suspendedDiskMibSeconds: list.reduce((n, a) => n + a.suspendedDiskMibSeconds, 0),
});

export type Summary = {
  totals: UsageTotals;
  byDay: UsageDay[];
  byMachine: UsageMachine[];
};

const isoDay = (at: Date) => at.toISOString().slice(0, 10);

/**
 * Adds up the part of each interval that falls inside `[from, to)`. An interval still open
 * counts up to `liveUntil` (normally now; earlier when the reporter has gone quiet, so a dead
 * meter does not keep billing-grade time running). Days are UTC calendar days and every day in
 * the range appears, empty or not. The totals are the sum of the days.
 */
export function summarize(
  rows: readonly IntervalRow[],
  range: { from: Date; to: Date },
  liveUntil: Date,
  names: ReadonlyMap<string, string> = new Map(),
): Summary {
  const days = new Map<string, Ms>();
  for (let t = startOfUtcDay(range.from).getTime(); t < range.to.getTime(); t += DAY_MS) {
    days.set(isoDay(new Date(t)), zero());
  }
  const machines = new Map<
    string,
    { ms: Ms; last: IntervalRow; lastStart: number; template: string }
  >();

  for (const row of rows) {
    const start = Math.max(row.startedAt.getTime(), range.from.getTime());
    const end = Math.min(row.endedAt?.getTime() ?? liveUntil.getTime(), range.to.getTime());
    if (end <= start) continue;

    for (let cursor = start; cursor < end; ) {
      const dayStart = Math.floor(cursor / DAY_MS) * DAY_MS;
      const sliceEnd = Math.min(end, dayStart + DAY_MS);
      const day = days.get(isoDay(new Date(dayStart)));
      if (day) add(day, row, sliceEnd - cursor);
      cursor = sliceEnd;
    }

    const entry = machines.get(row.machineId) ?? {
      ms: zero(),
      last: row,
      lastStart: -1,
      template: row.template,
    };
    add(entry.ms, row, end - start);
    // The machine's current state is the one of its latest interval.
    if (row.startedAt.getTime() >= entry.lastStart) {
      entry.last = row;
      entry.lastStart = row.startedAt.getTime();
      entry.template = row.template;
    }
    machines.set(row.machineId, entry);
  }

  const byDay: UsageDay[] = [...days.entries()].map(([day, ms]) => ({ day, ...amounts(ms) }));
  const byMachine: UsageMachine[] = [...machines.entries()]
    .map(([machineId, entry]) => ({
      machineId,
      name: names.get(machineId) ?? null,
      template: entry.template,
      state: entry.last.endedAt === null ? entry.last.state : ("deleted" as const),
      ...amounts(entry.ms),
    }))
    .sort((a, b) => b.runningSeconds - a.runningSeconds || a.machineId.localeCompare(b.machineId));

  return {
    totals: { machines: machines.size, ...sum(byDay) },
    byDay,
    byMachine,
  };
}
