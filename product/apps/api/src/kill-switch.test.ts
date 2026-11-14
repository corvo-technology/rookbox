import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { DESK, setupApp } from "./test-app.js";

const DESK_URL = `https://${DESK}`;

describe("kill switch over HTTP", () => {
  it("refuses a disabled user's session and API key on every rpc call, and enable restores them", async () => {
    const { client, apiKeys, disabled } = setupApp();
    const key = await apiKeys.create("alice", "ci");
    await expect(client("alice").machines.list()).resolves.toEqual([]);
    await expect(client(undefined, key.secret).machines.list()).resolves.toEqual([]);

    disabled.add("alice");
    await expect(client("alice").machines.list()).rejects.toMatchObject({ status: 401 });
    await expect(client(undefined, key.secret).machines.list()).rejects.toMatchObject({
      status: 401,
    });
    // Others are untouched.
    await expect(client("bob").machines.list()).resolves.toEqual([]);

    disabled.delete("alice");
    await expect(client("alice").machines.list()).resolves.toEqual([]);
    await expect(client(undefined, key.secret).machines.list()).resolves.toEqual([]);
  });

  it("cuts the desktop: no new link, and an open desktop session stops working", async () => {
    const { app, client, disabled } = setupApp({}, { maxMachinesPerUser: 5 });
    const machine = await client("alice").machines.create({
      name: "d",
      template: "desktop",
      size: SIZE_PRESETS.small,
    });
    const link = await client("alice").machines.desktopLink({ id: machine.id });
    const opened = await app.request(link.url);
    expect(opened.status).toBe(302);
    const cookie = (opened.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const page = `${DESK_URL}/m/${machine.id}/vnc.html`;
    expect((await app.request(page, { headers: { cookie } })).status).toBe(200);

    disabled.add("alice");
    expect((await app.request(page, { headers: { cookie } })).status).toBe(401);
    await expect(client("alice").machines.desktopLink({ id: machine.id })).rejects.toMatchObject({
      status: 401,
    });
    // A link issued before the switch no longer opens either.
    const fresh = setupApp({}, { maxMachinesPerUser: 5 });
    const m2 = await fresh.client("alice").machines.create({
      name: "d",
      template: "desktop",
      size: SIZE_PRESETS.small,
    });
    const link2 = await fresh.client("alice").machines.desktopLink({ id: m2.id });
    fresh.disabled.add("alice");
    expect((await fresh.app.request(link2.url)).status).toBe(403);

    disabled.delete("alice");
    expect((await app.request(page, { headers: { cookie } })).status).toBe(200);
    fresh.disabled.delete("alice");
    expect((await fresh.app.request(link2.url)).status).toBe(302);
  });

  it("turns create away with the beta-full error at the global cap", async () => {
    const { client } = setupApp({}, { maxMachinesPerUser: 3, maxRunningTotal: 1 });
    await client("alice").machines.create({ template: "seed", size: SIZE_PRESETS.small });
    await expect(
      client("bob").machines.create({ template: "seed", size: SIZE_PRESETS.small }),
    ).rejects.toMatchObject({
      code: "HOST_CAPACITY",
      status: 503,
      message: "The beta is full right now, try again later.",
    });
  });
});
