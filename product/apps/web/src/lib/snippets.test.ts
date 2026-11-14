import { describe, expect, it } from "vitest";
import { envSnippet, githubActionsSnippet, jsSnippet, pythonSnippet } from "./snippets";

describe("E2B snippets", () => {
  it("name the two variables the SDKs read, with the given API address", () => {
    const env = envSnippet("https://api.example.test");
    expect(env).toContain("E2B_API_KEY=");
    expect(env).toContain("E2B_API_URL=https://api.example.test");
    expect(env).not.toContain("E2B_DOMAIN");
  });

  it("create the machine from the deployment's template and always remove it", () => {
    expect(jsSnippet("seed")).toContain('Sandbox.create("seed"');
    expect(jsSnippet("seed")).toContain("sandbox.kill()");
    expect(pythonSnippet("seed")).toContain('Sandbox.create("seed"');
    expect(pythonSnippet("seed")).toContain("sandbox.kill()");
  });

  it("read the key from a CI secret and never inline one", () => {
    const workflow = githubActionsSnippet("seed", "https://api.example.test");
    expect(workflow).toContain("secrets.ROOKBOX_API_KEY");
    expect(workflow).toContain("E2B_API_URL: https://api.example.test");
    expect(workflow).not.toMatch(/rbx_[0-9a-f]{8}/);
  });
});
