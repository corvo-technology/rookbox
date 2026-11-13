import { Trans, useLingui } from "@lingui/react/macro";
import {
  Badge,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { orpc } from "../lib/api";
import { formatDay, formatHours } from "../lib/format";

const DAYS = 14;

export function UsagePage() {
  const { t, i18n } = useLingui();
  const usage = useQuery(orpc.usage.summary.queryOptions({ input: { days: DAYS } }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<Trans>Usage</Trans>}
        action={
          usage.data?.sample ? (
            <Badge variant="outline">
              <Trans>Sample data</Trans>
            </Badge>
          ) : null
        }
      />

      {usage.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : usage.isError ? (
        <p className="text-body1 text-muted-foreground">
          <Trans>Usage didn't load.</Trans>
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-body2 text-muted-foreground">
              <Trans>Machine hours, last {DAYS} days</Trans>
            </span>
            <span className="text-heading1 font-semibold text-foreground tabular-nums">
              {formatHours(usage.data.totalMachineHours, i18n.locale)}
            </span>
          </div>

          <figure
            className="flex h-40 items-end gap-1.5 rounded-xl border border-border bg-card p-4"
            aria-label={t`Machine hours per day`}
          >
            {(() => {
              const max = Math.max(1, ...usage.data.days.map((day) => day.machineHours));
              return usage.data.days.map((day) => (
                <div
                  key={day.date}
                  className="flex-1 rounded-sm bg-foreground/80"
                  style={{ height: `${Math.max(2, (day.machineHours / max) * 100)}%` }}
                  title={`${formatDay(day.date, i18n.locale)}: ${formatHours(day.machineHours, i18n.locale)}`}
                />
              ));
            })()}
          </figure>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Day</Trans>
                </TableHead>
                <TableHead className="text-right">
                  <Trans>Machine hours</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...usage.data.days].reverse().map((day) => (
                <TableRow key={day.date}>
                  <TableCell className="text-body2 text-foreground">
                    {formatDay(day.date, i18n.locale)}
                  </TableCell>
                  <TableCell className="text-right text-body2 text-muted-foreground tabular-nums">
                    {formatHours(day.machineHours, i18n.locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
