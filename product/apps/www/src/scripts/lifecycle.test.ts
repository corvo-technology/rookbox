import { describe, expect, it } from "vitest";
import { buildCells, COLS, ROWS } from "../castle-grid";
import { en } from "../i18n/copy/en";
import { es } from "../i18n/copy/es";
import { pt } from "../i18n/copy/pt";
import {
  BASE_FRAC,
  BOOT_MS,
  BOOT_STAGES,
  bootStage,
  composeLevel,
  DEMO_VIEWS,
  flicker,
  machineView,
  parseFact,
  progressForStep,
  pulseBoost,
  rampLevel,
  rollDigits,
  rollDuration,
  spotlight,
  stepForKey,
  stepFromProgress,
  typedFrac,
} from "./lifecycle";

describe("castle grid", () => {
  const cells = buildCells();
  const walls = cells.filter((cell) => !cell.door);

  it("ranks every wall pixel exactly once, foundation first", () => {
    const ranks = walls.map((cell) => cell.rank);
    expect(new Set(ranks).size).toBe(walls.length);
    expect(Math.min(...(ranks as number[]))).toBe(0);
    const first = walls.find((cell) => cell.rank === 0);
    expect(first?.y).toBe(ROWS - 1);
    expect(COLS).toBe(16);
  });

  it("builds from the bottom row upwards", () => {
    const low = walls.filter((cell) => (cell.rank ?? 0) < COLS);
    expect(Math.min(...low.map((cell) => cell.y))).toBeGreaterThanOrEqual(ROWS - 3);
  });
});

describe("hero boot", () => {
  it("is staged kernel, rootfs, waiting inside about two seconds", () => {
    expect(BOOT_STAGES.map((stage) => stage.key)).toEqual(["kernel", "rootfs", "waiting"]);
    expect(BOOT_MS).toBeLessThanOrEqual(2200);
    expect(BOOT_STAGES.at(-1)?.at).toBeLessThan(BOOT_MS);
    const fractions = BOOT_STAGES.map((stage) => stage.frac);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
    expect(fractions.at(-1)).toBe(BASE_FRAC);
  });

  it("picks the stage for an elapsed time", () => {
    expect(bootStage(0).key).toBe("kernel");
    expect(bootStage(800).key).toBe("rootfs");
    expect(bootStage(5000).key).toBe("waiting");
  });

  it("lights more as an address grows and all of it for a valid one", () => {
    expect(typedFrac(false, 0)).toBe(BASE_FRAC);
    expect(typedFrac(false, 10)).toBeGreaterThan(typedFrac(false, 3));
    expect(typedFrac(false, 100)).toBeLessThan(1);
    expect(typedFrac(true, 5)).toBe(1);
  });
});

describe("pixel levels", () => {
  it("ramps from dark to lit with a soft edge", () => {
    expect(rampLevel(50, 100, 0)).toBe(0);
    expect(rampLevel(0, 100, 1)).toBe(1);
    expect(rampLevel(99, 100, 1)).toBe(1);
    const edge = rampLevel(40, 100, 0.4);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1.0001);
    expect(rampLevel(30, 100, 0.4)).toBe(1);
    expect(rampLevel(60, 100, 0.4)).toBe(0);
  });

  it("flickers only a few pixels, deterministically, and never fully off", () => {
    let dipped = 0;
    for (let rank = 0; rank < 120; rank++) {
      const dip = flicker(rank, 1300);
      expect(dip).toBe(flicker(rank, 1300));
      expect(dip).toBeLessThan(0.6);
      if (dip > 0) dipped++;
    }
    expect(dipped).toBeLessThan(20);
  });

  it("brightens near the pointer only", () => {
    expect(spotlight(0, 0, 3.5)).toBe(1);
    expect(spotlight(1, 1, 3.5)).toBeLessThan(1);
    expect(spotlight(4, 0, 3.5)).toBe(0);
  });

  it("sends a pulse outwards and ends it", () => {
    expect(pulseBoost(0, 0)).toBeGreaterThan(0);
    expect(pulseBoost(20, 0)).toBe(0);
    expect(pulseBoost(0, 5000)).toBe(0);
    expect(pulseBoost(9, 500)).toBeGreaterThan(0);
  });

  it("composes without leaving 0..1", () => {
    expect(composeLevel(1, 0.55, 0)).toBeCloseTo(0.45);
    expect(composeLevel(0, 0, 0.4)).toBeCloseTo(0.4);
    expect(composeLevel(1, 0, 1)).toBe(1);
  });
});

describe("demo steps", () => {
  it("maps scroll progress to a step and clamps", () => {
    expect(stepFromProgress(-1, 5)).toBe(0);
    expect(stepFromProgress(0, 5)).toBe(0);
    expect(stepFromProgress(0.39, 5)).toBe(1);
    expect(stepFromProgress(0.99, 5)).toBe(4);
    expect(stepFromProgress(3, 5)).toBe(4);
  });

  it("jumps to the middle of a step and back", () => {
    for (let step = 0; step < 5; step++) {
      expect(stepFromProgress(progressForStep(step, 5), 5)).toBe(step);
    }
  });

  it("moves with the arrow keys and stops at the ends", () => {
    expect(stepForKey("ArrowDown", 0, 5)).toBe(1);
    expect(stepForKey("ArrowUp", 0, 5)).toBe(0);
    expect(stepForKey("ArrowRight", 4, 5)).toBe(4);
    expect(stepForKey("Home", 3, 5)).toBe(0);
    expect(stepForKey("End", 0, 5)).toBe(4);
    expect(stepForKey("Tab", 2, 5)).toBeNull();
  });

  it("has one machine view per step: lit, dimmed while suspended, relit on resume", () => {
    expect(DEMO_VIEWS).toHaveLength(en.demo.steps.length);
    expect(DEMO_VIEWS).toHaveLength(pt.demo.steps.length);
    expect(DEMO_VIEWS).toHaveLength(es.demo.steps.length);
    expect(machineView(0).frac).toBe(1);
    expect(machineView(3).frac).toBeLessThan(0.3);
    expect(machineView(3).tag).toBe("memory");
    expect(machineView(3).door).toBe(false);
    expect(machineView(4).frac).toBe(1);
    expect(machineView(4).ms).toBeLessThanOrEqual(1000);
    expect(DEMO_VIEWS.filter((view) => view.fork)).toHaveLength(1);
    expect(machineView(99)).toBe(machineView(4));
  });
});

describe("stopwatch numbers", () => {
  it("finds the number in every language's facts", () => {
    for (const copy of [en, pt, es]) {
      const parsed = copy.demo.facts.map(parseFact);
      expect(parsed[0]).toBeNull();
      expect(parsed[1]?.value).toBe(2);
      expect(parsed[2]?.value).toBe(1);
      for (const fact of parsed.slice(1)) {
        expect(`${fact?.before}${fact?.value}${fact?.after}`).toMatch(/^~\d s /);
      }
    }
  });

  it("rebuilds the original text and leaves other text alone", () => {
    const fact = parseFact("~2 s para iniciar");
    expect(fact).toEqual({ before: "~", value: 2, after: " s para iniciar" });
    expect(parseFact("Kernel próprio")).toBeNull();
  });

  it("rolls 0..n in n seconds", () => {
    expect(rollDigits(2)).toEqual([0, 1, 2]);
    expect(rollDigits(0)).toEqual([0]);
    expect(rollDuration(2)).toBe(2000);
    expect(rollDuration(1)).toBe(1000);
  });
});
