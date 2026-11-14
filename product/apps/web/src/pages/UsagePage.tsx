import { Trans, useLingui } from "@lingui/react/macro";
import type { UsagePeriod, UsageSummary } from "@rookbox/contracts";
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminUsage } from "../components/AdminUsage";
import { ErrorNote } from "../components/ErrorNote";
import { PageHeader } from "../components/PageHeader";
import { Panel, Tag } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { UsageChart } from "../components/UsageChart";
import { orpc } from "../lib/api";
import { formatDate, formatMib, formatRelative } from "../lib/format";
import { formatQuantity, toGibHours, toHours } from "../lib/usage-format";

/** Past this long without a report, recent time may be missing from the numbers. */
const QUIET_AFTER_MS = 15 * 60_000;

const head = "text-label font-semibold tracking-[0.06em] uppercase";
const num = "text-right tabular-nums";

function Totals({ summary, locale }: { summary: UsageSummary; locale: string }) {
  const { t } = useLingui();
  const { totals } = summary;
  const q = (value: number) => formatQuantity(value, locale);
  const rest: { label: string; value: string; unit: string }[] = [
    { label: t`Compute`, value: q(toHours(totals.vcpuSeconds)), unit: t`vCPU-hours` },
    {
      label: t`Memory`,
      value: q(toGibHours(totals.memoryMibSeconds)),
      unit: t`GiB-hours, running`,
    },
    {
      label: t`Disk, running`,
      value: q(toGibHours(totals.diskMibSeconds)),
      unit: t`GiB-hours`,
    },
    {
      label: t`Disk, suspended`,
      value: q(toGibHours(totals.suspendedDiskMibSeconds)),
      unit: t`GiB-hours`,
    },
    { label: t`Machines`, value: q(totals.machines), unit: t`in this period` },
  ];
  return (
    <section className="grid gap-x-10 gap-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <h2 className="text-body2 text-muted-foreground">
          <Trans>Machine hours</Trans>
        </h2>
        <p className="m-0 text-[56px] leading-[60px] font-semibold tracking-[-0.04em] tabular-nums">
          {q(toHours(totals.runningSeconds))}
        </p>
        <p className="m-0 mt-1 text-body2 text-muted-foreground">
          <Trans>hours your machines were running</Trans>
        </p>
      </div>
      <dl className="m-0 grid content-center gap-x-8 sm:grid-cols-2">
        {rest.map((item) => (
          <div
            key={item.label}
            className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
          >
            <dt className="text-body2 text-muted-foreground">
              {item.label} <span className="text-label">({item.unit})</span>
            </dt>
            <dd className="m-0 text-body1 font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Precision({ summary, locale }: { summary: UsageSummary; locale: string }) {
  const updated = summary.updatedAt;
  const quiet = updated !== null && Date.now() - Date.parse(updated) > QUIET_AFTER_MS;
  const seconds = summary.measuredEveryS;
  return (
    <p className="max-w-[720px] text-label text-muted-foreground">
      <Trans>
        Measured every {seconds} seconds, so times are accurate to about that. Days are in UTC.
      </Trans>{" "}
      {updated === null ? (
        <Trans>Nothing has been reported yet.</Trans>
      ) : (
        <>
          <Trans>Last report</Trans>{" "}
          <time dateTime={updated} title={formatDate(updated, locale)}>
            {formatRelative(updated, locale)}
          </time>
          .
        </>
      )}{" "}
      {quiet ? <Trans>Reports have stopped, so the latest time may be missing.</Trans> : null}
    </p>
  );
}

function Loaded({ summary, locale }: { summary: UsageSummary; locale: string }) {
  const empty = summary.totals.machines === 0 && summary.running.length === 0;
  if (empty) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <ChartColumn
            className="size-10 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="text-heading3 font-medium text-foreground">
            <Trans>No usage in this period</Trans>
          </p>
          <p className="max-w-[460px] text-body1 text-muted-foreground">
            <Trans>
              Usage shows up here once a machine has run. It can take a minute to appear.
            </Trans>{" "}
            <Link to="/machines" className="text-link underline-offset-4 hover:underline">
              <Trans>Go to machines</Trans>
            </Link>
          </p>
        </div>
        <Precision summary={summary} locale={locale} />
      </>
    );
  }
  const q = (value: number) => formatQuantity(value, locale);
  return (
    <>
      <Totals summary={summary} locale={locale} />

      <Panel title={<Trans>Running time per day</Trans>}>
        <UsageChart days={summary.byDay} locale={locale} />
      </Panel>

      <Panel title={<Trans>Running now</Trans>}>
        {summary.running.length === 0 ? (
          <p className="text-body1 text-muted-foreground">
            <Trans>No machine is running right now.</Trans>
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {summary.running.map((machine) => (
              <li
                key={machine.machineId}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-body1"
              >
                <span className="font-semibold">{machine.name ?? machine.machineId}</span>
                <span className="text-muted-foreground">
                  {machine.vcpu} vCPU · {formatMib(machine.memoryMib, locale)} ·{" "}
                  {formatMib(machine.diskMib, locale)} ·{" "}
                  <time dateTime={machine.since} title={formatDate(machine.since, locale)}>
                    {formatRelative(machine.since, locale)}
                  </time>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={`px-[18px] ${head}`}>
                <Trans>Machine</Trans>
              </TableHead>
              <TableHead className={`${head} max-md:hidden`}>
                <Trans>State</Trans>
              </TableHead>
              <TableHead className={`${head} ${num}`}>
                <Trans>Running h</Trans>
              </TableHead>
              <TableHead className={`${head} ${num} max-md:hidden`}>
                <Trans>vCPU h</Trans>
              </TableHead>
              <TableHead className={`${head} ${num} max-lg:hidden`}>
                <Trans>Memory GiB h</Trans>
              </TableHead>
              <TableHead className={`${head} ${num} max-lg:hidden`}>
                <Trans>Disk GiB h</Trans>
              </TableHead>
              <TableHead className={`${head} ${num} pr-[18px]`}>
                <Trans>Suspended disk GiB h</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.byMachine.map((machine) => (
              <TableRow key={machine.machineId}>
                <TableCell className="px-[18px] font-semibold">
                  {machine.name ?? machine.machineId}
                  {machine.state === "deleted" ? (
                    <span className="ml-2 text-label font-normal text-muted-foreground">
                      <Trans>deleted</Trans>
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="max-md:hidden">
                  {machine.state === "running" ? (
                    <Trans>Running</Trans>
                  ) : machine.state === "suspended" ? (
                    <Trans>Suspended</Trans>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className={num}>{q(toHours(machine.runningSeconds))}</TableCell>
                <TableCell className={`${num} max-md:hidden`}>
                  {q(toHours(machine.vcpuSeconds))}
                </TableCell>
                <TableCell className={`${num} max-lg:hidden`}>
                  {q(toGibHours(machine.memoryMibSeconds))}
                </TableCell>
                <TableCell className={`${num} max-lg:hidden`}>
                  {q(toGibHours(machine.diskMibSeconds))}
                </TableCell>
                <TableCell className={`${num} pr-[18px]`}>
                  {q(toGibHours(machine.suspendedDiskMibSeconds))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Precision summary={summary} locale={locale} />
    </>
  );
}

/** What each machine used, measured from how long it ran at what size. No prices. */
export function UsagePage() {
  const { t, i18n } = useLingui();
  const [period, setPeriod] = useState<UsagePeriod>("30d");
  const usage = useQuery(orpc.usage.summary.queryOptions({ input: { period } }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={<Trans>Usage and billing</Trans>}
        action={
          usage.data?.sample ? (
            <Tag>
              <Trans>Sample data</Trans>
            </Tag>
          ) : null
        }
      />
      <Segmented
        label={t`Period`}
        value={period}
        onChange={setPeriod}
        options={[
          { value: "7d", label: t`7 days` },
          { value: "30d", label: t`30 days` },
          { value: "month", label: t`This month` },
        ]}
      />
      {usage.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label={t`Loading`}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : usage.isError ? (
        <ErrorNote error={usage.error} onRetry={() => usage.refetch()} />
      ) : (
        <Loaded summary={usage.data} locale={i18n.locale} />
      )}
      <AdminUsage period={period} locale={i18n.locale} />
      <p className="text-label text-muted-foreground">
        <Trans>Billing is not enabled yet; usage is measured.</Trans>
      </p>
    </div>
  );
}
