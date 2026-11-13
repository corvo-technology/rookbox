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

/** 300 -> "5 min", 3600 -> "1 hr", 5400 -> "90 min": a duration, in the reader's language. */
export function formatIdle(seconds: number, locale: string): string {
  const whole = seconds % 3600 === 0;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: whole ? "hour" : "minute",
    unitDisplay: "short",
  }).format(whole ? seconds / 3600 : Math.round(seconds / 60));
}
