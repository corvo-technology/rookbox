import { SDK_DOMAIN } from "./site";

/** The hero's snippets: the unmodified E2B SDK pointed at Rook Box. */
export const SNIPPETS = [
  {
    language: "Python",
    code: `import os
from e2b import Sandbox

sandbox = Sandbox.create(
    template="seed",
    domain="${SDK_DOMAIN}",
    api_key=os.environ["ROOKBOX_API_KEY"],
)
print(sandbox.commands.run("uname -s").stdout)`,
  },
  {
    language: "TypeScript",
    code: `import { Sandbox } from "e2b";

const sandbox = await Sandbox.create("seed", {
  domain: "${SDK_DOMAIN}",
  apiKey: process.env.ROOKBOX_API_KEY,
});
const { stdout } = await sandbox.commands.run("uname -s");`,
  },
] as const;

/** The SDK section: the only lines that change from an E2B setup. */
export const SDK_DIFF: { mark: " " | "+"; line: string }[] = [
  { mark: " ", line: "sandbox = Sandbox.create(" },
  { mark: " ", line: '    template="seed",' },
  { mark: "+", line: `    domain="${SDK_DOMAIN}",` },
  { mark: "+", line: '    api_key=os.environ["ROOKBOX_API_KEY"],' },
  { mark: " ", line: ")" },
];
