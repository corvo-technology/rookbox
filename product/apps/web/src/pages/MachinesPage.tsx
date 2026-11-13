import { Trans, useLingui } from "@lingui/react/macro";
import { isTransitional } from "@rookbox/contracts";
import {
  Button,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Plus, Server } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CreateMachineDialog } from "../components/CreateMachineDialog";
import { MachineActionsMenu, MachineRowActions } from "../components/MachineActions";
import { PageHeader } from "../components/PageHeader";
import { Segmented } from "../components/Segmented";
import { useShortSizeText } from "../components/SizeText";
import { StatusChip } from "../components/StatusChip";
import { orpc, TRANSITION_POLL_MS } from "../lib/api";
import { formatDate, formatRelative } from "../lib/format";
import type { StateFilter } from "../lib/machine-filter";
import { countByStatus, filterMachines } from "../lib/machine-filter";
import { FILTER_INPUT_ID } from "../lib/site";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-3 py-3 sm:px-[18px] sm:py-4">
      <span className="text-body2 text-muted-foreground">{label}</span>
      <strong className="block text-[28px] leading-9 font-semibold tracking-[-0.03em] tabular-nums">
        {value}
      </strong>
    </div>
  );
}

export function MachinesPage() {
  const { t, i18n } = useLingui();
  const sizeText = useShortSizeText();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const machines = useQuery(
    orpc.machines.list.queryOptions({
      refetchInterval: (query) =>
        query.state.data?.some((machine) => isTransitional(machine.status))
          ? TRANSITION_POLL_MS
          : false,
    }),
  );

  const newMachine = (
    <Button className="h-11 px-[18px] text-body1 font-semibold" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" />
      <Trans>New machine</Trans>
    </Button>
  );

  const all = machines.data ?? [];
  const rows = filterMachines(all, query, state);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={<Trans>Machines</Trans>} action={all.length ? newMachine : null} />

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
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <Server className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-heading3 font-medium text-foreground">
            <Trans>No machines yet</Trans>
          </p>
          {newMachine}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
            <Stat label={t`Running`} value={countByStatus(all, "running")} />
            <Stat label={t`Suspended`} value={countByStatus(all, "suspended")} />
            <Stat label={t`Total`} value={all.length} />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor={FILTER_INPUT_ID} className="sr-only">
              <Trans>Filter machines</Trans>
            </label>
            <Input
              id={FILTER_INPUT_ID}
              type="search"
              autoComplete="off"
              className="h-11 max-w-sm min-w-[220px] flex-1 px-3.5 text-body1"
              placeholder={t`Filter by name or id`}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <Segmented
              label={t`State filter`}
              value={state}
              onChange={setState}
              options={[
                { value: "all", label: t`All` },
                { value: "running", label: t`Running` },
                { value: "suspended", label: t`Suspended` },
              ]}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-[18px] text-label font-semibold tracking-[0.06em] uppercase">
                    <Trans>Name</Trans>
                  </TableHead>
                  <TableHead className="text-label font-semibold tracking-[0.06em] uppercase">
                    <Trans>Status</Trans>
                  </TableHead>
                  <TableHead className="text-label font-semibold tracking-[0.06em] uppercase max-md:hidden">
                    <Trans>Template</Trans>
                  </TableHead>
                  <TableHead className="text-label font-semibold tracking-[0.06em] uppercase max-lg:hidden">
                    <Trans>Size</Trans>
                  </TableHead>
                  <TableHead className="text-label font-semibold tracking-[0.06em] uppercase max-xl:hidden">
                    <Trans>Created</Trans>
                  </TableHead>
                  <TableHead className="w-10 md:w-auto">
                    <span className="sr-only">
                      <Trans>Actions</Trans>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((machine) => (
                  <TableRow key={machine.id} className="h-16">
                    <TableCell className="px-[18px]">
                      <Link
                        to={`/machines/${machine.id}`}
                        className="font-semibold text-foreground underline-offset-4 hover:text-link hover:underline"
                      >
                        {machine.name}
                      </Link>
                      <span className="block font-mono text-label text-muted-foreground">
                        {machine.id}
                      </span>
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
                    <TableCell className="text-body2 text-muted-foreground max-xl:hidden">
                      <time
                        dateTime={machine.createdAt}
                        title={formatDate(machine.createdAt, i18n.locale)}
                      >
                        {formatRelative(machine.createdAt, i18n.locale)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="max-md:hidden">
                        <MachineRowActions machine={machine} />
                      </div>
                      <div className="md:hidden">
                        <MachineActionsMenu machine={machine} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 ? (
              <p className="p-10 text-center text-muted-foreground">
                <Trans>No machines match.</Trans>
              </p>
            ) : null}
          </div>
          <p className="text-label text-muted-foreground">
            <Trans>Sample data. Fork copies the disk, not memory.</Trans>
          </p>
        </>
      )}

      <CreateMachineDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
