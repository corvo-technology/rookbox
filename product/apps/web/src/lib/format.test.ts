import { describe, expect, it } from "vitest";
import { formatIdle, formatMib, formatRelative, sizeParts } from "./format";

describe("format", () => {
  it("shows memory and disk in GiB from 1 GiB up", () => {
    expect(formatMib(512, "en")).toBe("512 MiB");
    expect(formatMib(2048, "en")).toBe("2 GiB");
    expect(formatMib(1536, "en")).toBe("1.5 GiB");
    expect(formatMib(1536, "pt-BR")).toBe("1,5 GiB");
  });

  it("splits a size into its parts", () => {
    expect(sizeParts({ vcpu: 4, memoryMib: 8192, diskMib: 20480 }, "en")).toEqual({
      vcpu: "4",
      memory: "8 GiB",
      disk: "20 GiB",
    });
  });

  it("says how long ago in the largest whole unit", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    expect(formatRelative("2026-03-07T12:00:00Z", "en", now)).toBe("3 days ago");
    expect(formatRelative("2026-03-10T10:00:00Z", "en", now)).toBe("2 hours ago");
    expect(formatRelative("2026-03-10T11:59:50Z", "en", now)).toBe("now");
  });

  it("writes an idle time in minutes or hours", () => {
    expect(formatIdle(300, "en")).toBe("5 min");
    expect(formatIdle(3600, "en")).toBe("1 hr");
    expect(formatIdle(5400, "en")).toBe("90 min");
  });
});
