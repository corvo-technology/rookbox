import { describe, expect, it } from "vitest";
import { createEmailSender } from "./email.js";
import { waitlistInvitedEmail, waitlistJoinedEmail } from "./email-templates.js";
import { loadEnv } from "./env.js";
import { silentLogger } from "./logger.js";
import { createRateLimiter } from "./rate-limit.js";
import { setupApp } from "./test-app.js";
import { type Credentials, createUserAdmin, type UserRecord, type UserStore } from "./users.js";
import { createWaitlist, type WaitlistRecord, type WaitlistStore } from "./waitlist.js";

const WWW = "https://www.example.test";

function memoryWaitlist(): WaitlistStore & { rows: Map<string, WaitlistRecord> } {
  const rows = new Map<string, WaitlistRecord>();
  return {
    rows,
    async insert(entry) {
      if (rows.has(entry.email)) return "exists";
      rows.set(entry.email, {
        ...entry,
        status: "waiting",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        invitedAt: null,
      });
      return "created";
    },
    async find(email) {
      return rows.get(email) ?? null;
    },
    async list() {
      return [...rows.values()];
    },
    async markInvited(email, at) {
      const row = rows.get(email);
      if (row) Object.assign(row, { status: "invited", invitedAt: at });
    },
  };
}

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };

/** A Resend that records what it was sent. `status` decides the answer. */
function fakeResend(status = 200) {
  const sent: Sent[] = [];
  const fetchFn: typeof fetch = async (url, init) => {
    sent.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify({ id: "msg_1" }), { status });
  };
  return { sent, fetchFn };
}

function memoryUsers() {
  const users = new Map<string, UserRecord>();
  const store: UserStore = {
    async findByEmail(email) {
      return users.get(email) ?? null;
    },
    async list() {
      return [...users.values()];
    },
    async setDisabled() {},
    async deleteSessions() {},
  };
  const credentials: Credentials = {
    async create({ email, name }) {
      users.set(email, {
        id: email.split("@")[0] ?? email,
        email,
        name,
        disabledAt: null,
        createdAt: new Date(),
      });
    },
    async setPassword() {},
  };
  return { users, userAdmin: createUserAdmin({ store, credentials, logger: silentLogger }) };
}

function setup(options: { apiKey?: string; resendStatus?: number; max?: number } = {}) {
  const store = memoryWaitlist();
  const resend = fakeResend(options.resendStatus);
  const email = createEmailSender({
    apiKey: "apiKey" in options ? options.apiKey : "re_test",
    from: "Rookbox <hello@example.test>",
    logger: silentLogger,
    fetch: resend.fetchFn,
    retryDelaysMs: [],
  });
  const waitlist = createWaitlist({
    store,
    email,
    logger: silentLogger,
    signInUrl: "https://app.example.test",
  });
  const accounts = memoryUsers();
  const harness = setupApp({
    waitlist,
    wwwOrigin: WWW,
    waitlistLimiter: createRateLimiter({ max: options.max ?? 3, windowMs: 60_000 }),
    userAdmin: accounts.userAdmin,
    trustedProxyHops: 1,
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    harness.app.fetch(
      new Request("http://api.test/waitlist", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: WWW,
          "x-forwarded-for": "203.0.113.7",
          ...headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  return { ...harness, store, resend, post, accounts };
}

describe("POST /waitlist", () => {
  it("stores a valid entry lowercased and sends the confirmation in the visitor's language", async () => {
    const { post, store, resend } = setup();
    const res = await post({
      email: " Ana@Example.test ".trim(),
      note: "browser use",
      locale: "pt",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe(WWW);
    expect(store.rows.get("ana@example.test")).toMatchObject({
      note: "browser use",
      locale: "pt",
      status: "waiting",
    });
    expect(resend.sent).toHaveLength(1);
    const [mail] = resend.sent;
    expect(mail?.url).toBe("https://api.resend.com/emails");
    expect(mail?.headers.get("authorization")).toBe("Bearer re_test");
    expect(mail?.headers.get("idempotency-key")).toBeTruthy();
    expect(mail?.body).toMatchObject({
      to: ["ana@example.test"],
      from: "Rookbox <hello@example.test>",
    });
    expect(String(mail?.body.subject)).toContain("lista de espera");
    expect(String(mail?.body.html)).toContain('lang="pt-BR"');
    expect(String(mail?.body.text)).toContain("Você está na lista");
  });

  it("is idempotent: the same email twice stores one row and sends one email", async () => {
    const { post, store, resend } = setup();
    expect((await post({ email: "a@example.test" })).status).toBe(200);
    const again = await post({ email: "A@Example.test" });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
    expect(store.rows.size).toBe(1);
    expect(resend.sent).toHaveLength(1);
  });

  it("refuses a bad email without storing anything", async () => {
    const { post, store, resend } = setup({ max: 10 });
    for (const body of [{ email: "nope" }, {}, { email: "a@b" }, "not json"]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    expect(store.rows.size).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  it("answers a filled honeypot like a success but stores and sends nothing", async () => {
    const { post, store, resend } = setup();
    const res = await post({ email: "bot@example.test", website: "http://spam.test" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.rows.size).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  it("limits joins per address", async () => {
    const { post } = setup({ max: 2 });
    expect((await post({ email: "a@example.test" })).status).toBe(200);
    expect((await post({ email: "b@example.test" })).status).toBe(200);
    const blocked = await post({ email: "c@example.test" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    // Another address has its own budget.
    const other = await post({ email: "d@example.test" }, { "x-forwarded-for": "198.51.100.9" });
    expect(other.status).toBe(200);
  });

  it("answers the landing page's origin only", async () => {
    const { post, store, app } = setup();
    const foreign = await post(
      { email: "a@example.test" },
      { origin: "https://evil.example.test" },
    );
    expect(foreign.status).toBe(403);
    expect(store.rows.size).toBe(0);
    const preflight = await app.fetch(
      new Request("http://api.test/waitlist", {
        method: "OPTIONS",
        headers: {
          origin: WWW,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    );
    expect(preflight.headers.get("access-control-allow-origin")).toBe(WWW);
    const bad = await app.fetch(
      new Request("http://api.test/waitlist", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example.test", "access-control-request-method": "POST" },
      }),
    );
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps the signup when the email provider fails or is not configured", async () => {
    const failing = setup({ resendStatus: 500 });
    expect((await failing.post({ email: "a@example.test" })).status).toBe(200);
    expect(failing.store.rows.size).toBe(1);

    const silent = setup({ apiKey: undefined });
    expect((await silent.post({ email: "b@example.test" })).status).toBe(200);
    expect(silent.store.rows.size).toBe(1);
    expect(silent.resend.sent).toHaveLength(0);
  });
});

describe("email sender", () => {
  it("retries a 429 once with the same idempotency key, and gives up quietly", async () => {
    const calls: Headers[] = [];
    let n = 0;
    const sender = createEmailSender({
      apiKey: "re_test",
      from: "Rookbox <hello@example.test>",
      logger: silentLogger,
      retryDelaysMs: [1],
      fetch: async (_url, init) => {
        calls.push(new Headers(init?.headers));
        return new Response("{}", { status: n++ === 0 ? 429 : 200 });
      },
    });
    const ok = await sender.send({
      to: "a@example.test",
      subject: "s",
      html: "<p>x</p>",
      text: "x",
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.get("idempotency-key")).toBe(calls[1]?.get("idempotency-key"));

    const broken = createEmailSender({
      apiKey: "re_test",
      from: "x <a@example.test>",
      logger: silentLogger,
      retryDelaysMs: [],
      fetch: async () => {
        throw new Error("network");
      },
    });
    expect(await broken.send({ to: "a@example.test", subject: "s", html: "", text: "" })).toBe(
      false,
    );
  });

  it("posts to a Resend-compatible endpoint when one is given", async () => {
    const urls: string[] = [];
    const sender = createEmailSender({
      apiKey: "k",
      from: "Pedro at Rook <pedro@example.test>",
      endpoint: "https://mail.example.test/emails",
      logger: silentLogger,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response("{}");
      },
    });
    expect(await sender.send({ to: "a@example.test", subject: "s", html: "", text: "" })).toBe(
      true,
    );
    expect(urls).toEqual(["https://mail.example.test/emails"]);
  });

  it("reads the Rook-compatible email settings from the environment", () => {
    const base = {
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "https://api.example.test",
      APP_ORIGIN: "https://app.example.test",
      ROOKBOX_ALLOWED_EMAILS: "o@example.test",
      SPACE_ECW_API_URL: "https://api.box.example.test",
      E2B_DOMAIN: "box.example.test",
    };
    expect(loadEnv(base).EMAIL_PROVIDER).toBe("none");
    const ok = loadEnv({
      ...base,
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "k",
      EMAIL_FROM: "Pedro at Rook <pedro@example.test>",
      EMAIL_API_URL: "https://mail.example.test/emails",
    });
    expect(ok.EMAIL_API_URL).toBe("https://mail.example.test/emails");
    expect(() => loadEnv({ ...base, EMAIL_API_URL: "http://mail.example.test/e" })).toThrow(
      /EMAIL_API_URL/,
    );
    expect(() => loadEnv({ ...base, EMAIL_PROVIDER: "resend" })).toThrow(/EMAIL_API_KEY/);
  });

  it("renders table-based, light and dark safe HTML with a plain-text part", () => {
    const invited = waitlistInvitedEmail({
      to: "a@example.test",
      locale: "en",
      signInUrl: "https://app.example.test",
      password: "p<w>&1",
    });
    expect(invited.html).toContain("<table");
    expect(invited.html).toContain("prefers-color-scheme: dark");
    expect(invited.html).toContain("p&lt;w&gt;&amp;1");
    expect(invited.html).toContain('href="https://app.example.test"');
    expect(invited.text).toContain("p<w>&1");
    expect(invited.text).toContain("https://app.example.test");
    for (const locale of ["en", "pt", "es"] as const) {
      const joined = waitlistJoinedEmail("a@example.test", locale);
      expect(joined.subject).not.toBe("");
      expect(joined.text.length).toBeGreaterThan(50);
    }
  });
});

describe("admin waitlist", () => {
  it("answers FORBIDDEN to a non-admin", async () => {
    const { client } = setup();
    await expect(client("ana").admin.waitlist.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      client("ana").admin.waitlist.invite({ email: "x@example.test" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists entries for an admin", async () => {
    const { client, post } = setup();
    await post({ email: "a@example.test", note: "agents" });
    const rows = await client("admin").admin.waitlist.list();
    expect(rows).toEqual([
      expect.objectContaining({ email: "a@example.test", note: "agents", status: "waiting" }),
    ]);
  });

  it("invites: creates the account, marks the entry and emails the sign-in link and password", async () => {
    const { client, post, store, resend, accounts } = setup();
    await post({ email: "a@example.test", locale: "es" });
    const result = await client("admin").admin.waitlist.invite({ email: "a@example.test" });
    expect(result).toMatchObject({ email: "a@example.test", emailed: true });
    expect(result.password).toHaveLength(24);
    expect(accounts.users.has("a@example.test")).toBe(true);
    expect(store.rows.get("a@example.test")).toMatchObject({ status: "invited" });
    expect(store.rows.get("a@example.test")?.invitedAt).toBeInstanceOf(Date);
    const mail = resend.sent.at(-1);
    expect(String(mail?.body.subject)).toContain("invitación");
    expect(String(mail?.body.text)).toContain(result.password);
    expect(String(mail?.body.text)).toContain("https://app.example.test");
    // The entry shows as invited, and a second invite is refused.
    const rows = await client("admin").admin.waitlist.list();
    expect(rows[0]).toMatchObject({ status: "invited" });
    await expect(
      client("admin").admin.waitlist.invite({ email: "a@example.test" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("still returns the password when the email cannot be sent", async () => {
    const { client, post } = setup({ resendStatus: 500 });
    await post({ email: "a@example.test" });
    const result = await client("admin").admin.waitlist.invite({ email: "a@example.test" });
    expect(result.emailed).toBe(false);
    expect(result.password).toBeTruthy();
  });

  it("refuses an email that is not on the list", async () => {
    const { client } = setup();
    await expect(
      client("admin").admin.waitlist.invite({ email: "ghost@example.test" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
