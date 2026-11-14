import { Plural, Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CodeBlock } from "../components/CodeBlock";
import { DocsLink } from "../components/DocsLink";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { orpc } from "../lib/api";
import { DEFAULT_TEMPLATE, githubActionsSnippet } from "../lib/snippets";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-label font-semibold text-muted-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 text-body1">{children}</div>
    </li>
  );
}

/** How to start a Rookbox machine from a CI job, in plain steps with a workflow to copy. */
export function CiPage() {
  const config = useQuery(orpc.config.get.queryOptions({ staleTime: 60_000 }));
  const template = config.data?.templates[0] ?? DEFAULT_TEMPLATE;
  const limit = config.data?.maxMachines;
  const idleMinutes = config.data
    ? Math.max(1, Math.round(config.data.defaultIdleTimeoutS / 60))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<Trans>Use in CI</Trans>} />
      <p className="max-w-[640px] text-muted-foreground">
        <Trans>
          Run a step of your pipeline on a fresh Rookbox machine: start it, run commands in it, then
          remove it. It works with the standard E2B SDK, so there is nothing new to learn.
        </Trans>
      </p>
      <p>
        <DocsLink page="guides/ci">
          <Trans>Read the docs</Trans>
        </DocsLink>
      </p>

      <Panel title={<Trans>Set it up</Trans>}>
        <ol className="flex max-w-[640px] flex-col gap-4">
          <Step n={1}>
            <Trans>
              Create an API key on the{" "}
              <Link to="/keys" className="text-link underline-offset-4 hover:underline">
                API keys
              </Link>{" "}
              page. Name it after the pipeline, so you can revoke the right one later.
            </Trans>
          </Step>
          <Step n={2}>
            <Trans>
              Store the key as a secret in your CI, named{" "}
              <span className="font-mono">ROOKBOX_API_KEY</span>. In GitHub, open Settings, then
              Secrets and variables, then Actions, and add a repository secret. Never put the key in
              your code.
            </Trans>
          </Step>
          <Step n={3}>
            <Trans>Copy the workflow below into .github/workflows/rookbox.yml and push.</Trans>
          </Step>
        </ol>
      </Panel>

      <CodeBlock code={githubActionsSnippet(template)} label="GitHub Actions · rookbox.yml" />

      <Panel title={<Trans>Good to know</Trans>}>
        <ul className="flex max-w-[640px] list-disc flex-col gap-2 pl-5 text-body1">
          <li>
            <Trans>
              Always remove the machine at the end, as the workflow does. A machine you forget stops
              on its own when its timeout runs out, but it counts toward your limit until then.
            </Trans>
          </li>
          <li>
            <Trans>
              The timeout you pass when creating a machine is how long it may live. Pick a little
              more than your job needs.
            </Trans>
          </li>
          {idleMinutes !== null ? (
            <li>
              <Plural
                value={idleMinutes}
                one="If you do not set a timeout, a machine stops after # minute."
                other="If you do not set a timeout, a machine stops after # minutes."
              />
            </li>
          ) : null}
          {limit !== undefined ? (
            <li>
              <Plural
                value={limit}
                one="Each account can have # machine at a time. Starting another one while you are at the limit fails with a 429 error, so jobs that run in parallel need to wait or use fewer machines."
                other="Each account can have # machines at a time. Starting another one while you are at the limit fails with a 429 error, so jobs that run in parallel need to wait or use fewer machines."
              />
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
