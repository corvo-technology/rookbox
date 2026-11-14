import { createInterface } from "node:readline";

type In = NodeJS.ReadStream;
type Out = { write(s: string): unknown };

/** One line from a stream that is not a terminal (`echo key | rookbox login`). */
export async function readLine(stdin: In): Promise<string> {
  const rl = createInterface({ input: stdin, terminal: false });
  try {
    for await (const line of rl) return line.trim();
    return "";
  } finally {
    rl.close();
  }
}

/** Reads a line from a terminal without echoing it. Ctrl-C and Ctrl-D cancel. */
export function readSecret(stdin: In, stdout: Out, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    let value = "";
    const done = (finish: () => void) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      finish();
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") return done(() => resolve(value.trim()));
        if (char === "\u0003" || char === "\u0004") {
          return done(() => reject(new Error("cancelled")));
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

/** Asks a yes/no question on a terminal. Anything but y/s is no. */
export async function confirm(stdin: In, stdout: Out, question: string): Promise<boolean> {
  stdout.write(question);
  const rl = createInterface({ input: stdin, terminal: false });
  try {
    for await (const line of rl) return /^(y|yes|s|sim)$/i.test(line.trim());
    return false;
  } finally {
    rl.close();
  }
}
