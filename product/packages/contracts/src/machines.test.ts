import { describe, expect, it } from "vitest";
import {
  allowedActions,
  CreateMachineInput,
  canPerform,
  isTransitional,
  MACHINE_STATUSES,
  MachineName,
  presetOf,
  SIZE_PRESETS,
} from "./machines.js";

describe("machine lifecycle", () => {
  it("only lets a running machine suspend and a suspended one restore", () => {
    expect(canPerform("running", "suspend")).toBe(true);
    expect(canPerform("running", "restore")).toBe(false);
    expect(canPerform("suspended", "restore")).toBe(true);
    expect(canPerform("suspended", "suspend")).toBe(false);
  });

  it("forks from a running or a suspended machine", () => {
    expect(canPerform("running", "fork")).toBe(true);
    expect(canPerform("suspended", "fork")).toBe(true);
    expect(canPerform("failed", "fork")).toBe(false);
  });

  it("accepts nothing while a machine is between states", () => {
    for (const status of MACHINE_STATUSES) {
      if (isTransitional(status)) expect(allowedActions(status)).toEqual([]);
    }
    expect(isTransitional("running")).toBe(false);
    expect(isTransitional("restoring")).toBe(true);
  });
});

describe("sizes", () => {
  it("names a preset only on an exact match", () => {
    expect(presetOf(SIZE_PRESETS.medium)).toBe("medium");
    expect(presetOf({ ...SIZE_PRESETS.medium, diskMib: 30_720 })).toBeNull();
  });

  it("refuses a disk above 128 GiB", () => {
    const parsed = CreateMachineInput.safeParse({
      template: "seed",
      size: { vcpu: 2, memoryMib: 2048, diskMib: 131_073 },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("names", () => {
  it("takes lowercase names with dashes", () => {
    expect(MachineName.safeParse("build-runner-2").success).toBe(true);
    expect(MachineName.safeParse("Build Runner").success).toBe(false);
    expect(MachineName.safeParse("-leading").success).toBe(false);
  });
});
