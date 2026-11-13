import { useState } from "react";
import type { QuickstartCode } from "../snippets";

type Props = {
  code: QuickstartCode;
  steps: { title: string; body: string }[];
  languageLabel: string;
};

const TABS = [
  { id: "py", label: "Python" },
  { id: "ts", label: "TypeScript" },
] as const;

/** The five quickstart steps. The language toggle swaps the code beside every step. */
export function Quickstart({ code, steps, languageLabel }: Props) {
  const [lang, setLang] = useState<"py" | "ts">("py");
  return (
    <div className="qs">
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
      <ol className="qs__list">
        {steps.map((step, i) => (
          <li className="qs__step" key={step.title}>
            <div className="qs__text">
              <span className="qs__n">{i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </div>
            <pre className="qs__code mono">{code[lang][i]}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
}
