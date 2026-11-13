import { Trans, useLingui } from "@lingui/react/macro";
import { isTransitional } from "@rookbox/contracts";
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
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BoxMark } from "../components/BoxMark";
import { CreateMachineDialog } from "../components/CreateMachineDialog";
import { MachineActionsMenu } from "../components/MachineActions";
import { PageHeader } from "../components/PageHeader";
import { useSizeText } from "../components/SizeText";
import { StatusChip } from "../components/StatusChip";
import { orpc, TRANSITION_POLL_MS } from "../lib/api";
import { formatDate, formatRelative } from "../lib/format";

export function MachinesPage() {
  const { t, i18n } = useLingui();
  const sizeText = useSizeText();
  const [creating, setCreating] = useState(false);
  const machines = useQuery(
    orpc.machines.list.queryOptions({
      refetchInterval: (query) =>
        query.state.data?.some((machine) => isTransitional(machine.status))
          ? TRANSITION_POLL_MS
          : false,
    }),
  );

  const newMachine = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" />
      <Trans>New machine</Trans>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<Trans>Machines</Trans>}
        action={machines.data?.length ? newMachine : null}
      />

      {machines.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label={t`Loading`}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : machines.isError ? (
        <p className="text-body1 text-muted-foreground">
          <Trans>Machines didn't load.</Trans>{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => machines.refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </p>
      ) : machines.data.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <BoxMark className="size-12" asleep />
          <p className="text-heading3 font-medium text-foreground">
            <Trans>No machines yet</Trans>
          </p>
          {newMachine}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>Name</Trans>
              </TableHead>
              <TableHead>
                <Trans>Status</Trans>
              </TableHead>
              <TableHead className="max-md:hidden">
                <Trans>Template</Trans>
              </TableHead>
              <TableHead className="max-lg:hidden">
                <Trans>Size</Trans>
              </TableHead>
              <TableHead className="max-sm:hidden">
                <Trans>Created</Trans>
              </TableHead>
              <TableHead className="w-10">
                <span className="sr-only">
                  <Trans>Actions</Trans>
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {machines.data.map((machine) => (
              <TableRow key={machine.id} className="h-13">
                <TableCell>
                  <Link
                    to={`/machines/${machine.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {machine.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={machine.status} />
                </TableCell>
                <TableCell className="font-mono text-body2 text-muted-foreground max-md:hidden">
                  {machine.template}
                </TableCell>
                <TableCell className="text-body2 text-muted-foreground max-lg:hidden">
                  {sizeText(machine.size)}
                </TableCell>
                <TableCell className="text-body2 text-muted-foreground max-sm:hidden">
                  <time
                    dateTime={machine.createdAt}
                    title={formatDate(machine.createdAt, i18n.locale)}
                  >
                    {formatRelative(machine.createdAt, i18n.locale)}
                  </time>
                </TableCell>
                <TableCell className="text-right">
                  <MachineActionsMenu machine={machine} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CreateMachineDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
