/** Placeholder until Rookbox has a public domain. */
export const ROOKBOX_DOMAIN = "box.example.com";

/** Python, with the E2B SDK: connect to an existing machine and run a command in it. */
export function connectSnippet(machineId: string): string {
  return `import os
from e2b import Sandbox

sandbox = Sandbox.connect(
    "${machineId}",
    domain="${ROOKBOX_DOMAIN}",
    api_key=os.environ["ROOKBOX_API_KEY"],
)
print(sandbox.commands.run("uname -a").stdout)`;
}
