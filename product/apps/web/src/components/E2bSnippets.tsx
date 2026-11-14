import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "../lib/api";
import { DEFAULT_TEMPLATE, envSnippet, jsSnippet, pythonSnippet } from "../lib/snippets";
import { CodeBlock } from "./CodeBlock";
import { DocsLink } from "./DocsLink";
import { Panel } from "./Panel";
import { Segmented } from "./Segmented";

/** How to use a Rookbox key with the unmodified E2B SDKs: the two variables and a first script. */
export function E2bSnippets() {
  const { t } = useLingui();
  const [language, setLanguage] = useState<"js" | "python">("js");
  const config = useQuery(orpc.config.get.queryOptions({ staleTime: 60_000 }));
  const template = config.data?.templates[0] ?? DEFAULT_TEMPLATE;

  return (
    <Panel
      title={<Trans>Use with the E2B SDK</Trans>}
      action={
        <Segmented
          label={t`Language`}
          value={language}
          onChange={setLanguage}
          options={[
            { value: "js", label: "JavaScript" },
            { value: "python", label: "Python" },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body2 text-muted-foreground">
          <Trans>
            Your Rookbox key works with the standard E2B SDK, with no changes to your code. Set two
            environment variables and use the SDK as usual.
          </Trans>
        </p>
        <CodeBlock code={envSnippet()} label={t`Environment`} />
        {language === "js" ? (
          <CodeBlock code={jsSnippet(template)} label="JavaScript · npm install e2b" />
        ) : (
          <CodeBlock code={pythonSnippet(template)} label="Python · pip install e2b" />
        )}
        <p className="text-label text-muted-foreground">
          <Trans>
            Machines you create this way show up in your dashboard and count toward your machine
            limit. Do not set E2B_DOMAIN: the API tells the SDK where the machine is.
          </Trans>
        </p>
        <p className="text-label">
          <DocsLink page="quickstart">
            <Trans>Read the docs</Trans>
          </DocsLink>
        </p>
      </div>
    </Panel>
  );
}
