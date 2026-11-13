import { CopyButton } from "./CopyButton";

export function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border py-1.5 pr-1.5 pl-3">
        <span className="text-label text-muted-foreground">{label}</span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-body2 text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
