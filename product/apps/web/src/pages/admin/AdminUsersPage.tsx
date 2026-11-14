import { Trans, useLingui } from "@lingui/react/macro";
import type { AdminUser, PasswordResult } from "@rookbox/contracts";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  Skeleton,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@rookbox/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { ErrorNote, useToastError } from "../../components/ErrorNote";
import { PageHeader } from "../../components/PageHeader";
import { Tag } from "../../components/Panel";
import { orpc } from "../../lib/api";
import { formatDate } from "../../lib/format";

const head = "text-label font-semibold tracking-[0.06em] uppercase";

/** The password a call just set. It is shown once; closing the dialog forgets it. */
function PasswordDialog({
  result,
  onClose,
}: {
  result: PasswordResult | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <Dialog open={result !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>
                <Trans>Give them this password</Trans>
              </DialogTitle>
              <DialogDescription className="text-warning">
                <Trans>
                  This is the only time it is shown. Send it to {result.email} privately and ask
                  them to change it after signing in.
                </Trans>
              </DialogDescription>
            </DialogHeader>
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

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: PasswordResult) => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const create = useMutation(
    orpc.admin.users.create.mutationOptions({
      onSuccess: (result) => {
        onOpenChange(false);
        onCreated(result);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() }),
    }),
  );

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setEmail("");
      setName("");
      setPassword("");
      create.reset();
    }
  };

  const ready = email.trim() !== "" && name.trim() !== "";
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            create.mutate({
              email: email.trim(),
              name: name.trim(),
              password: password === "" ? undefined : password,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <Trans>Create account</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                The email must already be on the server's allowed list. There is no sign-up page, so
                you give them the password yourself.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="new-user-email">
              <Trans>Email</Trans>
            </FieldLabel>
            <Input
              id="new-user-email"
              type="email"
              autoComplete="off"
              value={email}
              placeholder={t`name@example.com`}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-user-name">
              <Trans>Name</Trans>
            </FieldLabel>
            <Input
              id="new-user-name"
              autoComplete="off"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-user-password">
              <Trans>Temporary password (optional)</Trans>
            </FieldLabel>
            <Input
              id="new-user-password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={password}
              placeholder={t`Leave empty to generate a strong one`}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </Field>
          {create.isError ? <ErrorNote error={create.error} /> : null}
          <DialogFooter>
            <Button type="submit" disabled={!ready || create.isPending}>
              {create.isPending ? <Spinner aria-hidden="true" /> : null}
              <Trans>Create account</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPassword({
  user,
  onDone,
}: {
  user: AdminUser;
  onDone: (result: PasswordResult) => void;
}) {
  const { t } = useLingui();
  const toastError = useToastError();
  const [open, setOpen] = useState(false);
  const reset = useMutation(
    orpc.admin.users.resetPassword.mutationOptions({ onError: toastError, onSuccess: onDone }),
  );
  const { email } = user;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        className="h-11 px-3 text-body2 font-semibold"
        aria-label={t`Reset password for ${email}`}
        disabled={reset.isPending}
        onClick={() => setOpen(true)}
      >
        {reset.isPending ? <Spinner aria-hidden="true" /> : null}
        <Trans>Reset password</Trans>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Reset the password for {email}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              A new password is generated and every device they are signed in on is signed out. The
              old password stops working.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              reset.mutate({ email });
              setOpen(false);
            }}
          >
            <Trans>Reset password</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ToggleAccess({ user }: { user: AdminUser }) {
  const { t } = useLingui();
  const toastError = useToastError();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [suspend, setSuspend] = useState(true);
  const settled = {
    onError: toastError,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.admin.key() });
    },
  };
  const disable = useMutation(
    orpc.admin.users.disable.mutationOptions({
      ...settled,
      onSuccess: ({ email, suspended }) => {
        const count = suspended?.suspended ?? 0;
        toast.success(
          suspended
            ? t`${email} is disabled. Machines suspended: ${count}.`
            : t`${email} is disabled.`,
        );
      },
    }),
  );
  const enable = useMutation(
    orpc.admin.users.enable.mutationOptions({
      ...settled,
      onSuccess: ({ email }) => toast.success(t`${email} can sign in again.`),
    }),
  );
  const { email } = user;

  if (user.status === "disabled") {
    return (
      <Button
        variant="outline"
        className="h-11 px-3 text-body2 font-semibold"
        aria-label={t`Enable ${email}`}
        disabled={enable.isPending}
        onClick={() => enable.mutate({ email })}
      >
        {enable.isPending ? <Spinner aria-hidden="true" /> : null}
        <Trans>Enable</Trans>
      </Button>
    );
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        className="h-11 px-3 text-body2 font-semibold text-destructive"
        aria-label={t`Disable ${email}`}
        disabled={disable.isPending}
        onClick={() => setOpen(true)}
      >
        {disable.isPending ? <Spinner aria-hidden="true" /> : null}
        <Trans>Disable</Trans>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Disable {email}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              They are signed out at once, can't sign in, and their API keys stop working. You can
              enable the account again later.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-3">
          <Switch id={`suspend-${email}`} checked={suspend} onCheckedChange={setSuspend} />
          <label htmlFor={`suspend-${email}`} className="text-body1">
            <Trans>Also suspend their running machines</Trans>
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              disable.mutate({ email, suspendMachines: suspend });
              setOpen(false);
            }}
          >
            <Trans>Disable account</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AdminUsersPage() {
  const { t, i18n } = useLingui();
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<PasswordResult | null>(null);
  const users = useQuery({ ...orpc.admin.users.list.queryOptions(), retry: false });

  const newUser = (
    <Button className="h-11 px-[18px] text-body1 font-semibold" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" />
      <Trans>Create account</Trans>
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={<Trans>Users</Trans>} action={users.data?.length ? newUser : null} />
      {users.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label={t`Loading`}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : users.isError ? (
        <ErrorNote error={users.error} onRetry={() => users.refetch()} />
      ) : users.data.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <Users className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-heading3 font-medium text-foreground">
            <Trans>No accounts yet</Trans>
          </p>
          <p className="max-w-[420px] text-body1 text-muted-foreground">
            <Trans>Create the first account, then give the person the password.</Trans>
          </p>
          {newUser}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={`px-[18px] ${head}`}>
                  <Trans>Account</Trans>
                </TableHead>
                <TableHead className={head}>
                  <Trans>Status</Trans>
                </TableHead>
                <TableHead className={`${head} text-right max-sm:hidden`}>
                  <Trans>Machines</Trans>
                </TableHead>
                <TableHead className={`${head} max-lg:hidden`}>
                  <Trans>Created</Trans>
                </TableHead>
                <TableHead>
                  <span className="sr-only">
                    <Trans>Actions</Trans>
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((user) => (
                <TableRow key={user.email} className="h-16">
                  <TableCell className="px-[18px]">
                    <span className="block font-semibold text-foreground">{user.email}</span>
                    <span className="block text-label text-muted-foreground">{user.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {user.admin ? (
                        <Tag>
                          <Trans>Admin</Trans>
                        </Tag>
                      ) : null}
                      {user.allowed ? null : (
                        <Tag>
                          <Trans>Not on the allowed list</Trans>
                        </Tag>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-body2">
                    {user.status === "disabled" ? (
                      <span className="font-semibold text-destructive">
                        <Trans>Disabled</Trans>
                      </span>
                    ) : (
                      <span className="font-semibold text-link">
                        <Trans>Active</Trans>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-body2 tabular-nums max-sm:hidden">
                    {user.machines}
                  </TableCell>
                  <TableCell className="text-body2 text-muted-foreground max-lg:hidden">
                    {formatDate(user.createdAt, i18n.locale)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <ResetPassword user={user} onDone={setShown} />
                      <ToggleAccess user={user} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <CreateUserDialog open={creating} onOpenChange={setCreating} onCreated={setShown} />
      <PasswordDialog result={shown} onClose={() => setShown(null)} />
    </div>
  );
}
