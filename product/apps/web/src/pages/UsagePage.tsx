import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { Panel, Tag } from "../components/Panel";
import { orpc } from "../lib/api";

/**
 * Usage and billing are not measured yet, so this screen shows no numbers. The one figure it
 * does show, how many machines there are now, comes straight from the machines list.
 */
export function UsagePage() {
  const machines = useQuery(orpc.machines.list.queryOptions());
  const all = machines.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<Trans>Usage and billing</Trans>}
        action={
          <Tag>
            <Trans>Coming soon</Trans>
          </Tag>
        }
      />
      <Panel title={<Trans>Machine hours and billing</Trans>}>
        <p className="max-w-[640px] text-body1 text-muted-foreground">
          <Trans>
            Machine hours, plans and invoices are coming soon. Nothing is measured or billed yet, so
            there are no numbers to show here.
          </Trans>
        </p>
      </Panel>
      {all ? (
        <Panel title={<Trans>Right now</Trans>}>
          <dl className="m-0 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 text-body1">
            <dt className="text-muted-foreground">
              <Trans>Running</Trans>
            </dt>
            <dd className="m-0 text-right tabular-nums">
              {all.filter((machine) => machine.status === "running").length}
            </dd>
            <dt className="text-muted-foreground">
              <Trans>Suspended</Trans>
            </dt>
            <dd className="m-0 text-right tabular-nums">
              {all.filter((machine) => machine.status === "suspended").length}
            </dd>
            <dt className="text-muted-foreground">
              <Trans>Total</Trans>
            </dt>
            <dd className="m-0 text-right tabular-nums">{all.length}</dd>
          </dl>
        </Panel>
      ) : null}
    </div>
  );
}
