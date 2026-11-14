import { describe, expect, it } from "vitest";
import { templateKind } from "./templates";

describe("templateKind", () => {
  it("maps the known internal names", () => {
    expect(templateKind("seed")).toBe("linux");
    expect(templateKind("desktop")).toBe("desktop");
    expect(templateKind("desktop-v2")).toBe("desktop");
    expect(templateKind("corvo-computer-v2")).toBe("desktop");
  });

  it("returns null for anything else, including object prototype names", () => {
    expect(templateKind("my-custom-image")).toBeNull();
    expect(templateKind("constructor")).toBeNull();
    expect(templateKind("")).toBeNull();
  });
});
