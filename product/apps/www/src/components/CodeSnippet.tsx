import { cn } from "@rookbox/ui-web/lib/utils";
import { useEffect, useState } from "react";

type Snippet = { language: string; code: string };

/** The hero's code card: one tab per SDK language and a copy button. */
export function CodeSnippet({
  snippets,
  label,
  copyLabel,
  copiedLabel,
}: {
  snippets: readonly Snippet[];
  label: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const snippet = snippets[active] ?? snippets[0]!;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-border bg-card">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-2">
        <div role="tablist" aria-label={label} className="flex gap-1">
          {snippets.map((item, index) => (
            <button
              key={item.language}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={cn(
                "rounded-full px-3 py-1 text-body2 font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground",
                index === active && "bg-accent text-foreground",
              )}
            >
              {item.language}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippet.code);
              setCopied(true);
            } catch {
              // Clipboard blocked: the code stays selectable.
            }
          }}
          className="rounded-full border border-border px-3 py-1 text-body2 font-medium text-foreground transition-colors duration-150 hover:bg-accent"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-5 font-mono text-body2 leading-6 text-foreground">
        <code>{snippet.code}</code>
      </pre>
    </figure>
  );
}
