import type { Machine } from "@rookbox/contracts";
import { SIZE_PRESETS } from "@rookbox/contracts";
import { describe, expect, it } from "vitest";
import { countByStatus, filterMachines } from "./machine-filter";

function machine(id: string, name: string, status: Machine["status"]): Machine {
  return {
    id,
    name,
    template: "seed",
    status,
    size: { ...SIZE_PRESETS.small },
    idleTimeoutS: 900,
    createdAt: "2026-01-01T00:00:00.000Z",
    forkedFrom: null,
    access: { desktopUrl: null, portUrlTemplate: "https://{port}-x.box.example.com" },
  };
}

const MACHINES = [
  machine("m_aaa111", "build-runner", "running"),
  machine("m_bbb222", "research-agent", "suspended"),
  machine("m_ccc333", "research-agent-fork", "running"),
  machine("m_ddd444", "scratch", "creating"),
];

describe("filterMachines", () => {
  it("returns everything for an empty query and the all filter", () => {
    expect(filterMachines(MACHINES, "", "all")).toHaveLength(4);
    expect(filterMachines(MACHINES, "   ", "all")).toHaveLength(4);
  });

  it("matches the name, ignoring case", () => {
    expect(filterMachines(MACHINES, "RESEARCH", "all").map((m) => m.name)).toEqual([
      "research-agent",
      "research-agent-fork",
    ]);
  });

  it("matches the id", () => {
    expect(filterMachines(MACHINES, "ccc333", "all").map((m) => m.name)).toEqual([
      "research-agent-fork",
    ]);
  });

  it("filters by state and combines it with the query", () => {
    expect(filterMachines(MACHINES, "", "running")).toHaveLength(2);
    expect(filterMachines(MACHINES, "research", "running").map((m) => m.name)).toEqual([
      "research-agent-fork",
    ]);
    expect(filterMachines(MACHINES, "build", "suspended")).toEqual([]);
  });

  it("keeps machines that are between states out of the state filters", () => {
    expect(filterMachines(MACHINES, "scratch", "running")).toEqual([]);
    expect(filterMachines(MACHINES, "scratch", "all")).toHaveLength(1);
  });
});

describe("countByStatus", () => {
  it("counts one status", () => {
    expect(countByStatus(MACHINES, "running")).toBe(2);
    expect(countByStatus(MACHINES, "suspended")).toBe(1);
    expect(countByStatus(MACHINES, "failed")).toBe(0);
  });
});
