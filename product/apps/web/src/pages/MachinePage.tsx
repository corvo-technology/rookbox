import { Trans, useLingui } from "@lingui/react/macro";
import { isDefinedError } from "@orpc/client";
import type { Machine } from "@rookbox/contracts";
import { canPerform, isTransitional } from "@rookbox/contracts";
import { Button, Skeleton } from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitFork, Monitor, Pause, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CodeBlock } from "../components/CodeBlock";
import { DeleteMachineDialog, useMachineActions } from "../components/MachineActions";
import { useSizeText } from "../components/SizeText";
import { StatusChip } from "../components/StatusChip";
import { orpc, TRANSITION_POLL_MS } from "../lib/api";
import { formatDate } from "../lib/format";
import { connectSnippet } from "../lib/snippets";

function Detail({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
      <dt className="w-32 shrink-0 text-body2 text-muted-foreground">{label}</dt>
      <dd className="text-body1 text-foreground">{children}</dd>
    </div>
  );
}

function ForkedFrom({ id }: { id: string }) {
  const source = useQuery(orpc.machines.get.queryOptions({ input: { id }, retry: false }));
  if (source.data) {
    return (
      <Link to={`/machines/${id}`} className="underline-offset-4 hover:underline">
        {source.data.name}
      </Link>
    );
  }
  return (
    <span className="text-muted-foreground">
      <Trans>A deleted machine</Trans>
    </span>
  );
}

function Actions({ machine }: { machine: Machine }) {
  const navigate = useNavigate();
  const { run, pending } = useMachineActions();
  const [confirming, setConfirming] = useState(false);
  const can = (action: Parameters<typeof canPerform>[1]) => canPerform(machine.status, action);
  return (
    <div className="flex flex-wrap gap-2">
      {can("restore") ? (
        <Button onClick={() => run("restore", machine)} disabled={pending}>
          <Play aria-hidden="true" />
          <Trans>Restore</Trans>
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => run("suspend", machine)}
          disabled={!can("suspend") || pending}
        >
          <Pause aria-hidden="true" />
          <Trans>Suspend</Trans>
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => run("fork", machine)}
        disabled={!can("fork") || pending}
      >
        <GitFork aria-hidden="true" />
        <Trans>Fork</Trans>
      </Button>
      <Button variant="destructive" onClick={() => setConfirming(true)} disabled={!can("delete")}>
        <Trash2 aria-hidden="true" />
        <Trans>Delete</Trans>
      </Button>
      <DeleteMachineDialog
        machine={machine}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => navigate("/machines")}
      />
    </div>
  );
}

export function MachinePage() {
  const { i18n } = useLingui();
  const sizeText = useSizeText();
  const { id = "" } = useParams();
  const machine = useQuery(
    orpc.machines.get.queryOptions({
      input: { id },
      retry: false,
      refetchInterval: (query) =>
        query.state.data && isTransitional(query.state.data.status) ? TRANSITION_POLL_MS : false,
    }),
  );

  const back = (
    <Link
      to="/machines"
      className="inline-flex w-fit items-center gap-1.5 text-body2 text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      <Trans>Machines</Trans>
    </Link>
  );

  if (machine.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (machine.isError) {
    const missing = isDefinedError(machine.error) && machine.error.code === "NOT_FOUND";
    return (
      <div className="flex flex-col gap-6">
        {back}
        <p className="text-body1 text-muted-foreground">
          {missing ? (
            <Trans>This machine doesn't exist.</Trans>
          ) : (
            <Trans>The machine didn't load.</Trans>
          )}
        </p>
      </div>
    );
  }

  const data = machine.data;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading2 font-semibold text-foreground">{data.name}</h1>
          <StatusChip status={data.status} />
        </div>
        <Actions machine={data} />
      </div>

      <dl className="divide-y divide-border border-y border-border">
        <Detail label={<Trans>Template</Trans>}>
          <span className="font-mono">{data.template}</span>
        </Detail>
        <Detail label={<Trans>Size</Trans>}>{sizeText(data.size)}</Detail>
        <Detail label={<Trans>Created</Trans>}>{formatDate(data.createdAt, i18n.locale)}</Detail>
        {data.forkedFrom ? (
          <Detail label={<Trans>Forked from</Trans>}>
            <ForkedFrom id={data.forkedFrom} />
          </Detail>
        ) : null}
        <Detail label={<Trans>ID</Trans>}>
          <span className="font-mono text-body2">{data.id}</span>
        </Detail>
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="connect-heading">
        <h2 id="connect-heading" className="text-heading3 font-medium text-foreground">
          <Trans>Connect</Trans>
        </h2>
        <CodeBlock code={connectSnippet(data.id)} label="Python · E2B SDK" />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="desktop-heading">
        <h2 id="desktop-heading" className="text-heading3 font-medium text-foreground">
          <Trans>Desktop</Trans>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled aria-describedby="desktop-note">
            <Monitor aria-hidden="true" />
            <Trans>Open desktop</Trans>
          </Button>
          <span id="desktop-note" className="text-body2 text-muted-foreground">
            <Trans>Needs the desktop template, coming soon.</Trans>
          </span>
        </div>
      </section>
    </div>
  );
}
