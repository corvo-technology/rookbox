import { Trans, useLingui } from "@lingui/react/macro";
import type { ApiKey } from "@rookbox/contracts";
import { API_KEY_NAME_MAX_LENGTH } from "@rookbox/contracts";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@rookbox/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "../components/CopyButton";
import { PageHeader } from "../components/PageHeader";
import { orpc } from "../lib/api";
import { formatDate, formatRelative } from "../lib/format";

function CreateKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation(
    orpc.apiKeys.create.mutationOptions({
      onError: () => toast.error(t`The key wasn't created. Try again.`),
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.apiKeys.key() }),
    }),
  );
  const secret = create.data?.secret;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      create.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle>
                <Trans>Copy your key</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>You won't see it again.</Trans>
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2 pl-3">
              <code className="min-w-0 flex-1 truncate font-mono text-body2 text-foreground">
                {secret}
              </code>
              <CopyButton value={secret} label={t`Copy key`} />
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>
                <Trans>Done</Trans>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate({ name: name.trim() });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <Trans>New API key</Trans>
              </DialogTitle>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="key-name">
                <Trans>Name</Trans>
              </FieldLabel>
              <Input
                id="key-name"
                value={name}
                maxLength={API_KEY_NAME_MAX_LENGTH}
                autoComplete="off"
                placeholder={t`For example, production`}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {create.isPending ? <Spinner /> : null}
                <Trans>Create key</Trans>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeKey({ apiKey }: { apiKey: ApiKey }) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const revoke = useMutation(
    orpc.apiKeys.revoke.mutationOptions({
      onError: () => toast.error(t`The key wasn't revoked. Try again.`),
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.apiKeys.key() }),
    }),
  );
  const { name } = apiKey;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="text" size="sm" onClick={() => setOpen(true)} aria-label={t`Revoke ${name}`}>
        <Trans>Revoke</Trans>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Revoke {name}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Anything using this key stops working right away.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              revoke.mutate({ id: apiKey.id });
              setOpen(false);
            }}
          >
            <Trans>Revoke key</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ApiKeysPage() {
  const { i18n } = useLingui();
  const [creating, setCreating] = useState(false);
  const keys = useQuery(orpc.apiKeys.list.queryOptions());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<Trans>API keys</Trans>}
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            <Trans>New key</Trans>
          </Button>
        }
      />

      {keys.isPending ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : keys.isError ? (
        <p className="text-body1 text-muted-foreground">
          <Trans>Keys didn't load.</Trans>
        </p>
      ) : keys.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-body1 text-muted-foreground">
          <Trans>No keys yet</Trans>
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>Name</Trans>
              </TableHead>
              <TableHead>
                <Trans>Key</Trans>
              </TableHead>
              <TableHead className="max-sm:hidden">
                <Trans>Created</Trans>
              </TableHead>
              <TableHead className="max-md:hidden">
                <Trans>Last used</Trans>
              </TableHead>
              <TableHead className="w-20">
                <span className="sr-only">
                  <Trans>Actions</Trans>
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.data.map((apiKey) => (
              <TableRow key={apiKey.id} className="h-13">
                <TableCell className="font-medium text-foreground">{apiKey.name}</TableCell>
                <TableCell className="font-mono text-body2 text-muted-foreground">
                  {apiKey.hint}…
                </TableCell>
                <TableCell className="text-body2 text-muted-foreground max-sm:hidden">
                  {formatDate(apiKey.createdAt, i18n.locale)}
                </TableCell>
                <TableCell className="text-body2 text-muted-foreground max-md:hidden">
                  {apiKey.lastUsedAt ? (
                    formatRelative(apiKey.lastUsedAt, i18n.locale)
                  ) : (
                    <Trans>Never</Trans>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <RevokeKey apiKey={apiKey} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CreateKeyDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
