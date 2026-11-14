import { useLingui } from "@lingui/react/macro";
import type { UsageDay } from "@rookbox/contracts";
import { formatDay, formatQuantity, toHours } from "../lib/usage-format";

/**
 * Machine-hours running per day, as bars. The bars are decoration for the eye; each day is also
 * a list item with its value in words, so a screen reader gets the same numbers.
 */
export function UsageChart({ days, locale }: { days: readonly UsageDay[]; locale: string }) {
  const { t } = useLingui();
  const hours = days.map((day) => toHours(day.runningSeconds));
  const peak = Math.max(...hours, 0);
  const first = days[0];
  const last = days.at(-1);
  return (
    <figure className="m-0">
      <ol
        className="m-0 flex h-40 list-none items-end gap-[3px] p-0"
        aria-label={t`Machine-hours running per day`}
      >
        {days.map((day, index) => {
          const value = hours[index] ?? 0;
          const text = `${formatDay(day.day, locale)}: ${formatQuantity(value, locale)}`;
          return (
            <li key={day.day} className="flex h-full min-w-0 flex-1 items-end" title={text}>
              <span className="sr-only">{text}</span>
              <span
                aria-hidden="true"
                className="block w-full rounded-t-[3px] bg-primary"
                style={{ height: `${peak > 0 ? Math.max(2, (value / peak) * 100) : 0}%` }}
              />
            </li>
          );
        })}
      </ol>
      <figcaption className="mt-2 flex justify-between text-label text-muted-foreground">
        <span>{first ? formatDay(first.day, locale) : null}</span>
        <span className="tabular-nums">
          {peak > 0 ? t`Most in a day: ${formatQuantity(peak, locale)} h` : null}
        </span>
        <span>{last ? formatDay(last.day, locale) : null}</span>
      </figcaption>
    </figure>
  );
}
