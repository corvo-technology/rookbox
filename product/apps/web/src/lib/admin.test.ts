import { describe, expect, it } from "vitest";
import { formatSpan } from "./admin";
import { classifyError } from "./errors";

describe("formatSpan", () => {
  it("reads as the two largest units", () => {
    expect(formatSpan(40)).toBe("40 s");
    expect(formatSpan(300)).toBe("5 min");
    expect(formatSpan(7_500)).toBe("2 h 5 min");
    expect(formatSpan(3 * 86_400 + 4 * 3_600 + 59)).toBe("3 d 4 h");
    expect(formatSpan(-5)).toBe("0 s");
  });
});

describe("account refusals", () => {
  it("are read by their reason, whatever the status", () => {
    expect(classifyError({ code: "BAD_REQUEST", status: 400, data: { reason: "exists" } })).toEqual(
      { kind: "user_admin", reason: "exists", retryable: false },
    );
    expect(
      classifyError({ code: "NOT_FOUND", status: 404, data: { reason: "no_account" } }),
    ).toMatchObject({ kind: "user_admin", reason: "no_account" });
  });

  it("ignore a reason that is not one of ours", () => {
    expect(classifyError({ code: "BAD_REQUEST", data: { reason: "whatever" } }).kind).toBe(
      "unknown",
    );
  });
});
