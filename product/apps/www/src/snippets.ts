import type { Copy } from "./i18n/copy";

export type Tone = "c" | "o" | "m";
/** One line of the sample session: the step it belongs to, its text and how it is drawn. */
export type SessionLine = readonly [step: number, text: string, tone: Tone];
export type Sessions = { py: SessionLine[]; ts: SessionLine[]; cli: SessionLine[] };

/**
 * The sample session shown in the hero terminal. The code is the same in every language; only the
 * comments come from the copy. `[your-domain]`, `[cli]` and the fork call are owner placeholders.
 */
export function buildSessions(s: Copy["demo"]["session"]): Sessions {
  return {
    py: [
      [0, 'sbx = Sandbox.create(template="seed")', "c"],
      [0, `# ${s.ready}`, "m"],
      [1, 'sbx.commands.run("uname -sr").stdout', "c"],
      [1, "Linux 6.1", "o"],
      [2, "sbx.get_host(3000)", "c"],
      [2, "3000-4f2a.[your-domain]", "o"],
      [3, `sbx.pause()  # ${s.pause}`, "c"],
      [3, `# ${s.saved}`, "m"],
      [4, `sbx.fork()  # [${s.fork}]`, "c"],
      [4, `# ${s.forkChild}`, "m"],
    ],
    ts: [
      [0, 'const sbx = await Sandbox.create("seed")', "c"],
      [0, `// ${s.ready}`, "m"],
      [1, 'await sbx.commands.run("uname -sr")', "c"],
      [1, "Linux 6.1", "o"],
      [2, "sbx.getHost(3000)", "c"],
      [2, "3000-4f2a.[your-domain]", "o"],
      [3, `await sbx.pause()  // ${s.pause}`, "c"],
      [3, `// ${s.saved}`, "m"],
      [4, `await sbx.fork()  // [${s.fork}]`, "c"],
      [4, `// ${s.forkChild}`, "m"],
    ],
    cli: [
      [0, "$ [cli] create seed", "c"],
      [0, `4f2a  running  ${s.cliReady}`, "o"],
      [1, "$ [cli] exec 4f2a -- uname -sr", "c"],
      [1, "Linux 6.1", "o"],
      [2, "$ [cli] expose 4f2a 3000", "c"],
      [2, "https://3000-4f2a.[your-domain]", "o"],
      [3, "$ [cli] suspend 4f2a", "c"],
      [3, `4f2a  suspended  ${s.cliSaved}`, "o"],
      [4, "$ [cli] fork 4f2a", "c"],
      [4, `9c1e  running  ${s.cliFork}`, "o"],
    ],
  };
}

/** The env-var change the E2B section shows. */
export const ENV_BEFORE = "export E2B_DOMAIN=e2b.dev";
export const ENV_AFTER = "export E2B_DOMAIN=[your-domain]";
