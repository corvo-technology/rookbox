import type { MachineSize } from "@rookbox/contracts";

/** 2048 MiB -> "2 GiB", 1536 -> "1.5 GiB", 512 -> "512 MiB". */
export function formatMib(mib: number, locale: string): string {
  if (mib < 1024) return `${new Intl.NumberFormat(locale).format(mib)} MiB`;
  const gib = mib / 1024;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(gib)} GiB`;
}

/** The parts of a size, in the order the dashboard shows them. */
export function sizeParts(size: MachineSize, locale: string) {
  return {
    vcpu: new Intl.NumberFormat(locale).format(size.vcpu),
    memory: formatMib(size.memoryMib, locale),
    disk: formatMib(size.diskMib, locale),
  };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 days ago", "2 hours ago", "now". */
export function formatRelative(iso: string, locale: string, now: Date = new Date()): string {
  const elapsed = new Date(iso).getTime() - now.getTime();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return format.format(Math.round(elapsed / ms), unit);
  }
  return format.format(0, "second");
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

/** A UTC calendar day, `YYYY-MM-DD`, as a short local date. */
export function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** A UTC calendar day, `YYYY-MM-DD`, as "13 Nov" (the order follows the locale). */
export function formatDayShort(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The top of a bar chart's axis: the largest value rounded up to a multiple of 20 (at least 20), so four gridlines land on whole numbers. */
export function chartCeiling(max: number): number {
  return Math.max(20, Math.ceil(max / 20) * 20);
}

export function formatHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hours);
}
