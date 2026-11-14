import { Trans, useLingui } from "@lingui/react/macro";
import { CLI_INSTALL } from "../lib/site";
import { CodeBlock } from "./CodeBlock";
import { DocsLink } from "./DocsLink";
import { Panel } from "./Panel";

/** The command line tool, one line to install it. */
export function CliHint() {
  const { t } = useLingui();
  return (
    <Panel title={<Trans>Install the CLI</Trans>}>
      <div className="flex flex-col gap-3">
        <p className="text-body2 text-muted-foreground">
          <Trans>
            Create and control machines from your terminal. Install it, sign in, then run{" "}
            <span className="font-mono">rookbox new</span>.
          </Trans>
        </p>
        <CodeBlock code={CLI_INSTALL} label={t`Terminal`} />
        <p className="text-label">
          <DocsLink page="cli">
            <Trans>Read the docs</Trans>
          </DocsLink>
        </p>
      </div>
    </Panel>
  );
}
