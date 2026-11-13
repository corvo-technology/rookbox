import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { orpc } from "../lib/api";
import { chartCeiling, formatDay, formatDayShort, formatHours } from "../lib/format";

const PERIODS = [7, 14, 30] as const;
type Period = (typeof PERIODS)[number];

const W = 760;
const H = 270;
const LEFT = 44;
const RIGHT = 750;
const TOP = 30;
const BASE = 230;

function Chart({
  days,
  label,
  locale,
}: {
  days: { date: string; machineHours: number }[];
  label: string;
  locale: string;
}) {
  const ceiling = chartCeiling(Math.max(0, ...days.map((day) => day.machineHours)));
  const slot = (RIGHT - LEFT) / days.length;
  const barWidth = Math.min(32, slot * 0.64);
  const every = Math.ceil(days.length / 14);
  const y = (value: number) => BASE - (value / ceiling) * (BASE - TOP);
  const grid = [0, 1, 2, 3, 4].map((step) => (ceiling / 4) * step);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full text-link"
    >
      {grid.map((value) => (
        <g key={value}>
          <line
            x1={LEFT}
            x2={RIGHT}
            y1={y(value)}
            y2={y(value)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={LEFT - 8}
            y={y(value) + 4}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={12}
          >
            {formatHours(value, locale)}
          </text>
        </g>
      ))}
      {days.map((day, index) => {
        const x = LEFT + slot * index + (slot - barWidth) / 2;
        const height = Math.max(2, BASE - y(day.machineHours));
        return (
          <g key={day.date}>
            <rect
              x={x}
              y={BASE - height}
              width={barWidth}
              height={height}
              rx={4}
              fill="currentColor"
            >
              <title>{`${formatDay(day.date, locale)}: ${formatHours(day.machineHours, locale)}`}</title>
            </rect>
            {index % every === 0 ? (
              <text
                x={x + barWidth / 2}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={12}
              >
                {formatDayShort(day.date, locale)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function UsagePage() {
  const { t, i18n } = useLingui();
  const [period, setPeriod] = useState<Period>(14);
  const usage = useQuery(orpc.usage.summary.queryOptions({ input: { days: period } }));
  const machines = useQuery(orpc.machines.list.queryOptions());

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={<Trans>Usage and billing</Trans>}
        action={
          <Segmented
            label={t`Period`}
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((days) => ({ value: days, label: t`${days} days` }))}
          />
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-5">
        <Panel
          title={<Trans>Running time</Trans>}
          action={
            usage.data ? (
              <div className="text-right">
                <span className="block text-label text-muted-foreground">
                  <Trans>{period} day total</Trans>
                </span>
                <strong className="block text-[26px] leading-8 tracking-[-0.03em] tabular-nums">
                  {formatHours(usage.data.totalMachineHours, i18n.locale)} h
                </strong>
              </div>
            ) : null
          }
        >
          <p className="mb-2 text-label text-muted-foreground">
            <Trans>Machine-hours per day. Billed per second, shown per day.</Trans>
            {usage.data?.sample ? (
              <>
                {" "}
                <Trans>Sample data.</Trans>
              </>
            ) : null}
          </p>
          {usage.isPending ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : usage.isError ? (
            <p className="text-body1 text-muted-foreground">
              <Trans>Usage didn't load.</Trans>
            </p>
          ) : (
            <>
              <Chart
                days={usage.data.days}
                locale={i18n.locale}
                label={(() => {
                  const hours = usage.data.days.map((day) => day.machineHours);
                  const low = formatHours(Math.min(...hours), i18n.locale);
                  const high = formatHours(Math.max(...hours), i18n.locale);
                  const count = hours.length;
                  return t`Bar chart of running machine-hours per day over ${count} days. Lowest day ${low}, highest day ${high}.`;
                })()}
              />
              <p className="text-label text-muted-foreground">
                <Trans>Sample data, not real usage.</Trans>
              </p>
            </>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title={<Trans>Plan</Trans>}
            action={
              <span className="inline-flex items-center gap-[7px] rounded-full bg-link/15 py-[3px] pr-[11px] pl-[9px] text-body2 font-semibold text-link">
                <span aria-hidden="true" className="size-[7px] rounded-full bg-current" />
                <Trans>Active</Trans>
              </span>
            }
          >
            {/* Placeholders: the plan, its price and its limits are not defined yet. */}
            <p className="text-2xl font-semibold tracking-[-0.03em]">[PLAN NAME]</p>
            <p className="mt-1 text-label text-muted-foreground">
              <Trans>[PRICE] per month plus usage. Renews [DATE].</Trans>
            </p>
            <dl className="mt-4 mb-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-body1">
              <dt className="text-muted-foreground">
                <Trans>Machines</Trans>
              </dt>
              <dd className="m-0 text-right">[LIMIT]</dd>
              <dt className="text-muted-foreground">
                <Trans>Running at once</Trans>
              </dt>
              <dd className="m-0 text-right">[LIMIT]</dd>
              <dt className="text-muted-foreground">
                <Trans>Snapshots</Trans>
              </dt>
              <dd className="m-0 text-right">[LIMIT]</dd>
            </dl>
            <Button disabled className="mt-4.5 h-11 w-full text-body1 font-semibold">
              <Trans>Upgrade plan</Trans>
            </Button>
          </Panel>

          <Panel title={<Trans>Credits</Trans>}>
            <p className="text-2xl font-semibold tracking-[-0.03em]">
              <Trans>[CREDITS] remaining</Trans>
            </p>
            <div
              role="img"
              aria-label={t`Sample: 62 percent of credits remaining`}
              className="mt-3 h-2.5 overflow-hidden rounded-[5px] border border-border bg-accent"
            >
              <span className="block h-full w-[62%] bg-link" />
            </div>
            <p className="mt-2 text-label text-muted-foreground">
              <Trans>Used first, then the card on file is charged. Sample meter.</Trans>
            </p>
            <Button
              variant="outline"
              disabled
              className="mt-3.5 h-11 px-4.5 text-body1 font-semibold"
            >
              <Trans>Add credits</Trans>
            </Button>
          </Panel>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="px-5 pt-[18px] pb-1.5 text-heading3 font-semibold">
          <Trans>By machine</Trans>
        </h2>
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow>
              <TableHead className="px-5 text-label font-semibold tracking-[0.06em] uppercase">
                <Trans>Machine</Trans>
              </TableHead>
              <TableHead className="text-label font-semibold tracking-[0.06em] uppercase">
                <Trans>Running time</Trans>
              </TableHead>
              <TableHead className="text-label font-semibold tracking-[0.06em] uppercase">
                <Trans>Suspended time</Trans>
              </TableHead>
              <TableHead className="px-5 text-right text-label font-semibold tracking-[0.06em] uppercase">
                <Trans>Cost</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(machines.data ?? []).slice(0, 5).map((machine) => (
              <TableRow key={machine.id}>
                <TableCell className="px-5 font-semibold">{machine.name}</TableCell>
                <TableCell className="text-muted-foreground">[HH:MM:SS]</TableCell>
                <TableCell className="text-muted-foreground">[HH:MM:SS]</TableCell>
                <TableCell className="px-5 text-right text-muted-foreground">[COST]</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <p className="text-label text-muted-foreground">
        <Trans>Sample data. Rates and totals are placeholders.</Trans>
      </p>
    </div>
  );
}
