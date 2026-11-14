import type {
  Machine,
  UsageAmounts,
  UsageDay,
  UsageMachine,
  UsagePeriod,
  UsageSummary,
} from "@rookbox/contracts";
import { startOfUtcDay, usagePeriodRange } from "@rookbox/contracts";

const DAY = 86_400_000;

/** A repeatable number in [0, 1) from two strings, so the sample does not jump on every render. */
function unit(a: string, b: string): number {
  let h = 2_166_136_261;
  for (const ch of `${a}|${b}`) h = Math.imul(h ^ ch.charCodeAt(0), 16_777_619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const none = (): UsageAmounts => ({
  runningSeconds: 0,
  vcpuSeconds: 0,
  memoryMibSeconds: 0,
  diskMibSeconds: 0,
  suspendedSeconds: 0,
  suspendedDiskMibSeconds: 0,
});

function addTo(into: UsageAmounts, machine: Machine, runningS: number, suspendedS: number) {
  into.runningSeconds += runningS;
  into.vcpuSeconds += runningS * machine.size.vcpu;
  into.memoryMibSeconds += runningS * machine.size.memoryMib;
  into.diskMibSeconds += runningS * machine.size.diskMib;
  into.suspendedSeconds += suspendedS;
  into.suspendedDiskMibSeconds += suspendedS * machine.size.diskMib;
}

/**
 * Made-up usage for the dashboard's no-server mode, shaped exactly like the real answer and
 * flagged `sample: true`. Each machine runs part of every day since it was created; one that is
 * suspended now spent the last day or two suspended.
 */
export function sampleUsage(
  period: UsagePeriod,
  now: Date,
  machines: readonly Machine[],
): UsageSummary {
  const range = usagePeriodRange(period, now);
  const days: UsageDay[] = [];
  const perMachine = new Map<string, UsageAmounts>();

  for (let t = startOfUtcDay(range.from).getTime(); t < range.to.getTime(); t += DAY) {
    const dayEnd = Math.min(t + DAY, range.to.getTime());
    const total = none();
    for (const machine of machines) {
      const born = Date.parse(machine.createdAt);
      if (born >= dayEnd) continue;
      const alive = (dayEnd - Math.max(t, born)) / 1000;
      const asleep = machine.status === "suspended" && now.getTime() - t < 2 * DAY;
      const share = asleep ? 0.1 : 0.35 + unit(machine.id, String(t)) * 0.5;
      const running = Math.round(alive * share);
      const suspended = machine.status === "suspended" ? Math.round(alive - running) : 0;
      addTo(total, machine, running, suspended);
      let mine = perMachine.get(machine.id);
      if (!mine) {
        mine = none();
        perMachine.set(machine.id, mine);
      }
      addTo(mine, machine, running, suspended);
    }
    days.push({ day: new Date(t).toISOString().slice(0, 10), ...total });
  }

  const sum = days.reduce((acc, day) => {
    for (const key of Object.keys(acc) as (keyof UsageAmounts)[]) acc[key] += day[key];
    return acc;
  }, none());
  const byMachine: UsageMachine[] = machines
    .filter((machine) => perMachine.has(machine.id))
    .map((machine) => ({
      machineId: machine.id,
      name: machine.name,
      template: machine.template,
      state: machine.status === "suspended" ? ("suspended" as const) : ("running" as const),
      ...(perMachine.get(machine.id) as UsageAmounts),
    }))
    .sort((a, b) => b.runningSeconds - a.runningSeconds);

  return {
    period,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    sample: true,
    measuredEveryS: 30,
    updatedAt: now.toISOString(),
    totals: { machines: byMachine.length, ...sum },
    byDay: days,
    byMachine,
    running: machines
      .filter((machine) => machine.status === "running")
      .map((machine) => ({
        machineId: machine.id,
        name: machine.name,
        template: machine.template,
        vcpu: machine.size.vcpu,
        memoryMib: machine.size.memoryMib,
        diskMib: machine.size.diskMib,
        since: machine.createdAt,
      })),
  };
}
