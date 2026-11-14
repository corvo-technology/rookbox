import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rookbox/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { orpc } from "../lib/api";
import { DEFAULT_TEMPLATE, envSnippet, jsSnippet, pythonSnippet } from "../lib/snippets";
import { CodeBlock } from "./CodeBlock";
import { DocsLink } from "./DocsLink";
import { Segmented } from "./Segmented";

/** What the machines list shows before the first machine: make one here, or from code. */
export function FirstMachine({ onCreate }: { onCreate: () => void }) {
  const { t } = useLingui();
  const config = useQuery(orpc.config.get.queryOptions({ staleTime: 60_000 }));
  const [language, setLanguage] = useState<"js" | "python">("js");
  const template = config.data?.templates[0] ?? DEFAULT_TEMPLATE;

  return (
    <section
      aria-labelledby="first-machine-title"
      className="grid gap-8 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[5fr_7fr] lg:p-8"
    >
      <div className="flex flex-col items-start gap-4">
        <h2
          id="first-machine-title"
          className="text-heading2 font-semibold tracking-[-0.02em] text-balance"
        >
          <Trans>Start your first machine</Trans>
        </h2>
        <p className="max-w-[46ch] text-body1 text-pretty text-muted-foreground">
          <Trans>
            A machine is your own Linux computer in the cloud. Run commands, open a desktop or host
            something, then suspend it and pick up where you left off.
          </Trans>
        </p>
        <Button className="h-11 px-[18px] text-body1 font-semibold" onClick={onCreate}>
          <Plus aria-hidden="true" />
          <Trans>New machine</Trans>
        </Button>
        <DocsLink page="quickstart">
          <Trans>Read the docs</Trans>
        </DocsLink>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body2 font-semibold">
            <Trans>Or create one from code</Trans>
          </p>
          <Segmented
            label={t`Language`}
            value={language}
            onChange={setLanguage}
            options={[
              { value: "js", label: "JavaScript" },
              { value: "python", label: "Python" },
            ]}
          />
        </div>
        <CodeBlock code={envSnippet()} label={t`Environment`} />
        {language === "js" ? (
          <CodeBlock code={jsSnippet(template)} label="JavaScript · npm install e2b" />
        ) : (
          <CodeBlock code={pythonSnippet(template)} label="Python · pip install e2b" />
        )}
        <p className="text-label text-muted-foreground">
          <Trans>
            Replace <code className="font-mono">rbx_your_key_here</code> with a key from{" "}
            <Link to="/keys" className="text-link underline-offset-4 hover:underline">
              API keys
            </Link>
            .
          </Trans>
        </p>
      </div>
    </section>
  );
}
