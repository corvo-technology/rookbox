const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** Copy text to HTML: escapes it, then turns `code` into a monospace span. */
export function rich(text: string): string {
  const escaped = text.replace(/[&<>"]/g, (char) => ESCAPES[char]!);
  return escaped.replace(/`([^`]+)`/g, '<span class="mono">$1</span>');
}
