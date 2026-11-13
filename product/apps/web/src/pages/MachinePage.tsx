import { Trans, useLingui } from "@lingui/react/macro";
import { isDefinedError } from "@orpc/client";
import type { ExecResult, Machine } from "@rookbox/contracts";
import { canPerform, DESKTOP_TEMPLATES, isTransitional } from "@rookbox/contracts";
import { Button, buttonVariants, Input, Skeleton } from "@rookbox/ui-web";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitFork, Monitor, Pause, Play, Trash2 } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CodeBlock } from "../components/CodeBlock";
import { CopyButton } from "../components/CopyButton";
import { DeleteMachineDialog, useMachineActions } from "../components/MachineActions";
import { Panel, Tag } from "../components/Panel";
import { StatusChip } from "../components/StatusChip";
import { orpc, TRANSITION_POLL_MS } from "../lib/api";
import { formatDate, formatMib } from "../lib/format";
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
  const navigate = useNavigate();
  const { run, pending } = useMachineActions();
  const [confirming, setConfirming] = useState(false);
  const can = (action: Parameters<typeof canPerform>[1]) => canPerform(machine.status, action);
  return (
    <div className="flex flex-wrap gap-2">
      {can("restore") ? (
        <Button className={BUTTON} onClick={() => run("restore", machine)} disabled={pending}>
          <Play aria-hidden="true" />
          <Trans>Restore</Trans>
        </Button>
      ) : (
        <Button
          variant="outline"
          className={BUTTON}
          onClick={() => run("suspend", machine)}
          disabled={!can("suspend") || pending}
        >
          <Pause aria-hidden="true" />
          <Trans>Suspend</Trans>
        </Button>
      )}
      <Button
        variant="outline"
        className={BUTTON}
        onClick={() => run("fork", machine)}
        disabled={!can("fork") || pending}
      >
        <GitFork aria-hidden="true" />
        <Trans>Fork</Trans>
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
      <DeleteMachineDialog
        machine={machine}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => navigate("/machines")}
      />
    </div>
  );
}

type RunEntry = { command: string; result?: ExecResult; failed?: boolean };

/** Runs one command at a time in the machine and keeps what came back. */
function CommandRunner({ machine }: { machine: Machine }) {
  const { t } = useLingui();
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
    } catch {
      settle({ failed: true });
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
            ) : entry.failed ? (
              <div className="text-[#ff8a80]">{t`That didn't work. Try again.`}</div>
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

const PORTS = [3000, 5173, 8080] as const;
const SAMPLE_SNAPSHOTS = ["after-install", "before-refactor", "suspend-auto"] as const;
const SAMPLE_EVENTS = [
  {
    dot: "bg-link",
    title: <Trans>Created</Trans>,
    note: <Trans>Booted from template seed in about 2 s</Trans>,
  },
  {
    dot: "bg-muted-foreground",
    title: <Trans>Port 3000 exposed</Trans>,
    note: <Trans>HTTPS URL issued</Trans>,
  },
  {
    dot: "bg-warning",
    title: <Trans>Suspended</Trans>,
    note: <Trans>Memory and state saved, worker released</Trans>,
  },
  {
    dot: "bg-link",
    title: <Trans>Restored</Trans>,
    note: <Trans>Back to running in about 1 s</Trans>,
  },
  {
    dot: "bg-muted-foreground",
    title: <Trans>Forked</Trans>,
    note: <Trans>Disk copied, memory not</Trans>,
  },
];

export function MachinePage() {
  const { t, i18n } = useLingui();
  const { id = "" } = useParams();
  const machine = useQuery(
    orpc.machines.get.queryOptions({
      input: { id },
      retry: false,
      refetchInterval: (query) =>
        query.state.data && isTransitional(query.state.data.status) ? TRANSITION_POLL_MS : false,
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
    const missing = isDefinedError(machine.error) && machine.error.code === "NOT_FOUND";
    return (
      <div className="flex flex-col gap-6">
        {crumb()}
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

          <Panel title={<Trans>Connect</Trans>}>
            <CodeBlock code={connectSnippet(data.id)} label="Python · E2B SDK" />
          </Panel>

          {DESKTOP_TEMPLATES.includes(data.template) ? (
            <Panel title={<Trans>Desktop</Trans>}>
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
                <Monitor className="size-10" strokeWidth={1.5} aria-hidden="true" />
                <p>
                  <Trans>Chromium over VNC, in a new tab.</Trans>
                </p>
                {data.access.desktopUrl ? (
                  <a
                    href={data.access.desktopUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${buttonVariants({ variant: "outline" })} mt-2 h-11 px-3`}
                  >
                    <Trans>Open desktop</Trans>
                  </a>
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

          <Panel
            title={<Trans>Lifecycle</Trans>}
            action={
              <span className="text-label text-muted-foreground">
                <Trans>Sample events</Trans>
              </span>
            }
          >
            <ol className="m-0 flex list-none flex-col gap-4.5 p-0">
              {SAMPLE_EVENTS.map((event, index) => (
                <li key={index} className="grid grid-cols-[14px_1fr_auto] items-start gap-3.5">
                  <i className={`mt-1.5 size-2.5 rounded-full ${event.dot}`} />
                  <div>
                    <b className="block text-body1 font-semibold">{event.title}</b>
                    <span className="text-body2 text-muted-foreground">{event.note}</span>
                  </div>
                  <time className="text-body2 text-muted-foreground">[time]</time>
                </li>
              ))}
            </ol>
          </Panel>
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
              <Spec label={<Trans>Kernel</Trans>}>
                <Trans>Own, Firecracker microVM</Trans>
              </Spec>
              <Spec label={<Trans>Region</Trans>}>[REGION]</Spec>
              <Spec label={<Trans>Sizing</Trans>}>
                <span className="font-mono">space.resources</span>
              </Spec>
              <Spec label={<Trans>Created</Trans>}>{formatDate(data.createdAt, i18n.locale)}</Spec>
              {data.forkedFrom ? (
                <Spec label={<Trans>Forked from</Trans>}>
                  <ForkedFrom id={data.forkedFrom} />
                </Spec>
              ) : null}
            </dl>
          </Panel>

          <Panel
            title={<Trans>Ports</Trans>}
            action={
              <Button variant="outline" size="sm" disabled className="h-11 px-3">
                <Trans>Expose a port</Trans>
              </Button>
            }
          >
            <ul className="m-0 flex list-none flex-col p-0">
              {PORTS.map((port) => {
                const url = data.access.portUrlTemplate.replace("{port}", String(port));
                return (
                  <li
                    key={port}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <b className="block text-body1">{port}</b>
                      <span className="font-mono text-body2 break-all text-link">{url}</span>
                    </div>
                    <CopyButton value={url} label={t`Copy URL for port ${port}`} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-label text-muted-foreground">
              <Trans>
                A port needs the machine's traffic access token in the e2b-traffic-access-token
                header, so a browser tab cannot open it directly.
              </Trans>
            </p>
          </Panel>

          <Panel
            title={<Trans>Snapshots</Trans>}
            action={
              <Button variant="outline" size="sm" disabled className="h-11 px-3">
                <Trans>Take snapshot</Trans>
              </Button>
            }
          >
            <ul className="m-0 flex list-none flex-col p-0">
              {SAMPLE_SNAPSHOTS.map((name) => (
                <li
                  key={name}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
                >
                  <div>
                    <b className="block text-body1">{name}</b>
                    <span className="text-label text-muted-foreground">[SIZE] · [DATE]</span>
                  </div>
                  <Tag>
                    <Trans>Soon</Trans>
                  </Tag>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-label text-muted-foreground">
              <Trans>Sample snapshots. Snapshots are coming soon.</Trans>
            </p>
          </Panel>
        </div>
      </div>
      <p className="text-label text-muted-foreground">
        <Trans>Sample data. Values in [brackets] are placeholders.</Trans>
      </p>
    </div>
  );
}
