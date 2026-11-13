import type { ReactNode } from "react";
import { useState } from "react";

type Props = {
  toggleLabel: string;
  before: string;
  after: string;
  beforeHint: string;
  unchanged: string;
  envBefore: string;
  envAfter: string;
  /** The section heading, rendered by the page and placed above the switch. */
  children?: ReactNode;
};

/** The E2B "change one env var" diff, with a Before/After switch. */
export function EnvToggle({
  toggleLabel,
  before,
  after,
  beforeHint,
  unchanged,
  envBefore,
  envAfter,
  children,
}: Props) {
  const [mode, setMode] = useState<"before" | "after">("after");
  return (
    <div className="env">
      <div>
        {children}
        {/* biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as an inline pill group */}
        <div className="toggle" role="group" aria-label={toggleLabel}>
          <button
            type="button"
            aria-pressed={mode === "before"}
            className={mode === "before" ? "toggle__btn toggle__btn--sel" : "toggle__btn"}
            onClick={() => setMode("before")}
          >
            {before}
          </button>
          <button
            type="button"
            aria-pressed={mode === "after"}
            className={mode === "after" ? "toggle__btn toggle__btn--sel" : "toggle__btn"}
            onClick={() => setMode("after")}
          >
            {after}
          </button>
        </div>
      </div>
      <div className="code mono">
        <div className="dl dl--del">
          <em>-</em>
          <span>{envBefore}</span>
        </div>
        <div className="dl dl--add">
          <em>+</em>
          <span>{mode === "after" ? envAfter : beforeHint}</span>
        </div>
        <div className="dl dl--dim">
          <em> </em>
          <span>{unchanged}</span>
        </div>
        <div className="dl">
          <em> </em>
          <span>sbx = Sandbox.create()</span>
        </div>
        <div className="dl">
          <em> </em>
          <span>{'sbx.commands.run("npm test")'}</span>
        </div>
      </div>
    </div>
  );
}
