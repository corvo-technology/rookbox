import { useEffect, useState } from "react";
import type { Sessions } from "../snippets";

type TabId = keyof Sessions;
const TABS: { id: TabId; label?: string }[] = [
  { id: "py", label: "Python" },
  { id: "ts", label: "TypeScript" },
  { id: "cli" },
];

type Props = {
  sessions: Sessions;
  steps: { label: string; note: string }[];
  languageLabel: string;
  terminalLabel: string;
  cliLabel: string;
};

/**
 * The animated terminal and the five steps beside it. Python, TypeScript and CLI tabs replay the
 * same session. The server renders the finished session; with reduced motion it stays finished,
 * otherwise it replays from the top once the page is interactive.
 */
export function SessionDemo({ sessions, steps, languageLabel, terminalLabel, cliLabel }: Props) {
  const [tab, setTab] = useState<TabId>("py");
  const [shown, setShown] = useState(sessions.py.length);
  const [reduce, setReduce] = useState(true);

  useEffect(() => {
    let prefers = false;
    try {
      prefers = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    setReduce(prefers);
    if (!prefers) setShown(0);
  }, []);

  const script = sessions[tab];

  useEffect(() => {
    if (reduce) return;
    const timer = window.setInterval(() => {
      setShown((n) => (n > script.length + 3 ? 0 : n + 1));
    }, 650);
    return () => window.clearInterval(timer);
  }, [reduce, script.length]);

  const lines = script.slice(0, shown);
  const current = lines.length ? lines[lines.length - 1]![0] : -1;
  const done = shown > script.length || (reduce && shown >= script.length);

  const pick = (id: TabId) => {
    setTab(id);
    setShown(reduce ? sessions[id].length : 0);
  };

  return (
    <div className="demo-grid">
      <div className="term">
        <div className="term__tabs" role="tablist" aria-label={languageLabel}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="term-body"
              className={tab === t.id ? "term__tab term__tab--sel" : "term__tab"}
              onClick={() => pick(t.id)}
            >
              {t.label ?? cliLabel}
            </button>
          ))}
        </div>
        <div
          id="term-body"
          className="term__body mono"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          aria-label={terminalLabel}
        >
          {lines.map(([, text, tone], i) => (
            <div key={`${tab}-${i}`} className={`ln ln--${tone}`}>
              {text}
            </div>
          ))}
          {!reduce && <span className="cursor" aria-hidden="true" />}
        </div>
      </div>
      <ol className="steps">
        {steps.map((step, i) => {
          const state = done || i < current ? "done" : i === current ? "now" : "";
          return (
            <li key={step.label} className={`step ${state ? `step--${state}` : ""}`}>
              <i>{i + 1}</i>
              <span>
                {step.label}
                <small>{step.note}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
