import { describe, expect, it } from "vitest";
import { CLI_INSTALL, docsUrl } from "./site";

describe("docsUrl", () => {
  it("opens Portuguese at the root and every other language in English", () => {
    expect(docsUrl("pt-BR")).toBe("https://docs.rookbox.run/");
    expect(docsUrl("en")).toBe("https://docs.rookbox.run/en/");
    expect(docsUrl("es")).toBe("https://docs.rookbox.run/en/");
  });

  it("points at a page", () => {
    expect(docsUrl("pt-BR", "cli")).toBe("https://docs.rookbox.run/cli/");
    expect(docsUrl("en", "guides/ci")).toBe("https://docs.rookbox.run/en/guides/ci/");
  });

  it("installs from rookbox.run", () => {
    expect(CLI_INSTALL).toBe("curl -fsSL https://rookbox.run/install | sh");
  });
});
