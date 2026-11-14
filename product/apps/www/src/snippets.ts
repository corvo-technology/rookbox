import type { Copy } from "./i18n/copy";

export type Tone = "c" | "o" | "m";
/** One line of the sample session: the step it belongs to, its text and how it is drawn. */
export type SessionLine = readonly [step: number, text: string, tone: Tone];
export type Sessions = { py: SessionLine[]; ts: SessionLine[] };

/**
 * The sample session shown in the demo. The code is the same in every language; only the
 * comments come from the copy. It is an illustration: the output lines are generic, and every
 * call exists in the E2B SDK (the machine's domain comes back in the API response).
 */
export function buildSessions(domain: string, s: Copy["demo"]["session"]): Sessions {
  const host = `3000-<sandbox-id>.${domain}`;
  return {
    py: [
      [0, "sbx = Sandbox.create()", "c"],
      [0, `# ${s.ready}`, "m"],
      [1, 'sbx.commands.run("uname -sr").stdout', "c"],
      [1, "Linux", "o"],
      [2, "sbx.get_host(3000)", "c"],
      [2, host, "o"],
      [3, `sbx.pause()  # ${s.pause}`, "c"],
      [3, `# ${s.saved}`, "m"],
      [4, "sbx = Sandbox.connect(sbx.sandbox_id)", "c"],
      [4, `# ${s.resumed}`, "m"],
    ],
    ts: [
      [0, "const sbx = await Sandbox.create()", "c"],
      [0, `// ${s.ready}`, "m"],
      [1, 'await sbx.commands.run("uname -sr")', "c"],
      [1, "Linux", "o"],
      [2, "sbx.getHost(3000)", "c"],
      [2, host, "o"],
      [3, `await sbx.pause()  // ${s.pause}`, "c"],
      [3, `// ${s.saved}`, "m"],
      [4, "await Sandbox.connect(sbx.sandboxId)", "c"],
      [4, `// ${s.resumed}`, "m"],
    ],
  };
}

export type E2bSnippets = {
  env: { before: string; after: string };
  code: Record<"py" | "ts", string>;
};

/**
 * The E2B section: the unmodified SDK reads two variables and the code does not change. The key
 * shapes match the dashboard's snippets (apps/web/src/lib/snippets.ts).
 */
export function buildE2bSnippets(apiUrl: string): E2bSnippets {
  return {
    env: {
      before: "E2B_API_KEY=e2b_...",
      after: `E2B_API_KEY=rbx_...\nE2B_API_URL=${apiUrl}`,
    },
    code: {
      py: 'from e2b import Sandbox\n\nsbx = Sandbox.create()\nprint(sbx.commands.run("uname -sr").stdout)',
      ts: 'import { Sandbox } from "e2b"\n\nconst sbx = await Sandbox.create()\nconst out = await sbx.commands.run("uname -sr")\nconsole.log(out.stdout)',
    },
  };
}
