import { randomBytes } from "node:crypto";
import { type Auth, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./auth.js";
import type { Db } from "./db.js";
import type { Logger } from "./logger.js";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  disabledAt: Date | null;
  createdAt: Date;
};

/** Where accounts live. The Prisma version is below; tests use a map. */
export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | null>;
  list(): Promise<UserRecord[]>;
  setDisabled(id: string, at: Date | null): Promise<void>;
  /** Ends every login of the account. */
  deleteSessions(id: string): Promise<void>;
}

/** Password hashing and storage, through better-auth, never raw SQL. */
export interface Credentials {
  create(input: { email: string; name: string; password: string }): Promise<void>;
  setPassword(userId: string, password: string): Promise<void>;
}

/** A failure the CLI prints as-is (no secret in it). */
export class UserAdminError extends Error {}

export function createPrismaUserStore(db: Db): UserStore {
  return {
    findByEmail: (email) => db.user.findUnique({ where: { email } }),
    list: () => db.user.findMany({ orderBy: { createdAt: "asc" } }),
    async setDisabled(id, at) {
      await db.user.update({ where: { id }, data: { disabledAt: at } });
    },
    async deleteSessions(id) {
      await db.session.deleteMany({ where: { userId: id } });
    },
  };
}

/** Hashes with better-auth's own hasher and writes through its adapter. */
export function createAuthCredentials(auth: Auth): Credentials {
  return {
    async create({ email, name, password }) {
      await auth.api.signUpEmail({ body: { email, password, name } });
    },
    async setPassword(userId, password) {
      const context = await auth.$context;
      await context.internalAdapter.updatePassword(userId, await context.password.hash(password));
    },
  };
}

/** 24 URL-safe characters from 18 random bytes (144 bits). */
export function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UserAdminError(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new UserAdminError(`The password can have at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
}

export type UserAdminDeps = {
  store: UserStore;
  credentials: Credentials;
  /** `ROOKBOX_ALLOWED_EMAILS`, lower-case. The gate for who may have an account. */
  allowedEmails: readonly string[];
  /** Suspends every running machine of the account (`machines.suspendAll`). */
  suspendMachines?: (
    userId: string,
  ) => Promise<{ suspended: number; skipped: number; failed: number }>;
  logger: Logger;
};

export function createUserAdmin(deps: UserAdminDeps) {
  const { store, credentials, logger } = deps;
  const normalize = (email: string) => email.trim().toLowerCase();

  async function existing(email: string): Promise<UserRecord> {
    const user = await store.findByEmail(normalize(email));
    if (!user) throw new UserAdminError("No account has that email.");
    return user;
  }

  return {
    /**
     * Creates an account for an allowed email. Without a password one is generated; it is returned
     * once for the caller to show, and is never logged or stored in clear.
     */
    async create(input: { email: string; name: string; password?: string }) {
      const email = normalize(input.email);
      const name = input.name.trim();
      if (!name) throw new UserAdminError("A name is required.");
      if (!deps.allowedEmails.includes(email)) {
        throw new UserAdminError(
          "That email is not in ROOKBOX_ALLOWED_EMAILS. Add it there first (the allowlist gates sign-up).",
        );
      }
      if (await store.findByEmail(email)) throw new UserAdminError("An account already exists.");
      const generated = input.password === undefined;
      const password = input.password ?? generatePassword();
      checkPassword(password);
      await credentials.create({ email, name, password });
      logger.info("user created", { email });
      return { email, password, generated };
    },

    /** Replaces the password and ends every login. There is no e-mail provider, so this is the reset. */
    async setPassword(input: { email: string; password?: string }) {
      const user = await existing(input.email);
      const generated = input.password === undefined;
      const password = input.password ?? generatePassword();
      checkPassword(password);
      await credentials.setPassword(user.id, password);
      await store.deleteSessions(user.id);
      logger.info("user password reset", { email: user.email });
      return { email: user.email, password, generated };
    },

    /** The kill switch: no sign-in, sessions and keys refused at once. Machines keep running unless asked. */
    async disable(input: { email: string; suspendMachines?: boolean }) {
      const user = await existing(input.email);
      if (!user.disabledAt) await store.setDisabled(user.id, new Date());
      await store.deleteSessions(user.id);
      logger.warn("user disabled", { email: user.email });
      let suspended: { suspended: number; skipped: number; failed: number } | null = null;
      if (input.suspendMachines) {
        if (!deps.suspendMachines)
          throw new UserAdminError("Suspending machines is not available.");
        suspended = await deps.suspendMachines(user.id);
      }
      return { email: user.email, suspended };
    },

    async enable(input: { email: string }) {
      const user = await existing(input.email);
      await store.setDisabled(user.id, null);
      logger.info("user enabled", { email: user.email });
      return { email: user.email };
    },

    async list() {
      return (await store.list()).map((user) => ({
        email: user.email,
        name: user.name,
        status: user.disabledAt ? ("disabled" as const) : ("active" as const),
        allowed: deps.allowedEmails.includes(user.email.toLowerCase()),
        createdAt: user.createdAt,
      }));
    },
  };
}

export type UserAdmin = ReturnType<typeof createUserAdmin>;
