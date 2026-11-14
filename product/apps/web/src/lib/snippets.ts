/** Used until the API has said which domain machines live on. */
export const ROOKBOX_DOMAIN: string = import.meta.env.VITE_E2B_DOMAIN ?? "box.rookbox.run";

/**
 * Python, with the E2B SDK: connect to an existing machine and run a command in it. Rookbox keys
 * do not work with the SDK yet, so the key is a placeholder for the key that will.
 */
export function connectSnippet(machineId: string, domain: string = ROOKBOX_DOMAIN): string {
  return `import os
from e2b import Sandbox

sandbox = Sandbox.connect(
    "${machineId}",
    domain="${domain}",
    api_key=os.environ["E2B_API_KEY"],  # not issued yet
)
print(sandbox.commands.run("uname -a").stdout)`;
}

export type CreateSnippetLanguage = "python" | "typescript";

/**
 * Creates a machine with the E2B SDK pointed at Rookbox. The key is a placeholder: a person's own
 * key comes from the API keys page and is read from the environment, never written into code.
 */
export function createSnippet(
  language: CreateSnippetLanguage,
  domain: string = ROOKBOX_DOMAIN,
): string {
  if (language === "python") {
    return `import os
from e2b import Sandbox

sandbox = Sandbox.create(
    domain="${domain}",
    api_key=os.environ["E2B_API_KEY"],  # your rbx_... key
)
print(sandbox.sandbox_id)`;
  }
  return `import { Sandbox } from "e2b";

const sandbox = await Sandbox.create({
  domain: "${domain}",
  apiKey: process.env.E2B_API_KEY, // your rbx_... key
});
console.log(sandbox.sandboxId);`;
}
