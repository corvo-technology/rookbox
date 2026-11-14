import { Trans, useLingui } from "@lingui/react/macro";
import type { ExecResult, Machine } from "@rookbox/contracts";
import { canPerform, DESKTOP_TEMPLATES, isTransitional } from "@rookbox/contracts";
import { Button, Input, Skeleton, Spinner } from "@rookbox/ui-web";
import { useIsMutating, useMutation, useQuery } from "@tanstack/react-query";
import { GitFork, Monitor, Pause, Play, Trash2 } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CodeBlock } from "../components/CodeBlock";
import { CopyButton } from "../components/CopyButton";
import { ErrorNote, useErrorText, useToastError } from "../components/ErrorNote";
import {
  DeleteMachineDialog,
  MACHINE_ACTION_KEY,
  MachineActionFailure,
  useMachineActions,
} from "../components/MachineActions";
import { Panel, Tag } from "../components/Panel";
import { StatusChip } from "../components/StatusChip";
import { orpc, TRANSITION_POLL_MS } from "../lib/api";
import { formatDate, formatIdle, formatMib } from "../lib/format";
import { connectSnippet } from "../lib/snippets";

const BUTTON = "h-11 px-[18px] text-body1 font-semibold";

function Spec({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </>
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
  const actions = useMachineActions(machine);
  const [confirming, setConfirming] = useState(false);
  const can = (action: Parameters<typeof canPerform>[1]) =>
    canPerform(machine.status, action) && actions.busy === null;
  const spin = (action: Parameters<typeof canPerform>[1], icon: ReactNode) =>
    actions.busy === action ? <Spinner aria-hidden="true" /> : icon;
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {canPerform(machine.status, "restore") ? (
          <Button
            className={BUTTON}
            onClick={() => actions.run("restore")}
            disabled={!can("restore")}
          >
            {spin("restore", <Play aria-hidden="true" />)}
            {actions.busy === "restore" ? <Trans>Restoring…</Trans> : <Trans>Restore</Trans>}
          </Button>
        ) : (
          <Button
            variant="outline"
            className={BUTTON}
            onClick={() => actions.run("suspend")}
            disabled={!can("suspend")}
          >
            {spin("suspend", <Pause aria-hidden="true" />)}
            {actions.busy === "suspend" ? <Trans>Suspending…</Trans> : <Trans>Suspend</Trans>}
          </Button>
        )}
        <Button
          variant="outline"
          className={BUTTON}
          onClick={() => actions.run("fork")}
          disabled={!can("fork")}
        >
          {spin("fork", <GitFork aria-hidden="true" />)}
          {actions.busy === "fork" ? <Trans>Forking…</Trans> : <Trans>Fork</Trans>}
        </Button>
        <Button
          variant="outline"
          className={`${BUTTON} text-destructive`}
          onClick={() => setConfirming(true)}
          disabled={!can("delete")}
        >
          <Trash2 aria-hidden="true" />
          <Trans>Delete</Trans>
        </Button>
      </div>
      {actions.busy === "suspend" ? (
        <p role="status" className="text-label text-muted-foreground">
          <Trans>Saving the machine's memory. This can take up to half a minute.</Trans>
        </p>
      ) : null}
      <MachineActionFailure actions={actions} className="text-body2 text-destructive" />
      <DeleteMachineDialog
        machine={machine}
        actions={actions}
        open={confirming}
        onOpenChange={setConfirming}
      />
    </div>
  );
}

type RunEntry = { command: string; result?: ExecResult; error?: unknown };

/** Runs one command at a time in the machine and keeps what came back. */
function CommandRunner({ machine }: { machine: Machine }) {
  const { t } = useLingui();
  const errorText = useErrorText();
  const [command, setCommand] = useState("");
  const [entries, setEntries] = useState<RunEntry[]>([]);
  const exec = useMutation(orpc.machines.exec.mutationOptions());
  const running = machine.status === "running";

  const run = async (event: FormEvent) => {
    event.preventDefault();
    const text = command.trim();
    if (!text || exec.isPending) return;
    setCommand("");
    setEntries((list) => [...list, { command: text }]);
    const settle = (patch: Partial<RunEntry>) =>
      setEntries((list) =>
        list.map((entry, i) => (i === list.length - 1 ? { ...entry, ...patch } : entry)),
      );
    try {
      settle({ result: await exec.mutateAsync({ id: machine.id, command: text }) });
    } catch (error) {
      settle({ error });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="max-h-80 min-h-32 overflow-auto rounded-xl border border-border bg-[#050506] p-4 font-mono text-body2 leading-[1.8] break-words whitespace-pre-wrap text-[#f5f5f5]"
        role="log"
        aria-live="polite"
      >
        {entries.length === 0 ? (
          <div className="text-[#a9a9ab]">
            {running
              ? t`Run a command to see its output here.`
              : t`Start the machine to run commands.`}
          </div>
        ) : null}
        {entries.map((entry, index) => (
          <div key={index} className="mb-2">
            <div className="text-[#a9a9ab]">{`$ ${entry.command}`}</div>
            {entry.result ? (
              <>
                {entry.result.stdout ? <div>{entry.result.stdout}</div> : null}
                {entry.result.stderr ? (
                  <div className="text-[#ff8a80]">{entry.result.stderr}</div>
                ) : null}
                <div className="text-[#a9a9ab]">
                  {entry.result.exitCode === null
                    ? t`Timed out`
                    : t`Exit code ${entry.result.exitCode}`}
                  {entry.result.truncated ? ` · ${t`Output cut`}` : ""}
                </div>
              </>
            ) : entry.error !== undefined ? (
              <div className="text-[#ff8a80]">
                {errorText(entry.error).title} {errorText(entry.error).hint}
              </div>
            ) : (
              <div className="text-[#a9a9ab]">…</div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={run} className="flex gap-2">
        <Input
          aria-label={t`Command`}
          className="h-11 flex-1 font-mono"
          placeholder="uname -a"
          autoComplete="off"
          spellCheck={false}
          value={command}
          disabled={!running}
          onChange={(event) => setCommand(event.target.value)}
        />
        <Button
          type="submit"
          className="h-11 px-[18px] text-body1 font-semibold"
          disabled={!running || exec.isPending || !command.trim()}
        >
          <Trans>Run</Trans>
        </Button>
      </form>
    </div>
  );
}

/** The public address of one port. A browser tab can't open it: it needs a token header. */
function PortPanel({ machine }: { machine: Machine }) {
  const { t } = useLingui();
  const [port, setPort] = useState(3000);
  const valid = Number.isInteger(port) && port >= 1 && port <= 65_535;
  const url = machine.access.portUrlTemplate.replace("{port}", String(valid ? port : 3000));
  return (
    <Panel title={<Trans>Ports</Trans>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 text-body2 text-muted-foreground">
          <label htmlFor="machine-port">
            <Trans>Port</Trans>
          </label>
          <Input
            id="machine-port"
            type="number"
            inputMode="numeric"
            min={1}
            max={65_535}
            className="h-11 w-32"
            value={Number.isNaN(port) ? "" : port}
            aria-invalid={!valid || undefined}
            onChange={(event) => setPort(event.currentTarget.valueAsNumber)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 font-mono text-body2 break-all text-link">{url}</span>
          <CopyButton value={url} label={t`Copy URL for port ${port}`} />
        </div>
        <p className="text-label text-muted-foreground">
          <Trans>
            Anything listening on a port inside the machine is served at this address. Requests need
            the machine's access token, so a browser tab can't open it directly.
          </Trans>
        </p>
      </div>
    </Panel>
  );
}

/**
 * Asks the API for a short-lived link, then opens it in a new tab. The tab is opened first, while
 * the click still counts, so the browser does not take it for a pop-up. The desktop lives on its
 * own origin and never gets the login cookie.
 */
function OpenDesktopButton({ id }: { id: string }) {
  const toastError = useToastError();
  const link = useMutation(orpc.machines.desktopLink.mutationOptions());
  const open = async () => {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { url } = await link.mutateAsync({ id });
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      tab?.close();
      toastError(error);
    }
  };
  return (
    <Button
      variant="outline"
      className="mt-2 h-11 px-3"
      onClick={() => void open()}
      disabled={link.isPending}
    >
      {link.isPending ? <Spinner /> : null}
      <Trans>Open desktop</Trans>
    </Button>
  );
}

export function MachinePage() {
  const { t, i18n } = useLingui();
  const { id = "" } = useParams();
  const acting = useIsMutating({ mutationKey: [MACHINE_ACTION_KEY, id] }) > 0;
  const config = useQuery(orpc.config.get.queryOptions({ staleTime: 60_000 }));
  const machine = useQuery(
    orpc.machines.get.queryOptions({
      input: { id },
      retry: false,
      refetchInterval: (query) =>
        acting || (query.state.data && isTransitional(query.state.data.status))
          ? TRANSITION_POLL_MS
          : false,
    }),
  );

  const crumb = (name?: string) => (
    <nav aria-label={t`Breadcrumb`} className="flex gap-2.5 text-body1 text-muted-foreground">
      <Link to="/machines" className="hover:text-foreground hover:underline">
        <Trans>Machines</Trans>
      </Link>
      {name ? (
        <>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{name}</span>
        </>
      ) : null}
    </nav>
  );

  if (machine.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {crumb()}
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (machine.isError) {
    return (
      <div className="flex flex-col gap-6">
        {crumb()}
        <ErrorNote error={machine.error} onRetry={() => machine.refetch()} />
        <Link to="/machines" className="text-body1 text-link underline-offset-4 hover:underline">
          <Trans>Go to machines</Trans>
        </Link>
      </div>
    );
  }

  const data = machine.data;
  return (
    <div className="flex flex-col gap-5">
      {crumb(data.name)}
      <header className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.03em]">{data.name}</h1>
          <StatusChip status={data.status} />
          <span className="font-mono text-label text-muted-foreground">{data.id}</span>
        </div>
        <Actions machine={data} />
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title={<Trans>Terminal</Trans>}
            action={
              <span className="text-label text-muted-foreground">
                <Trans>Runs in a shell as root</Trans>
              </span>
            }
          >
            <CommandRunner machine={data} />
          </Panel>

          <Panel
            title={<Trans>Connect</Trans>}
            action={
              <Tag>
                <Trans>Soon</Trans>
              </Tag>
            }
          >
            <div className="flex flex-col gap-3">
              <CodeBlock
                code={connectSnippet(data.id, config.data?.domain)}
                label="Python · E2B SDK"
              />
              <p className="text-label text-muted-foreground">
                <Trans>
                  Rookbox API keys do not work with the E2B SDK yet. This shows how a machine will
                  be reached once they do. Until then, use the terminal and the desktop here.
                </Trans>
              </p>
            </div>
          </Panel>

          {DESKTOP_TEMPLATES.includes(data.template) ? (
            <Panel title={<Trans>Desktop</Trans>}>
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
                <Monitor className="size-10" strokeWidth={1.5} aria-hidden="true" />
                <p>
                  <Trans>Chromium over VNC, in a new tab.</Trans>
                </p>
                {data.access.desktop ? (
                  <OpenDesktopButton id={data.id} />
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled
                      className="mt-2 h-11 px-3"
                      aria-describedby="desktop-note"
                    >
                      <Trans>Open desktop</Trans>
                    </Button>
                    <p id="desktop-note" className="text-label">
                      <Trans>The machine has to be running.</Trans>
                    </p>
                  </>
                )}
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title={<Trans>Specs</Trans>}>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-body1">
              <Spec label={<Trans>Template</Trans>}>{data.template}</Spec>
              <Spec label="vCPU">{data.size.vcpu}</Spec>
              <Spec label={<Trans>Memory</Trans>}>
                {formatMib(data.size.memoryMib, i18n.locale)}
              </Spec>
              <Spec label={<Trans>Disk</Trans>}>{formatMib(data.size.diskMib, i18n.locale)}</Spec>
              <Spec label={<Trans>Suspends after</Trans>}>
                <Trans>{formatIdle(data.idleTimeoutS, i18n.locale)} idle</Trans>
              </Spec>
              <Spec label={<Trans>Created</Trans>}>{formatDate(data.createdAt, i18n.locale)}</Spec>
              {data.forkedFrom ? (
                <Spec label={<Trans>Forked from</Trans>}>
                  <ForkedFrom id={data.forkedFrom} />
                </Spec>
              ) : null}
            </dl>
          </Panel>

          <PortPanel machine={data} />
        </div>
      </div>
    </div>
  );
}
