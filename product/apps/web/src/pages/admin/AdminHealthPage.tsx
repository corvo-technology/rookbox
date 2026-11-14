import { Trans, useLingui } from "@lingui/react/macro";
import type { AdminHealth } from "@rookbox/contracts";
import { Button, cn, Skeleton, Spinner } from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { ErrorNote } from "../../components/ErrorNote";
import { PageHeader } from "../../components/PageHeader";
import { formatSpan } from "../../lib/admin";
import { orpc } from "../../lib/api";
import { formatDate, formatRelative } from "../../lib/format";

type Tone = "ok" | "warn" | "bad";

const DOT: Record<Tone, string> = {
  ok: "bg-link",
  warn: "bg-warning",
  bad: "bg-destructive",
};

function Light({
  title,
  tone,
  headline,
  children,
}: {
  title: ReactNode;
  tone: Tone;
  headline: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-body2 text-muted-foreground">{title}</h2>
      <p className="flex items-center gap-2.5 text-heading3 font-semibold">
        <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", DOT[tone])} />
        {headline}
      </p>
      {children ? <p className="text-body2 text-muted-foreground">{children}</p> : null}
    </section>
  );
}

function Meter({ label, used, max }: { label: ReactNode; used: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const full = max > 0 && used >= max;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-body1">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {max > 0 ? `${used} / ${max}` : used}
        </span>
      </div>
      {max > 0 ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.min(used, max)}
          className="h-2 overflow-hidden rounded-full bg-accent"
        >
          <div
            className={cn("h-full rounded-full", full ? "bg-destructive" : "bg-link")}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Lights({ health, locale }: { health: AdminHealth; locale: string }) {
  const { host, reporter, capacity } = health;
  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Light title={<Trans>API</Trans>} tone="ok" headline={<Trans>Running</Trans>}>
          <Trans>Up for {formatSpan(health.api.uptimeS)}</Trans>
        </Light>
        <Light
          title={<Trans>Database</Trans>}
          tone={health.db.ok ? "ok" : "bad"}
          headline={health.db.ok ? <Trans>Answering</Trans> : <Trans>Not answering</Trans>}
        >
          {health.db.ok ? null : (
            <Trans>Accounts and machines can't be read until it is back.</Trans>
          )}
        </Light>
        <Light
          title={<Trans>Machine service</Trans>}
          tone={host.ok ? "ok" : "bad"}
          headline={
            host.ok ? (
              <Trans>Answering</Trans>
            ) : !host.reachable ? (
              <Trans>Can't be reached</Trans>
            ) : host.auth === "rejected" ? (
              <Trans>Key rejected</Trans>
            ) : host.auth === "missing" ? (
              <Trans>No key set</Trans>
            ) : (
              <Trans>Not healthy</Trans>
            )
          }
        >
          {host.ok ? (
            <Trans>Answered in {host.ms} ms</Trans>
          ) : host.auth === "rejected" || host.auth === "missing" ? (
            <Trans>Fix the service key on the API, then check again.</Trans>
          ) : (
            <Trans>New machines can't be created until it is back.</Trans>
          )}
        </Light>
        <Light
          title={<Trans>Usage meter</Trans>}
          tone={
            reporter === null ? "warn" : reporter.stale || !reporter.lastContactAt ? "bad" : "ok"
          }
          headline={
            reporter === null ? (
              <Trans>Off</Trans>
            ) : !reporter.lastContactAt ? (
              <Trans>Never reported</Trans>
            ) : reporter.stale ? (
              <Trans>Gone quiet</Trans>
            ) : (
              <Trans>Reporting</Trans>
            )
          }
        >
          {reporter?.lastContactAt ? (
            <>
              <Trans>Last seen</Trans>{" "}
              <time
                dateTime={reporter.lastContactAt}
                title={formatDate(reporter.lastContactAt, locale)}
              >
                {formatRelative(reporter.lastContactAt, locale)}
              </time>
              {reporter.stale ? (
                <>
                  {" "}
                  <Trans>Running time is not accruing until it is back.</Trans>
                </>
              ) : null}
            </>
          ) : reporter === null ? (
            <Trans>Usage is not being recorded on this server.</Trans>
          ) : (
            <Trans>Check that the reporter is running and has the signing secret.</Trans>
          )}
        </Light>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-heading3 font-semibold">
          <Trans>Capacity</Trans>
        </h2>
        {capacity === null ? (
          <p className="text-body1 text-muted-foreground">
            <Trans>
              Machines can't be counted right now because the machine service didn't answer.
            </Trans>
          </p>
        ) : (
          <>
            <Meter
              label={<Trans>Running machines</Trans>}
              used={capacity.running}
              max={capacity.maxRunning}
            />
            <div className="grid gap-x-8 gap-y-1 text-body1 sm:grid-cols-3">
              <p>
                <span className="text-muted-foreground">
                  <Trans>Suspended</Trans>
                </span>{" "}
                <strong className="tabular-nums">{capacity.suspended}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">
                  <Trans>Machine records</Trans>
                </span>{" "}
                <strong className="tabular-nums">{capacity.rows}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">
                  <Trans>Limit per account</Trans>
                </span>{" "}
                <strong className="tabular-nums">{capacity.maxPerUser}</strong>
              </p>
            </div>
            {capacity.maxRunning > 0 && capacity.running >= capacity.maxRunning ? (
              <p className="text-body2 text-warning">
                <Trans>The beta is full: new machines and restores are turned away.</Trans>
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

export function AdminHealthPage() {
  const { t, i18n } = useLingui();
  const health = useQuery({
    ...orpc.admin.health.queryOptions(),
    refetchInterval: 15_000,
    retry: false,
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={<Trans>Health</Trans>}
        action={
          <Button
            variant="outline"
            className="h-11 px-3.5 text-body1 font-semibold"
            disabled={health.isFetching}
            onClick={() => health.refetch()}
          >
            {health.isFetching ? <Spinner aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            <Trans>Check again</Trans>
          </Button>
        }
      />
      {health.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label={t`Loading`}>
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : health.isError ? (
        <ErrorNote error={health.error} onRetry={() => health.refetch()} />
      ) : (
        <>
          <Lights health={health.data} locale={i18n.locale} />
          <p className="text-label text-muted-foreground">
            <Trans>Checked</Trans>{" "}
            <time dateTime={health.data.at} title={formatDate(health.data.at, i18n.locale)}>
              {formatRelative(health.data.at, i18n.locale)}
            </time>
            . <Trans>This page refreshes by itself every 15 seconds.</Trans>
          </p>
        </>
      )}
    </div>
  );
}
