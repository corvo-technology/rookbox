import type { Copy } from "./i18n/copy";

export type Tone = "c" | "o" | "m";
/** One line of the sample session: the step it belongs to, its text and how it is drawn. */
export type SessionLine = readonly [step: number, text: string, tone: Tone];
export type Sessions = { py: SessionLine[]; ts: SessionLine[] };

/**
 * The sample session shown in the hero terminal. The code is the same in every language; only the
 * comments come from the copy. It is an illustration: the output lines are generic.
 */
export function buildSessions(domain: string, s: Copy["demo"]["session"]): Sessions {
  const host = `3000-<sandbox-id>.${domain}`;
  return {
    py: [
      [0, 'sbx = Sandbox.create(template="base")', "c"],
      [0, `# ${s.ready}`, "m"],
      [1, 'sbx.commands.run("uname -sr").stdout', "c"],
      [1, "Linux", "o"],
      [2, "sbx.get_host(3000)", "c"],
      [2, host, "o"],
      [3, `sbx.pause()  # ${s.pause}`, "c"],
      [3, `# ${s.saved}`, "m"],
    ],
    ts: [
      [0, 'const sbx = await Sandbox.create("base")', "c"],
      [0, `// ${s.ready}`, "m"],
      [1, 'await sbx.commands.run("uname -sr")', "c"],
      [1, "Linux", "o"],
      [2, "sbx.getHost(3000)", "c"],
      [2, host, "o"],
      [3, `await sbx.pause()  // ${s.pause}`, "c"],
      [3, `// ${s.saved}`, "m"],
    ],
  };
}

export type E2bSnippets = Record<"py" | "ts", { before: string; after: string }>;

/** The E2B section: the same call before and after pointing the SDK at Rookbox. */
export function buildE2bSnippets(domain: string): E2bSnippets {
  return {
    py: {
      before: "sbx = Sandbox.create(\n    api_key=API_KEY,\n)",
      after: `sbx = Sandbox.create(\n    domain="${domain}",\n    api_key=API_KEY,\n)`,
    },
    ts: {
      before: "const sbx = await Sandbox.create({\n  apiKey: API_KEY,\n})",
      after: `const sbx = await Sandbox.create({\n  domain: "${domain}",\n  apiKey: API_KEY,\n})`,
    },
  };
}
