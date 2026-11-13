import type { UsageDay, UsageSummary } from "@rookbox/contracts";

const DAY = 86_400_000;

/** A steady number in [0, 1) from a string, so the sample is the same on every call. */
function hash01(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

/**
 * Usage is SAMPLE DATA: SPACE does not meter machine hours for the product yet. `sample: true`
 * makes the dashboard say so.
 */
export function sampleUsage(days: number, now: Date = new Date()): UsageSummary {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const list: UsageDay[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(today - (days - 1 - index) * DAY).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const quiet = weekday === 0 || weekday === 6 ? 0.35 : 1;
    return { date, machineHours: Math.round(hash01(date) * 48 * quiet * 10) / 10 };
  });
  const total = list.reduce((sum, day) => sum + day.machineHours, 0);
  return { days: list, totalMachineHours: Math.round(total * 10) / 10, sample: true };
}
