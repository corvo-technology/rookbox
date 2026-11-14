import { useState } from "react";
import type { E2bSnippets } from "../snippets";

type Props = {
  snippets: E2bSnippets;
  languageLabel: string;
  before: string;
  after: string;
  code: string;
};

const TABS = [
  { id: "py", label: "Python" },
  { id: "ts", label: "TypeScript" },
] as const;

/** Two env vars change; the SDK code underneath stays exactly the same. */
export function E2bSnippet({ snippets, languageLabel, before, after, code }: Props) {
  const [lang, setLang] = useState<"py" | "ts">("py");
  return (
    <div className="e2b-code">
      <div className="e2b-code__pair">
        <figure className="code mono">
          <figcaption>{before}</figcaption>
          <pre>{snippets.env.before}</pre>
        </figure>
        <figure className="code mono code--after">
          <figcaption>{after}</figcaption>
          <pre>{snippets.env.after}</pre>
        </figure>
      </div>
      <figure className="code mono code--same">
        <figcaption>
          <span>{code}</span>
          {/* biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out inline in a caption */}
          <span className="toggle" role="group" aria-label={languageLabel}>
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
          </span>
        </figcaption>
        <pre>{snippets.code[lang]}</pre>
      </figure>
    </div>
  );
}
