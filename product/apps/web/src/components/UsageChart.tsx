import { Trans, useLingui } from "@lingui/react/macro";
import type { UsageDay } from "@rookbox/contracts";
import { formatDay, formatQuantity, niceScale, toHours } from "../lib/usage-format";

/**
 * Machine-hours running per day, as bars on a labelled 0-to-top scale. The bars are decoration
 * for the eye; each day is also a list item with its value in words, so a screen reader gets the
 * same numbers.
 */
export function UsageChart({ days, locale }: { days: readonly UsageDay[]; locale: string }) {
  const { t } = useLingui();
  const hours = days.map((day) => toHours(day.runningSeconds));
  const peak = Math.max(...hours, 0);
  const first = days[0];
  const last = days.at(-1);

  if (peak === 0) {
    return (
      <p className="m-0 flex h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-body1 text-muted-foreground">
        <Trans>No machine ran on these days.</Trans>
      </p>
    );
  }

  const { max, ticks } = niceScale(peak);
  return (
    <figure className="m-0">
      <div className="flex gap-3">
        <div
          aria-hidden="true"
          className="relative h-40 w-9 shrink-0 text-right text-label text-muted-foreground tabular-nums"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2 leading-none"
              style={{ bottom: `${(tick / max) * 100}%` }}
            >
              {formatQuantity(tick, locale)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${(tick / max) * 100}%` }}
            />
          ))}
          <ol
            className="relative m-0 flex h-40 list-none items-end gap-[3px] p-0"
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
                    style={{ height: `${value > 0 ? Math.max(1.5, (value / max) * 100) : 0}%` }}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <figcaption className="mt-2 flex justify-between pl-12 text-label text-muted-foreground">
        <span>{first ? formatDay(first.day, locale) : null}</span>
        <span>
          <Trans>Hours per day</Trans>
        </span>
        <span>{last ? formatDay(last.day, locale) : null}</span>
      </figcaption>
    </figure>
  );
}
