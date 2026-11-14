import { Trans, useLingui } from "@lingui/react/macro";
import type { AdminMachine } from "@rookbox/contracts";
import { canPerform, isTransitional } from "@rookbox/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@rookbox/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Server } from "lucide-react";
import { useState } from "react";
import { ErrorNote, useToastError } from "../../components/ErrorNote";
import { PageHeader } from "../../components/PageHeader";
import { useShortSizeText } from "../../components/SizeText";
import { StatusChip } from "../../components/StatusChip";
import { orpc } from "../../lib/api";
import { formatDate, formatRelative } from "../../lib/format";

const head = "text-label font-semibold tracking-[0.06em] uppercase";

type Pending = { machine: AdminMachine; action: "suspend" | "delete" } | null;

function matches(machine: AdminMachine, query: string) {
  const needle = query.trim().toLowerCase();
  return (
    needle === "" ||
    machine.name.toLowerCase().includes(needle) ||
    machine.id.toLowerCase().includes(needle) ||
    (machine.ownerEmail ?? "").toLowerCase().includes(needle)
  );
}

export function AdminMachinesPage() {
  const { t, i18n } = useLingui();
  const sizeText = useShortSizeText();
  const toastError = useToastError();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<Pending>(null);
  const machines = useQuery({
    ...orpc.admin.machines.list.queryOptions({
      refetchInterval: (q) =>
        q.state.data?.some((m) => isTransitional(m.status)) ? 2_000 : 10_000,
    }),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.admin.machines.key() });
  const suspend = useMutation(
    orpc.admin.machines.suspend.mutationOptions({
      onError: toastError,
      onSuccess: () => toast.success(t`The machine is suspended.`),
      onSettled: refresh,
    }),
  );
  const remove = useMutation(
    orpc.admin.machines.delete.mutationOptions({
      onError: toastError,
      onSuccess: () => toast.success(t`The machine is deleted.`),
      onSettled: refresh,
    }),
  );
  const busy = (id: string) =>
    (suspend.isPending && suspend.variables?.id === id) ||
    (remove.isPending && remove.variables?.id === id);

  const all = machines.data ?? [];
  const rows = all.filter((machine) => matches(machine, query));

  const target = confirm?.machine;
  const name = target?.name ?? "";
  const owner = target?.ownerEmail ?? t`an unknown account`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={<Trans>All machines</Trans>} />
      {machines.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label={t`Loading`}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : machines.isError ? (
        <ErrorNote error={machines.error} onRetry={() => machines.refetch()} />
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <Server className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-heading3 font-medium text-foreground">
            <Trans>No machines on the server</Trans>
          </p>
          <p className="max-w-[420px] text-body1 text-muted-foreground">
            <Trans>Machines that people create show up here, with who owns them.</Trans>
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="admin-machine-filter" className="sr-only">
              <Trans>Filter machines</Trans>
            </label>
            <Input
              id="admin-machine-filter"
              type="search"
              autoComplete="off"
              className="h-11 max-w-sm min-w-[220px] flex-1 px-3.5 text-body1"
              placeholder={t`Filter by owner, name or id`}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <p className="text-body2 text-muted-foreground">
              <Trans>Total: {all.length}</Trans>
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={`px-[18px] ${head}`}>
                    <Trans>Machine</Trans>
                  </TableHead>
                  <TableHead className={head}>
                    <Trans>Owner</Trans>
                  </TableHead>
                  <TableHead className={head}>
                    <Trans>Status</Trans>
                  </TableHead>
                  <TableHead className={`${head} max-lg:hidden`}>
                    <Trans>Size</Trans>
                  </TableHead>
                  <TableHead className={`${head} max-md:hidden`}>
                    <Trans>Age</Trans>
                  </TableHead>
                  <TableHead>
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
                      <span className="block font-semibold text-foreground">{machine.name}</span>
                      <span className="block font-mono text-label text-muted-foreground">
                        {machine.id}
                      </span>
                    </TableCell>
                    <TableCell className="text-body2">
                      {machine.ownerEmail ?? (
                        <span className="text-muted-foreground">
                          <Trans>Unknown account</Trans>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={machine.status} />
                    </TableCell>
                    <TableCell className="text-body2 text-muted-foreground max-lg:hidden">
                      {sizeText(machine.size)}
                    </TableCell>
                    <TableCell className="text-body2 text-muted-foreground max-md:hidden">
                      <time
                        dateTime={machine.createdAt}
                        title={formatDate(machine.createdAt, i18n.locale)}
                      >
                        {formatRelative(machine.createdAt, i18n.locale)}
                      </time>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canPerform(machine.status, "suspend") ? (
                          <Button
                            variant="outline"
                            className="h-11 px-3 text-body2 font-semibold"
                            aria-label={t`Suspend ${machine.name}`}
                            disabled={busy(machine.id)}
                            onClick={() => setConfirm({ machine, action: "suspend" })}
                          >
                            {suspend.isPending && suspend.variables?.id === machine.id ? (
                              <Spinner aria-hidden="true" />
                            ) : null}
                            <Trans>Suspend</Trans>
                          </Button>
                        ) : null}
                        {canPerform(machine.status, "delete") ? (
                          <Button
                            variant="outline"
                            className="h-11 px-3 text-body2 font-semibold text-destructive"
                            aria-label={t`Delete ${machine.name}`}
                            disabled={busy(machine.id)}
                            onClick={() => setConfirm({ machine, action: "delete" })}
                          >
                            {remove.isPending && remove.variables?.id === machine.id ? (
                              <Spinner aria-hidden="true" />
                            ) : null}
                            <Trans>Delete</Trans>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <p className="text-muted-foreground">
                  <Trans>No machines match.</Trans>
                </p>
                <Button variant="outline" className="h-11 px-3.5" onClick={() => setQuery("")}>
                  <Trans>Clear the filter</Trans>
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "delete" ? (
                <Trans>Delete {name}?</Trans>
              ) : (
                <Trans>Suspend {name}?</Trans>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "delete" ? (
                <Trans>
                  This machine belongs to {owner}. Its disk and saved memory are deleted for good.
                  This can't be undone.
                </Trans>
              ) : (
                <Trans>
                  This machine belongs to {owner}. Its memory is saved and it stops running. They
                  can restore it later.
                </Trans>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!confirm) return;
                const id = confirm.machine.id;
                if (confirm.action === "delete") remove.mutate({ id });
                else suspend.mutate({ id });
                setConfirm(null);
              }}
            >
              {confirm?.action === "delete" ? (
                <Trans>Delete machine</Trans>
              ) : (
                <Trans>Suspend machine</Trans>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
