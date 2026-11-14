import { Trans, useLingui } from "@lingui/react/macro";
import type { InviteResult, WaitlistEntry } from "@rookbox/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { ErrorNote, useToastError } from "../../components/ErrorNote";
import { PageHeader } from "../../components/PageHeader";
import { orpc } from "../../lib/api";
import { formatDate } from "../../lib/format";

const head = "text-label font-semibold tracking-[0.06em] uppercase";

/** The password of the account an invitation just created. Shown once, as a fallback to the email. */
function InvitedDialog({ result, onClose }: { result: InviteResult | null; onClose: () => void }) {
  const { t } = useLingui();
  return (
    <Dialog open={result !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>
                <Trans>Account created</Trans>
              </DialogTitle>
              <DialogDescription>
                {result.emailed ? (
                  <Trans>The invitation email was sent to {result.email}.</Trans>
                ) : (
                  <Trans>
                    The invitation email could not be sent to {result.email}. Send them the password
                    yourself.
                  </Trans>
                )}
              </DialogDescription>
            </DialogHeader>
            <p className="text-body2 text-warning">
              <Trans>This temporary password is shown only once.</Trans>
            </p>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2 pl-3">
              <code className="min-w-0 flex-1 font-mono text-body2 break-all text-foreground select-all">
                {result.password}
              </code>
              <CopyButton value={result.password} label={t`Copy password`} />
            </div>
            <DialogFooter>
              <Button onClick={onClose}>
                <Trans>I have saved it</Trans>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InviteButton({
  entry,
  onInvited,
}: {
  entry: WaitlistEntry;
  onInvited: (result: InviteResult) => void;
}) {
  const { t } = useLingui();
  const toastError = useToastError();
  const queryClient = useQueryClient();
  const invite = useMutation(
    orpc.admin.waitlist.invite.mutationOptions({
      onError: toastError,
      onSuccess: (result) => {
        toast.success(t`${result.email} was invited.`);
        onInvited(result);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.admin.key() });
      },
    }),
  );
  const { email } = entry;
  return (
    <Button
      variant="outline"
      className="h-11 px-3 text-body2 font-semibold"
      aria-label={t`Invite ${email}`}
      disabled={invite.isPending}
      onClick={() => invite.mutate({ email })}
    >
      {invite.isPending ? <Spinner aria-hidden="true" /> : null}
      <Trans>Invite</Trans>
    </Button>
  );
}

export function AdminWaitlistPage() {
  const { t, i18n } = useLingui();
  const [shown, setShown] = useState<InviteResult | null>(null);
  const entries = useQuery({ ...orpc.admin.waitlist.list.queryOptions(), retry: false });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={<Trans>Waitlist</Trans>} />
      {entries.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label={t`Loading`}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : entries.isError ? (
        <ErrorNote error={entries.error} onRetry={() => entries.refetch()} />
      ) : entries.data.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <ListChecks
            className="size-10 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="text-heading3 font-medium text-foreground">
            <Trans>Nobody is waiting yet</Trans>
          </p>
          <p className="max-w-[420px] text-body1 text-muted-foreground">
            <Trans>People who ask for access on the landing page show up here.</Trans>
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={`px-[18px] ${head}`}>
                  <Trans>Email</Trans>
                </TableHead>
                <TableHead className={`${head} max-md:hidden`}>
                  <Trans>What they will run</Trans>
                </TableHead>
                <TableHead className={head}>
                  <Trans>Status</Trans>
                </TableHead>
                <TableHead className={`${head} max-lg:hidden`}>
                  <Trans>Joined</Trans>
                </TableHead>
                <TableHead>
                  <span className="sr-only">
                    <Trans>Actions</Trans>
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.data.map((entry) => (
                <TableRow key={entry.email} className="h-16">
                  <TableCell className="px-[18px]">
                    <span className="block font-semibold text-foreground">{entry.email}</span>
                    <span className="block text-label text-muted-foreground uppercase">
                      {entry.locale}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[320px] text-body2 text-muted-foreground max-md:hidden">
                    {entry.note ?? "-"}
                  </TableCell>
                  <TableCell className="text-body2">
                    {entry.status === "invited" ? (
                      <span className="font-semibold text-link">
                        <Trans>Invited</Trans>
                      </span>
                    ) : (
                      <span className="font-semibold text-foreground">
                        <Trans>Waiting</Trans>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-body2 text-muted-foreground max-lg:hidden">
                    {formatDate(entry.createdAt, i18n.locale)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {entry.status === "waiting" ? (
                        <InviteButton entry={entry} onInvited={setShown} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <InvitedDialog result={shown} onClose={() => setShown(null)} />
    </div>
  );
}
