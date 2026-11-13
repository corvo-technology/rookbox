import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";
import { classifyError, retryAfterSeconds } from "./errors";

const coded = (code: string, status: number, data?: unknown) =>
  new ORPCError(code, { status, data });

describe("classifyError", () => {
  it("reads the API's codes", () => {
    expect(classifyError(coded("HOST_AUTH", 502))).toEqual({
      kind: "credentials",
      retryable: false,
    });
    expect(classifyError(coded("TEMPLATE_UNAVAILABLE", 400)).kind).toBe("template");
    expect(classifyError(coded("NAME_TAKEN", 409)).kind).toBe("name_taken");
    expect(classifyError(coded("HOST_UNREACHABLE", 503))).toMatchObject({
      kind: "unreachable",
      retryable: true,
    });
    expect(classifyError(coded("HOST_TIMEOUT", 504)).kind).toBe("timeout");
    expect(classifyError(coded("HOST_CAPACITY", 503)).kind).toBe("capacity");
    expect(classifyError(coded("HOST_QUOTA", 429)).kind).toBe("quota");
    expect(classifyError(coded("HOST_ERROR", 502)).kind).toBe("space");
    expect(classifyError(coded("NOT_FOUND", 404)).kind).toBe("not_found");
    expect(classifyError(coded("CONFLICT", 409)).kind).toBe("conflict");
  });

  it("carries the machine limit", () => {
    expect(classifyError(coded("MACHINE_LIMIT", 409, { limit: 10 }))).toEqual({
      kind: "limit",
      limit: 10,
      retryable: false,
    });
    expect(classifyError(coded("MACHINE_LIMIT", 409)).limit).toBeUndefined();
  });

  it("treats a 401 as an ended session", () => {
    expect(classifyError(coded("UNAUTHORIZED", 401)).kind).toBe("session");
    expect(classifyError({ status: 401 }).kind).toBe("session");
  });

  it("treats a proxy error or a lost connection as being unable to reach Rookbox", () => {
    expect(classifyError({ status: 502 }).kind).toBe("network");
    expect(classifyError({ status: 504 }).kind).toBe("network");
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
  });

  it("never depends on the message, so a raw JSON body is not shown to anyone", () => {
    const error = new ORPCError("CONFLICT", {
      status: 409,
      message: '{"json":{"code":"CONFLICT","message":"Invalid or missing API key"}}',
    });
    expect(classifyError(error).kind).toBe("conflict");
  });

  it("falls back to unknown", () => {
    expect(classifyError(new Error("boom")).kind).toBe("unknown");
    expect(classifyError(undefined).kind).toBe("unknown");
  });
});

describe("retryAfterSeconds", () => {
  it("reads whole seconds and ignores junk", () => {
    expect(retryAfterSeconds("30")).toBe(30);
    expect(retryAfterSeconds("1.2")).toBe(2);
    expect(retryAfterSeconds("soon")).toBeNull();
    expect(retryAfterSeconds(null)).toBeNull();
  });
});
