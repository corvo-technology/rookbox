import { Trans, useLingui } from "@lingui/react/macro";
import type { Machine, MachineAction } from "@rookbox/contracts";
import { canPerform } from "@rookbox/contracts";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@rookbox/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, GitFork, Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { orpc } from "../lib/api";

/** Suspend, restore, fork and delete, each refreshing every machine screen when it lands. */
export function useMachineActions() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.machines.key() });
  const failed = () => toast.error(t`That didn't work. Try again.`);

  const suspend = useMutation(
    orpc.machines.suspend.mutationOptions({
      onSettled: refresh,
      onError: failed,
      onSuccess: ({ name }) => toast.success(t`Suspending ${name}, memory is being saved`),
    }),
  );
  const restore = useMutation(
    orpc.machines.restore.mutationOptions({
      onSettled: refresh,
      onError: failed,
      onSuccess: ({ name }) => toast.success(t`Restoring ${name}`),
    }),
  );
  const fork = useMutation(
    orpc.machines.fork.mutationOptions({
      onSettled: refresh,
      onError: failed,
      onSuccess: ({ name }) =>
        toast.success(t`Forked into ${name}. The disk was copied, not memory.`),
    }),
  );
  const remove = useMutation(
    orpc.machines.delete.mutationOptions({ onSettled: refresh, onError: failed }),
  );

  const run = (action: Exclude<MachineAction, "delete">, machine: Machine) => {
    if (action === "suspend") suspend.mutate({ id: machine.id });
    if (action === "restore") restore.mutate({ id: machine.id });
    if (action === "fork") fork.mutate({ id: machine.id });
  };

  return { run, remove, pending: suspend.isPending || restore.isPending || fork.isPending };
}

/** The "Delete" dialog says what is lost, so a confirm button is not a reflex. */
export function DeleteMachineDialog({
  machine,
  open,
  onOpenChange,
  onDeleted,
}: {
  machine: Machine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { t } = useLingui();
  const { remove } = useMachineActions();
  const { name } = machine;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Delete {name}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Its disk and saved memory are deleted. This can't be undone.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              remove.mutate(
                { id: machine.id },
                {
                  onSuccess: () => {
                    toast.success(t`${name} deleted`);
                    onDeleted?.();
                  },
                },
              );
              onOpenChange(false);
            }}
          >
            <Trans>Delete machine</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The row menu on the machines list. */
export function MachineActionsMenu({ machine }: { machine: Machine }) {
  const { t } = useLingui();
  const { run } = useMachineActions();
  const [confirming, setConfirming] = useState(false);
  const can = (action: MachineAction) => canPerform(machine.status, action);
  const { name } = machine;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t`Actions for ${name}`}
          render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-40">
          {can("restore") ? (
            <DropdownMenuItem onClick={() => run("restore", machine)}>
              <Play />
              <Trans>Restore</Trans>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={!can("suspend")} onClick={() => run("suspend", machine)}>
              <Pause />
              <Trans>Suspend</Trans>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!can("fork")} onClick={() => run("fork", machine)}>
            <GitFork />
            <Trans>Fork</Trans>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!can("delete")}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
            <Trans>Delete</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteMachineDialog machine={machine} open={confirming} onOpenChange={setConfirming} />
    </>
  );
}

/** Suspend or restore, fork and delete as buttons in the row, for screens wide enough. */
export function MachineRowActions({ machine }: { machine: Machine }) {
  const { t } = useLingui();
  const { run } = useMachineActions();
  const [confirming, setConfirming] = useState(false);
  const can = (action: MachineAction) => canPerform(machine.status, action);
  const { name } = machine;
  const button = "h-11 px-3 text-body2 font-semibold";

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {can("suspend") ? (
        <Button
          variant="outline"
          className={button}
          aria-label={t`Suspend ${name}`}
          onClick={() => run("suspend", machine)}
        >
          <Trans>Suspend</Trans>
        </Button>
      ) : null}
      {can("restore") ? (
        <Button
          variant="outline"
          className={button}
          aria-label={t`Restore ${name}`}
          onClick={() => run("restore", machine)}
        >
          <Trans>Restore</Trans>
        </Button>
      ) : null}
      {can("fork") ? (
        <Button
          variant="outline"
          className={button}
          aria-label={t`Fork ${name}`}
          onClick={() => run("fork", machine)}
        >
          <Trans>Fork</Trans>
        </Button>
      ) : null}
      {can("delete") ? (
        <Button
          variant="outline"
          className={`${button} text-destructive`}
          aria-label={t`Delete ${name}`}
          onClick={() => setConfirming(true)}
        >
          <Trans>Delete</Trans>
        </Button>
      ) : null}
      <DeleteMachineDialog machine={machine} open={confirming} onOpenChange={setConfirming} />
    </div>
  );
}
