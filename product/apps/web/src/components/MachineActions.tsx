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
  Spinner,
  toast,
} from "@rookbox/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, GitFork, Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, orpc } from "../lib/api";
import { useErrorText } from "./ErrorNote";

/** Every machine action shares this key prefix, so screens can tell one is in flight and poll. */
export const MACHINE_ACTION_KEY = "machine-action";

export type MachineActionsState = ReturnType<typeof useMachineActions>;

/**
 * Suspend, restore, fork and delete for one machine. Each call can take a while (a suspend takes
 * 18 to 24 seconds), so the hook reports which action is in flight, and a failure stays on the
 * machine with a way to try again instead of vanishing in a toast.
 */
export function useMachineActions(machine: Machine) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<{ action: MachineAction; error: unknown } | null>(null);
  const { name } = machine;

  const mutation = useMutation({
    mutationKey: [MACHINE_ACTION_KEY, machine.id],
    mutationFn: async (action: MachineAction): Promise<unknown> => {
      const input = { id: machine.id };
      switch (action) {
        case "suspend":
          return api.machines.suspend(input);
        case "restore":
          return api.machines.restore(input);
        case "fork":
          return api.machines.fork(input);
        case "delete":
          return api.machines.delete(input);
      }
    },
    onMutate: () => setFailure(null),
    onError: (error, action) => setFailure({ action, error }),
    onSuccess: (result, action) => {
      if (action === "suspend") toast.success(t`${name} is suspended. Its memory was saved.`);
      if (action === "restore") toast.success(t`${name} is running again.`);
      if (action === "delete") toast.success(t`${name} deleted`);
      if (action === "fork") {
        const forked = (result as Machine).name;
        toast.success(t`Forked into ${forked}. The disk was copied, not memory.`);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.machines.key() }),
  });

  return {
    run: (action: MachineAction) => mutation.mutate(action),
    /** The action in flight, if any. */
    busy: mutation.isPending ? (mutation.variables ?? null) : null,
    failure,
    clearFailure: () => setFailure(null),
  };
}

/** What a failed action says, with the way to try it again. */
export function MachineActionFailure({
  actions,
  className,
}: {
  actions: MachineActionsState;
  className?: string;
}) {
  const text = useErrorText();
  const { failure } = actions;
  if (!failure) return null;
  const { title, hint, retryable } = text(failure.error);
  const action = failure.action;
  return (
    <p role="alert" className={className ?? "mt-1 text-label text-destructive"}>
      {title} <span className="text-muted-foreground">{hint}</span>{" "}
      {retryable ? (
        <Button
          variant="link"
          className="h-auto p-0 text-label"
          onClick={() => actions.run(action)}
        >
          <Trans>Try again</Trans>
        </Button>
      ) : null}
    </p>
  );
}

/** The "Delete" dialog says what is lost, so a confirm button is not a reflex. */
export function DeleteMachineDialog({
  machine,
  actions,
  open,
  onOpenChange,
}: {
  machine: Machine;
  actions: MachineActionsState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
              actions.run("delete");
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

/** The row menu on the machines list, for narrow screens. */
export function MachineActionsMenu({
  machine,
  actions,
}: {
  machine: Machine;
  actions: MachineActionsState;
}) {
  const { t } = useLingui();
  const [confirming, setConfirming] = useState(false);
  const can = (action: MachineAction) => canPerform(machine.status, action) && !actions.busy;
  const { name } = machine;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t`Actions for ${name}`}
          render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}
        >
          {actions.busy ? <Spinner aria-hidden="true" /> : <Ellipsis />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-40">
          {canPerform(machine.status, "restore") ? (
            <DropdownMenuItem disabled={!can("restore")} onClick={() => actions.run("restore")}>
              <Play />
              <Trans>Restore</Trans>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={!can("suspend")} onClick={() => actions.run("suspend")}>
              <Pause />
              <Trans>Suspend</Trans>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!can("fork")} onClick={() => actions.run("fork")}>
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
      <DeleteMachineDialog
        machine={machine}
        actions={actions}
        open={confirming}
        onOpenChange={setConfirming}
      />
    </>
  );
}

/** Suspend or restore, fork and delete as buttons in the row, for screens wide enough. */
export function MachineRowActions({
  machine,
  actions,
}: {
  machine: Machine;
  actions: MachineActionsState;
}) {
  const { t } = useLingui();
  const [confirming, setConfirming] = useState(false);
  const can = (action: MachineAction) => canPerform(machine.status, action);
  const { name } = machine;
  const button = "h-11 px-3 text-body2 font-semibold";
  const spin = (action: MachineAction) =>
    actions.busy === action ? <Spinner aria-hidden="true" /> : null;

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {can("suspend") ? (
        <Button
          variant="outline"
          className={button}
          aria-label={t`Suspend ${name}`}
          disabled={actions.busy !== null}
          onClick={() => actions.run("suspend")}
        >
          {spin("suspend")}
          {actions.busy === "suspend" ? <Trans>Suspending…</Trans> : <Trans>Suspend</Trans>}
        </Button>
      ) : null}
      {can("restore") ? (
        <Button
          variant="outline"
          className={button}
          aria-label={t`Restore ${name}`}
          disabled={actions.busy !== null}
          onClick={() => actions.run("restore")}
        >
          {spin("restore")}
          {actions.busy === "restore" ? <Trans>Restoring…</Trans> : <Trans>Restore</Trans>}
        </Button>
      ) : null}
      {can("fork") ? (
        <Button
          variant="outline"
          className={button}
          aria-label={t`Fork ${name}`}
          disabled={actions.busy !== null}
          onClick={() => actions.run("fork")}
        >
          {spin("fork")}
          {actions.busy === "fork" ? <Trans>Forking…</Trans> : <Trans>Fork</Trans>}
        </Button>
      ) : null}
      {can("delete") ? (
        <Button
          variant="outline"
          className={`${button} text-destructive`}
          aria-label={t`Delete ${name}`}
          disabled={actions.busy !== null}
          onClick={() => setConfirming(true)}
        >
          <Trans>Delete</Trans>
        </Button>
      ) : null}
      <DeleteMachineDialog
        machine={machine}
        actions={actions}
        open={confirming}
        onOpenChange={setConfirming}
      />
    </div>
  );
}
