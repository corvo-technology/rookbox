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

/** `2026-11-10` to "Nov 10", from the UTC calendar day itself so the time zone cannot shift it. */
export function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
