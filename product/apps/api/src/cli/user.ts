// `node dist/cli/user.js <command>`: account management for the owner, since there is no sign-up
// page and no e-mail provider. Needs the same environment as the server.
//
//   create --email x --name y [--password-stdin]   prints the password once on stdout
//   set-password --email x [--password-stdin]      the password reset; prints a new one unless given
//   disable --email x [--suspend-machines]         the kill switch
//   enable --email x
//   list
//
// The only secret ever printed is the password a command just set, once, on stdout. Nothing is
// logged: the logger here is silent below `error`.
import { parseArgs } from "node:util";
import { createAuth } from "../auth.js";
import { createDb } from "../db.js";
import { loadEnv } from "../env.js";
import { createLogger } from "../logger.js";
import { createMachineService } from "../machines/service.js";
import { createPrismaMachineStore } from "../machines/store.js";
import { createEcwClient } from "../space/client.js";
import {
  createAuthCredentials,
  createPrismaUserStore,
  createUserAdmin,
  UserAdminError,
} from "../users.js";

const USAGE = `Usage:
  user create --email <email> --name <name> [--password-stdin]
  user set-password --email <email> [--password-stdin]
  user disable --email <email> [--suspend-machines]
  user enable --email <email>
  user list
`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

function fail(message: string, code = 2): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

const [command, ...rest] = process.argv.slice(2);
let values: {
  email?: string;
  name?: string;
  "password-stdin"?: boolean;
  "suspend-machines"?: boolean;
};
try {
  values = parseArgs({
    args: rest,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      "password-stdin": { type: "boolean" },
      "suspend-machines": { type: "boolean" },
    },
    strict: true,
  }).values;
} catch (error) {
  fail(`${(error as Error).message}\n${USAGE}`);
}
if (!command || !["create", "set-password", "disable", "enable", "list"].includes(command)) {
  fail(USAGE);
}
if (command !== "list" && !values.email) fail(`--email is required.\n${USAGE}`);
if (command === "create" && !values.name) fail(`--name is required.\n${USAGE}`);

const env = loadEnv();
const logger = createLogger("error", { service: "rookbox-user" });
const { db, close } = createDb(env.DATABASE_URL);
try {
  const auth = createAuth(db, env, logger, { allowSignUp: true });
  const store = createPrismaMachineStore(db);
  const space = createEcwClient({
    baseUrl: env.SPACE_ECW_API_URL,
    apiKey: env.SPACE_ECW_API_KEY,
    domain: env.E2B_DOMAIN,
    timeoutMs: env.SPACE_TIMEOUT_MS,
    maxOutputBytes: env.EXEC_MAX_OUTPUT_BYTES,
  });
  const machines = createMachineService({
    store,
    space,
    logger,
    e2bDomain: env.E2B_DOMAIN,
    templates: env.SPACE_TEMPLATES,
    defaultIdleTimeoutS: env.MACHINE_IDLE_TIMEOUT_S,
    maxMachinesPerUser: env.MAX_MACHINES_PER_USER,
  });
  const admin = createUserAdmin({
    store: createPrismaUserStore(db),
    credentials: createAuthCredentials(auth),
    allowedEmails: env.ROOKBOX_ALLOWED_EMAILS,
    suspendMachines: (userId) => machines.suspendAll(userId),
    logger,
  });
  const email = values.email ?? "";
  const password = values["password-stdin"] ? await readStdin() : undefined;

  if (command === "create") {
    const result = await admin.create({ email, name: values.name ?? "", password });
    process.stdout.write(`Created ${result.email}\n`);
    if (result.generated) process.stdout.write(`Password (shown once): ${result.password}\n`);
  } else if (command === "set-password") {
    const result = await admin.setPassword({ email, password });
    process.stdout.write(`Password reset for ${result.email}; every login ended.\n`);
    if (result.generated) process.stdout.write(`Password (shown once): ${result.password}\n`);
  } else if (command === "disable") {
    const result = await admin.disable({
      email,
      suspendMachines: values["suspend-machines"] === true,
    });
    process.stdout.write(`Disabled ${result.email}\n`);
    if (result.suspended) {
      const { suspended, skipped, failed } = result.suspended;
      process.stdout.write(
        `Machines: ${suspended} suspended, ${skipped} skipped, ${failed} failed\n`,
      );
    }
  } else if (command === "enable") {
    const result = await admin.enable({ email });
    process.stdout.write(`Enabled ${result.email}\n`);
  } else {
    for (const user of await admin.list()) {
      const note = user.allowed ? "" : " (not in ROOKBOX_ALLOWED_EMAILS)";
      process.stdout.write(
        `${user.email}\t${user.name}\t${user.status}\t${user.createdAt.toISOString()}${note}\n`,
      );
    }
  }
} catch (error) {
  if (error instanceof UserAdminError) fail(error.message, 1);
  process.stderr.write("The command failed. Check DATABASE_URL and the log level.\n");
  if (process.env.LOG_LEVEL === "debug") process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
} finally {
  await close();
}
