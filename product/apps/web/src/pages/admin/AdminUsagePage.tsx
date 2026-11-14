import { Trans, useLingui } from "@lingui/react/macro";
import type { UsagePeriod } from "@rookbox/contracts";
import { Skeleton } from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminUsage } from "../../components/AdminUsage";
import { ErrorNote } from "../../components/ErrorNote";
import { PageHeader } from "../../components/PageHeader";
import { Segmented } from "../../components/Segmented";
import { orpc } from "../../lib/api";
import { formatDate, formatRelative } from "../../lib/format";

/** Everyone's usage: per user, per customer app, and what has no owner. */
export function AdminUsagePage() {
  const { t, i18n } = useLingui();
  const [period, setPeriod] = useState<UsagePeriod>("30d");
  const usage = useQuery({ ...orpc.admin.usage.queryOptions({ input: { period } }), retry: false });
  const contact = usage.data?.reporter.lastContactAt ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={<Trans>Usage by user and customer</Trans>}
        action={
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
        }
      />
      {usage.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label={t`Loading`}>
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : usage.isError ? (
        <ErrorNote error={usage.error} onRetry={() => usage.refetch()} />
      ) : (
        <>
          <p className="max-w-[720px] text-label text-muted-foreground">
            {contact ? (
              <>
                <Trans>The meter last reported</Trans>{" "}
                <time dateTime={contact} title={formatDate(contact, i18n.locale)}>
                  {formatRelative(contact, i18n.locale)}
                </time>
                .{" "}
              </>
            ) : (
              <Trans>The meter has not reported yet.</Trans>
            )}
            {usage.data.reporter.stale ? (
              <Trans>Reports have stopped, so the latest time may be missing.</Trans>
            ) : null}
          </p>
          <AdminUsage period={period} locale={i18n.locale} />
        </>
      )}
    </div>
  );
}
