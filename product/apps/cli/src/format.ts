export type Style = {
  bold(s: string): string;
  dim(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  red(s: string): string;
};

/** Colors only when asked for: a terminal, and `NO_COLOR` unset (https://no-color.org). */
export function makeStyle(enabled: boolean): Style {
  const wrap = (open: number, close: number) => (s: string) =>
    enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s;
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    red: wrap(31, 39),
  };
}

export function colorEnabled(isTty: boolean, env: Record<string, string | undefined>): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.TERM === "dumb") return false;
  return isTty;
}

/** `90s`, `30m`, `2h`, `1h30m` or bare seconds, to milliseconds. Null when unreadable. */
export function parseDuration(text: string): number | null {
  const value = text.trim().toLowerCase();
  if (value === "") return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return null;
  const [, h, m, s] = match;
  return ((Number(h ?? 0) * 60 + Number(m ?? 0)) * 60 + Number(s ?? 0)) * 1000;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}m`;
}

/** A left-aligned table. Widths are measured on plain text; `paint` colors a cell afterwards. */
export function table(
  rows: string[][],
  paint: (column: number, row: number, cell: string) => string = (_c, _r, cell) => cell,
): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row, r) => {
      const last = row.length - 1;
      return row
        .map((cell, c) => {
          const pad = c === last ? 0 : (widths[c] ?? 0) - cell.length;
          return paint(c, r, cell) + " ".repeat(pad);
        })
        .join("  ")
        .trimEnd();
    })
    .join("\n");
}
