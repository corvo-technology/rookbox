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

const DOT: Record<MachineStatus, string> = {
  creating: "bg-status-working",
  running: "bg-success",
  suspending: "bg-status-working",
  suspended: "bg-faint-foreground",
  restoring: "bg-status-working",
  deleting: "bg-destructive",
  failed: "bg-destructive",
};

export function StatusChip({ status }: { status: MachineStatus }) {
  const label = useStatusLabel();
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-label font-medium text-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          DOT[status],
          isTransitional(status) && "animate-pulse",
        )}
      />
      {label(status)}
    </span>
  );
}
