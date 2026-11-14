import { useLingui } from "@lingui/react/macro";
import { Button, cn, toast } from "@rookbox/ui-web";
import { TriangleAlert } from "lucide-react";
import { type ClassifiedError, classifyError } from "../lib/errors";

export type ErrorText = { title: string; hint: string } & ClassifiedError;

/**
 * The words for a failure, in the reader's language: what happened and what to do, with no
 * server message and no JSON.
 */
export function useErrorText() {
  const { t } = useLingui();
  return (error: unknown): ErrorText => {
    const found = classifyError(error);
    const words = ((): { title: string; hint: string } => {
      switch (found.kind) {
        case "session":
          return {
            title: t`Your session ended.`,
            hint: t`Sign in again to continue.`,
          };
        case "credentials":
          return {
            title: t`Rookbox can't reach the machine service right now (credentials).`,
            hint: t`This is a setup problem on our side, not yours. Try again in a minute. If it keeps happening, tell the administrator.`,
          };
        case "template":
          return {
            title: t`That template isn't available.`,
            hint: t`Pick another template.`,
          };
        case "limit": {
          const limit = found.limit;
          return {
            title:
              limit === undefined
                ? t`You've reached your machine limit.`
                : t`You've reached your limit of ${limit} machines.`,
            hint: t`Delete a machine you no longer need, then try again.`,
          };
        }
        case "name_taken":
          return {
            title: t`A machine with that name already exists.`,
            hint: t`Pick another name.`,
          };
        case "unreachable":
          return {
            title: t`Rookbox can't reach the machine service right now.`,
            hint: t`Try again in a minute.`,
          };
        case "timeout":
          return {
            title: t`The machine service took too long to answer.`,
            hint: t`The machine may still be getting ready. Look at the list in a moment before you try again.`,
          };
        case "capacity":
          return {
            title: t`The beta is full right now.`,
            hint: t`There's no room for another machine at the moment. Try again later.`,
          };
        case "quota":
          return {
            title: t`A limit on the machine service was reached.`,
            hint: t`Delete machines you don't need, or try again later.`,
          };
        case "network":
          return {
            title: t`Can't reach Rookbox.`,
            hint: t`Check your connection and try again.`,
          };
        case "not_found":
          return {
            title: t`That machine doesn't exist anymore.`,
            hint: t`It may have been deleted. The list will refresh.`,
          };
        case "conflict":
          return {
            title: t`The machine's state doesn't allow that right now.`,
            hint: t`Wait for it to finish what it's doing, then try again.`,
          };
        case "rate_limited": {
          const seconds = found.retryAfterS;
          const minutes = Math.ceil((seconds ?? 0) / 60);
          return {
            title: t`You're doing that too often.`,
            hint:
              seconds === undefined
                ? t`Wait a little, then try again.`
                : seconds < 90
                  ? t`Wait ${seconds} seconds, then try again.`
                  : t`Wait about ${minutes} minutes, then try again.`,
          };
        }
        case "forbidden":
          return {
            title: t`You can't do that.`,
            hint: t`Your account doesn't have permission for this action.`,
          };
        case "space":
          return {
            title: t`The machine service had a problem.`,
            hint: t`Try again in a minute.`,
          };
        default:
          return {
            title: t`Something went wrong.`,
            hint: t`Try again. If it keeps happening, tell the administrator.`,
          };
      }
    })();
    return { ...words, ...found };
  };
}

/** A toast that says what failed and what to do. */
export function useToastError() {
  const text = useErrorText();
  return (error: unknown) => {
    const { title, hint } = text(error);
    toast.error(title, { description: hint });
  };
}

/** A failure shown in place: what happened, what to do, and a retry when one can help. */
export function ErrorNote({
  error,
  onRetry,
  retryLabel,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  const { t } = useLingui();
  const text = useErrorText();
  const { title, hint, retryable } = text(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-body1",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-muted-foreground">{hint}</p>
        {onRetry && retryable ? (
          <Button variant="outline" className="mt-2 h-11 w-fit px-3.5" onClick={onRetry}>
            {retryLabel ?? t`Try again`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
