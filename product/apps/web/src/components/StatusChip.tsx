import { useLingui } from "@lingui/react/macro";
import type { MachineStatus } from "@rookbox/contracts";
import { isTransitional } from "@rookbox/contracts";
import { cn } from "@rookbox/ui-web";

export function useStatusLabel() {
  const { t } = useLingui();
  const labels: Record<MachineStatus, string> = {
    creating: t`Creating`,
    running: t`Running`,
    suspending: t`Suspending`,
    suspended: t`Suspended`,
    restoring: t`Restoring`,
    deleting: t`Deleting`,
    failed: t`Failed`,
  };
  return (status: MachineStatus) => labels[status];
}

/** Tinted chips: green for running, amber for suspended, blue-green while moving, red for trouble. */
const TONE: Record<MachineStatus, string> = {
  creating: "bg-status-working/15 text-status-working",
  running: "bg-link/15 text-link",
  suspending: "bg-status-working/15 text-status-working",
  suspended: "bg-warning/15 text-warning",
  restoring: "bg-status-working/15 text-status-working",
  deleting: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
};

export function StatusChip({ status }: { status: MachineStatus }) {
  const label = useStatusLabel();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] rounded-full py-[3px] pr-[11px] pl-[9px] text-body2 font-semibold",
        TONE[status],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-[7px] rounded-full bg-current",
          isTransitional(status) && "animate-pulse motion-reduce:animate-none",
        )}
      />
      {label(status)}
    </span>
  );
}
