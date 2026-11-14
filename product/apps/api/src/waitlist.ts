import type { WaitlistEntry, WaitlistLocale } from "@rookbox/contracts";
import { systemStore } from "./database-access.js";
import type { Db } from "./db.js";
import type { EmailSender } from "./email.js";
import { waitlistInvitedEmail, waitlistJoinedEmail } from "./email-templates.js";
import type { Logger } from "./logger.js";

export type WaitlistRecord = {
  email: string;
  note: string | null;
  locale: WaitlistLocale;
  status: "waiting" | "invited";
  createdAt: Date;
  invitedAt: Date | null;
};

/** Where entries live. The Prisma version is below; tests use a map. */
export interface WaitlistStore {
  /** Adds the entry unless the email is already there. Says which happened. */
  insert(entry: {
    email: string;
    note: string | null;
    locale: WaitlistLocale;
  }): Promise<"created" | "exists">;
  /** Sets the note only if the entry has none yet. A later note never overwrites an earlier one. */
  setNoteOnce(email: string, note: string): Promise<void>;
  find(email: string): Promise<WaitlistRecord | null>;
  list(): Promise<WaitlistRecord[]>;
  markInvited(email: string, at: Date): Promise<void>;
}

export function createPrismaWaitlistStore(db: Db): WaitlistStore {
  const record = (row: {
    email: string;
    note: string | null;
    locale: string;
    status: string;
    createdAt: Date;
    invitedAt: Date | null;
  }): WaitlistRecord => ({
    ...row,
    locale: row.locale === "pt" || row.locale === "es" ? row.locale : "en",
    status: row.status === "invited" ? "invited" : "waiting",
  });
  // The waitlist is the operator's: public joins and the admin panel both run as system.
  return systemStore<WaitlistStore>(
    {
      async insert(entry) {
        // The unique index decides a race between two joins of the same address.
        const result = await db.waitlistEntry.createMany({ data: [entry], skipDuplicates: true });
        return result.count === 1 ? "created" : "exists";
      },
      async setNoteOnce(email, note) {
        await db.waitlistEntry.updateMany({ where: { email, note: null }, data: { note } });
      },
      async find(email) {
        const row = await db.waitlistEntry.findUnique({ where: { email } });
        return row ? record(row) : null;
      },
      async list() {
        return (await db.waitlistEntry.findMany({ orderBy: { createdAt: "asc" } })).map(record);
      },
      async markInvited(email, at) {
        await db.waitlistEntry.update({
          where: { email },
          data: { status: "invited", invitedAt: at },
        });
      },
    },
    "waitlist",
  );
}

export class WaitlistNotFoundError extends Error {
  constructor() {
    super("No such waitlist entry.");
  }
}

export type WaitlistDeps = {
  store: WaitlistStore;
  email: EmailSender;
  logger: Logger;
  /** Where the invitation email sends people: the dashboard. */
  signInUrl: string;
  /** The landing's origin, where the email logo is served. Default `https://rookbox.run`. */
  siteUrl?: string;
  now?: () => Date;
};

const normalize = (email: string) => email.trim().toLowerCase();

export function createWaitlist(deps: WaitlistDeps) {
  const { store, email, logger } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * Records the entry and sends the confirmation. Joining twice sends nothing the second time and
     * only fills in a note that is still empty. A failed email never fails the signup.
     */
    async join(input: { email: string; note?: string; locale?: WaitlistLocale }) {
      const address = normalize(input.email);
      const locale = input.locale ?? "en";
      const note = input.note?.trim() ? input.note.trim() : null;
      const outcome = await store.insert({ email: address, note, locale });
      if (outcome === "exists") {
        // The landing asks what they will run after the signup, as a second post for the same
        // address. It fills an empty note once and changes nothing else.
        if (note) await store.setNoteOnce(address, note);
        return { created: false as const };
      }
      logger.info("waitlist joined", { locale });
      // Awaited so the answer reflects a settled send, but `send` never throws.
      await email.send(waitlistJoinedEmail({ to: address, locale, siteUrl: deps.siteUrl }));
      return { created: true as const };
    },

    async list(): Promise<WaitlistEntry[]> {
      return (await store.list()).map((entry) => ({
        email: entry.email,
        note: entry.note,
        locale: entry.locale,
        status: entry.status,
        createdAt: entry.createdAt.toISOString(),
        invitedAt: entry.invitedAt?.toISOString() ?? null,
      }));
    },

    /**
     * Creates the account through `createAccount` (the operator's create-account logic), marks the
     * entry invited and emails the sign-in link with the temporary password. The password is also
     * returned, so the operator can pass it on if the email does not arrive.
     */
    async invite(
      input: { email: string },
      createAccount: (account: {
        email: string;
        name: string;
      }) => Promise<{ email: string; password: string }>,
    ) {
      const address = normalize(input.email);
      const entry = await store.find(address);
      if (!entry) throw new WaitlistNotFoundError();
      const name = address.split("@")[0] || address;
      const account = await createAccount({ email: address, name });
      await store.markInvited(address, now());
      const emailed = await email.send(
        waitlistInvitedEmail({
          to: address,
          locale: entry.locale,
          signInUrl: deps.signInUrl,
          siteUrl: deps.siteUrl,
          password: account.password,
        }),
      );
      logger.info("waitlist invited", { emailed });
      return { email: address, password: account.password, emailed };
    },
  };
}

export type Waitlist = ReturnType<typeof createWaitlist>;
