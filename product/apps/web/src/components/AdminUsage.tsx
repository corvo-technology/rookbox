import { Trans } from "@lingui/react/macro";
import type { UsagePeriod, UsageTotals } from "@rookbox/contracts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { formatQuantity, toGibHours, toHours } from "../lib/usage-format";
import { Panel } from "./Panel";

const head = "text-label font-semibold tracking-[0.06em] uppercase";
const num = "text-right tabular-nums";

type Row = UsageTotals & { key: string; label: string; machinesNow?: number };

function Rows({ rows, locale, withNow }: { rows: Row[]; locale: string; withNow?: boolean }) {
  const q = (value: number) => formatQuantity(value, locale);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={head}>
            <Trans>Name</Trans>
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
          <TableHead className={`${head} ${num}`}>
            <Trans>Machines</Trans>
          </TableHead>
          {withNow ? (
            <TableHead className={`${head} ${num}`}>
              <Trans>Running now</Trans>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="font-semibold">{row.label}</TableCell>
            <TableCell className={num}>{q(toHours(row.runningSeconds))}</TableCell>
            <TableCell className={`${num} max-md:hidden`}>{q(toHours(row.vcpuSeconds))}</TableCell>
            <TableCell className={`${num} max-lg:hidden`}>
              {q(toGibHours(row.memoryMibSeconds))}
            </TableCell>
            <TableCell className={`${num} max-lg:hidden`}>
              {q(toGibHours(row.diskMibSeconds))}
            </TableCell>
            <TableCell className={num}>{q(row.machines)}</TableCell>
            {withNow ? <TableCell className={num}>{q(row.machinesNow ?? 0)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Everyone's usage, for admins: dashboard users, customer apps and machines with no owner. A
 * person who is not an admin gets a refusal from the API, and then nothing is drawn.
 */
export function AdminUsage({ period, locale }: { period: UsagePeriod; locale: string }) {
  const admin = useQuery({
    ...orpc.admin.usage.queryOptions({ input: { period } }),
    retry: false,
  });
  if (!admin.data) return null;
  const { users, customers, unassigned } = admin.data;
  return (
    <>
      <Panel title={<Trans>Customers</Trans>}>
        {customers.length === 0 ? (
          <p className="text-body1 text-muted-foreground">
            <Trans>No customer app has used machines in this period.</Trans>
          </p>
        ) : (
          <Rows
            withNow
            locale={locale}
            rows={customers.map((c) => ({ ...c, key: c.customerId, label: c.customerId }))}
          />
        )}
      </Panel>
      <Panel title={<Trans>Users</Trans>}>
        {users.length === 0 ? (
          <p className="text-body1 text-muted-foreground">
            <Trans>No user has used machines in this period.</Trans>
          </p>
        ) : (
          <Rows
            locale={locale}
            rows={users.map((u) => ({ ...u, key: u.userId, label: u.email ?? u.userId }))}
          />
        )}
      </Panel>
      <Panel title={<Trans>Unassigned</Trans>}>
        <Rows locale={locale} rows={[{ ...unassigned, key: "unassigned", label: "-" }]} />
      </Panel>
    </>
  );
}
