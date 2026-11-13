import { useState } from "react";
import type { E2bSnippets } from "../snippets";

type Props = {
  snippets: E2bSnippets;
  languageLabel: string;
  before: string;
  after: string;
};

const TABS = [
  { id: "py", label: "Python" },
  { id: "ts", label: "TypeScript" },
] as const;

/** The same E2B call before and after: the only difference is the `domain` line. */
export function E2bSnippet({ snippets, languageLabel, before, after }: Props) {
  const [lang, setLang] = useState<"py" | "ts">("py");
  const current = snippets[lang];
  return (
    <div className="e2b-code">
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as an inline pill group */}
      <div className="toggle" role="group" aria-label={languageLabel}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={lang === tab.id}
            className={lang === tab.id ? "toggle__btn toggle__btn--sel" : "toggle__btn"}
            onClick={() => setLang(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="e2b-code__pair">
        <figure className="code mono">
          <figcaption>{before}</figcaption>
          <pre>{current.before}</pre>
        </figure>
        <figure className="code mono code--after">
          <figcaption>{after}</figcaption>
          <pre>{current.after}</pre>
        </figure>
      </div>
    </div>
  );
}
