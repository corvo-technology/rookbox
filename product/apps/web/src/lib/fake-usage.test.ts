import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";
import { createFakeApi } from "./fake-api";
import { formatDay, formatQuantity, toGibHours, toHours } from "./usage-format";

const NOW = new Date("2026-03-10T12:00:00Z");
const api = () => createFakeApi({ latencyMs: [0, 0], seed: true, now: () => NOW });

describe("sample usage in the fake api", () => {
  it("is flagged as a sample and has the shape of the real answer", async () => {
    const summary = await api().usage.summary({ period: "7d" });
    expect(summary.sample).toBe(true);
    expect(summary.byDay).toHaveLength(7);
    expect(summary.byDay.at(-1)?.day).toBe("2026-03-10");
    expect(summary.byMachine.length).toBe(3);
    expect(summary.running.map((machine) => machine.name)).toContain("build-runner");
  });

  it("adds up: the totals are the sum of the days, and no machine ran longer than it existed", async () => {
    const summary = await api().usage.summary({ period: "30d" });
    expect(summary.totals.runningSeconds).toBe(
      summary.byDay.reduce((n, day) => n + day.runningSeconds, 0),
    );
    const buildRunner = summary.byMachine.find((machine) => machine.name === "build-runner");
    expect(buildRunner?.runningSeconds).toBeLessThanOrEqual(3 * 86_400 + 12 * 3_600);
  });

  it("does not change between two reads", async () => {
    const fake = api();
    expect(await fake.usage.summary({ period: "30d" })).toEqual(
      await fake.usage.summary({ period: "30d" }),
    );
  });

  it("has no admin", async () => {
    const error = await api()
      .admin.usage({ period: "7d" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("FORBIDDEN");
  });
});

describe("usage formatting", () => {
  it("converts to hours and GiB-hours", () => {
    expect(toHours(5_400)).toBe(1.5);
    expect(toGibHours(2_048 * 3_600)).toBe(2);
  });
  it("keeps precision proportionate to the size", () => {
    expect(formatQuantity(0, "en")).toBe("0");
    expect(formatQuantity(1.234, "en")).toBe("1.23");
    expect(formatQuantity(12.34, "en")).toBe("12.3");
    expect(formatQuantity(1234.5, "en")).toBe("1,235");
    expect(formatQuantity(1.5, "pt-BR")).toBe("1,5");
  });
  it("writes a UTC day without letting the time zone move it", () => {
    expect(formatDay("2026-03-10", "en")).toBe("Mar 10");
  });
});
