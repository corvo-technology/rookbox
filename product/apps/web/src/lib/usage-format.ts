/** Seconds to hours. */
export const toHours = (seconds: number): number => seconds / 3600;

/** MiB-seconds to GiB-hours. */
export const toGibHours = (mibSeconds: number): number => mibSeconds / 1024 / 3600;

/**
 * A measured quantity for people: whole numbers as they are, small ones with two decimals,
 * mid-size with one, in the reader's number format. `0` stays `0`.
 */
export function formatQuantity(value: number, locale: string): string {
  if (value === 0) return new Intl.NumberFormat(locale).format(0);
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * A round upper bound and evenly spaced tick values for a chart axis starting at 0, so the
 * scale reads "0, 5, 10, 15, 20" rather than the odd peak of the data.
 */
export function niceScale(peak: number, target = 4): { max: number; ticks: number[] } {
  if (!(peak > 0)) return { max: 1, ticks: [0, 1] };
  const rough = peak / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude;
  const count = Math.ceil(peak / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
  return { max: ticks.at(-1) ?? step, ticks };
}

/** `2026-11-10` to "Nov 10", from the UTC calendar day itself so the time zone cannot shift it. */
export function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
