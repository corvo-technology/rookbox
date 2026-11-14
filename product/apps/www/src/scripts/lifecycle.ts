/**
 * The pure logic behind the page's motion: what the castle shows at each moment of a machine's
 * life, which demo step a scroll position means, and how a stopwatch number is split into digits.
 * Nothing here touches the DOM, so it is unit tested (lifecycle.test.ts).
 */

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

/** Deterministic 0..1 noise from two integers, so the idle flicker needs no random state. */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 10000) / 10000;
}

/* ---- Hero boot ---- */

export type BootKey = "kernel" | "rootfs" | "waiting";
export type BootStage = { at: number; key: BootKey; frac: number };

/** The real boot, in miniature: a kernel, a root filesystem, then the machine is waiting. */
export const BOOT_STAGES: readonly BootStage[] = [
  { at: 0, key: "kernel", frac: 0.17 },
  { at: 700, key: "rootfs", frac: 0.31 },
  { at: 1450, key: "waiting", frac: 0.42 },
];
export const BOOT_MS = 2000;
export const BASE_FRAC = 0.42;

export function bootStage(elapsedMs: number): BootStage {
  let current = BOOT_STAGES[0] as BootStage;
  for (const stage of BOOT_STAGES) if (elapsedMs >= stage.at) current = stage;
  return current;
}

/** How lit the castle is (0..1) while the visitor types: some, more, and all of it for a valid address. */
export function typedFrac(valid: boolean, length: number): number {
  if (valid) return 1;
  return BASE_FRAC + (1 - BASE_FRAC) * clamp01(length / 22) * 0.9;
}

/* ---- Pixel levels ---- */

/**
 * How lit one wall pixel is when a fraction of the castle is built. Pixels below the fraction are
 * fully on; a short soft edge makes the front of the build read as a wave, not a hard cut.
 */
export function rampLevel(rank: number, total: number, frac: number, edge = 5): number {
  return clamp01((frac * total - rank) / edge + 1);
}

/** Idle "activity": a few lit pixels dip now and then, as if the machine were doing something. */
export function flicker(rank: number, nowMs: number, slotMs = 260): number {
  const slot = Math.floor(nowMs / slotMs);
  if (hash01(rank, slot) > 0.045) return 0;
  const within = (nowMs % slotMs) / slotMs;
  return 0.55 * Math.sin(Math.PI * within);
}

/** The cursor spotlight: 0..1, strongest under the pointer, gone beyond `radius` cells. */
export function spotlight(dx: number, dy: number, radius: number): number {
  const d = Math.hypot(dx, dy);
  if (d >= radius) return 0;
  const t = 1 - d / radius;
  return t * t;
}

/** The completion pulse: a ring that travels outwards from the doorway over `duration`. */
export function pulseBoost(
  distance: number,
  elapsedMs: number,
  duration = 900,
  speed = 18,
): number {
  if (elapsedMs < 0 || elapsedMs > duration) return 0;
  const front = (elapsedMs / 1000) * speed;
  const width = 2.2;
  const off = Math.abs(distance - front);
  if (off >= width) return 0;
  return (1 - off / width) * (1 - elapsedMs / duration);
}

/** Pixel level as drawn: the build level, dipped by the flicker, lifted by spotlight and pulse. */
export function composeLevel(base: number, dip: number, lift: number): number {
  return clamp01(base * (1 - dip) + (1 - base) * lift);
}

/* ---- Demo: scroll position and machine state ---- */

/** Which of `count` steps a scroll progress (0..1 through the pinned section) falls in. */
export function stepFromProgress(progress: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(clamp01(progress) * count)));
}

/** The scroll progress at the middle of a step, for jumping there from a click or a key. */
export function progressForStep(step: number, count: number): number {
  return (Math.min(count - 1, Math.max(0, step)) + 0.5) / count;
}

/** Arrow keys, Home and End move between steps and stop at the ends. */
export function stepForKey(key: string, current: number, count: number): number | null {
  const last = count - 1;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(last, current + 1);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

export type MachineView = {
  /** Fraction of the castle that is lit. */
  frac: number;
  /** How long the castle takes to get there. */
  ms: number;
  /** Which small label sits under it. */
  tag: "ready" | "memory";
  /** A brief second castle, drawn when the disk is forked. */
  fork: boolean;
  /** Whether the doorway is lit. */
  door: boolean;
};

/** Create, run, expose a port, suspend, resume: what the small castle shows at each. */
export const DEMO_VIEWS: readonly MachineView[] = [
  { frac: 1, ms: 1100, tag: "ready", fork: false, door: true },
  { frac: 1, ms: 300, tag: "ready", fork: false, door: true },
  { frac: 1, ms: 300, tag: "ready", fork: false, door: true },
  { frac: 0.16, ms: 650, tag: "memory", fork: false, door: false },
  { frac: 1, ms: 1000, tag: "ready", fork: true, door: true },
];

export function machineView(step: number): MachineView {
  const index = Math.min(DEMO_VIEWS.length - 1, Math.max(0, step));
  return DEMO_VIEWS[index] as MachineView;
}

/* ---- Stopwatch numbers ---- */

export type Fact = { before: string; value: number; after: string } | null;

/** Splits "~2 s to start" into the part before the number, the number, and the rest. */
export function parseFact(text: string): Fact {
  const match = /^(~?)(\d{1,2})(\s*s\b.*)$/.exec(text);
  if (!match) return null;
  return { before: match[1] ?? "", value: Number(match[2]), after: match[3] ?? "" };
}

/** The digits a rolling counter stacks, 0 up to the final value. */
export function rollDigits(value: number): number[] {
  return Array.from({ length: Math.max(0, value) + 1 }, (_, i) => i);
}

/** How long the roll takes: one second per second, as a stopwatch would. */
export function rollDuration(value: number): number {
  return Math.max(0, value) * 1000;
}
