/**
 * A pixel castle that can be driven. One requestAnimationFrame loop per castle that only runs while
 * the castle is on screen, the tab is visible, and something is still moving. It only ever writes
 * the `fill` of SVG rects, so it never triggers layout.
 */
import { COLS } from "../castle-grid";
import {
  clamp01,
  composeLevel,
  easeOutCubic,
  flicker,
  lerp,
  pulseBoost,
  rampLevel,
  spotlight,
} from "./lifecycle";

type Rgb = readonly [number, number, number];
const DIM: Rgb = [27, 27, 27];
const WALL: Rgb = [63, 214, 168];
const DOOR: Rgb = [245, 245, 245];
const DOOR_DIM: Rgb = [16, 16, 16];

const mix = (a: Rgb, b: Rgb, t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

type Pixel = {
  el: SVGRectElement;
  rank: number;
  x: number;
  y: number;
  level: number;
  last: string;
};

export type CastleOptions = {
  /** Subtle idle flicker once lit. */
  idle?: boolean;
  /** Pixels near the pointer brighten. */
  spotlight?: boolean;
};

export class Castle {
  private walls: Pixel[] = [];
  private door: Pixel[] = [];
  private frac = 0;
  private from = 0;
  private to = 0;
  private t0 = 0;
  private dur = 0;
  private doorLevel = 0;
  private pulseAt = -1;
  private raf = 0;
  private visible = true;
  private lastDraw = 0;
  private pointer: { x: number; y: number } | null = null;
  private box: DOMRect | null = null;
  idle: boolean;

  constructor(
    private svg: SVGSVGElement,
    opts: CastleOptions = {},
  ) {
    this.idle = !!opts.idle;
    for (const el of svg.querySelectorAll<SVGRectElement>(".px")) {
      const pixel: Pixel = {
        el,
        rank: Number(el.dataset.o ?? -1),
        x: Number(el.dataset.x),
        y: Number(el.dataset.y),
        level: 0,
        last: "",
      };
      (el.classList.contains("px--door") ? this.door : this.walls).push(pixel);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        this.visible ? this.wake() : this.sleep();
      }).observe(svg);
    }
    document.addEventListener("visibilitychange", () => {
      document.hidden ? this.sleep() : this.wake();
    });
    if (opts.spotlight) {
      window.addEventListener(
        "pointermove",
        (e) => {
          if (e.pointerType === "touch" || !this.visible) return;
          this.box = this.svg.getBoundingClientRect();
          this.pointer = {
            x: ((e.clientX - this.box.left) / this.box.width) * COLS,
            y:
              ((e.clientY - this.box.top) / this.box.height) *
              (COLS * (this.box.height / this.box.width)),
          };
          const rows = COLS * (this.box.height / this.box.width);
          if (
            this.pointer.x < -5 ||
            this.pointer.x > COLS + 5 ||
            this.pointer.y < -5 ||
            this.pointer.y > rows + 5
          ) {
            this.pointer = null;
          }
          this.wake();
        },
        { passive: true },
      );
      document.addEventListener("pointerleave", () => {
        this.pointer = null;
      });
    }
    this.draw(performance.now(), true);
  }

  /** Light a fraction of the castle, over `ms` (0 = immediately). */
  setFrac(target: number, ms = 0) {
    this.from = this.frac;
    this.to = clamp01(target);
    this.t0 = performance.now();
    this.dur = ms;
    if (ms <= 0) this.frac = this.to;
    this.wake();
  }

  setDoor(on: boolean) {
    this.doorLevel = on ? 1 : 0;
    this.wake();
  }

  /** A ring of light that travels out from the doorway. */
  pulse() {
    this.pulseAt = performance.now();
    this.wake();
  }

  private moving() {
    return (
      this.frac !== this.to ||
      this.pulseAt >= 0 ||
      this.pointer !== null ||
      (this.idle && this.frac > 0.3) ||
      this.walls.some((p) => Math.abs(p.level - this.target(p, performance.now())) > 0.01) ||
      this.door.some((p) => Math.abs(p.level - this.doorLevel) > 0.01)
    );
  }

  private wake() {
    if (this.raf || !this.visible || document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private sleep() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private target(p: Pixel, now: number): number {
    let lift = 0;
    if (this.pointer)
      lift = Math.max(lift, 0.4 * spotlight(p.x - this.pointer.x, p.y - this.pointer.y, 3.6));
    if (this.pulseAt >= 0) {
      const d = Math.hypot(p.x - (COLS - 1) / 2, p.y - 15);
      lift = Math.max(lift, 0.9 * pulseBoost(d, now - this.pulseAt));
    }
    const base = rampLevel(p.rank, this.walls.length, this.frac);
    const dip = this.idle && base >= 1 ? flicker(p.rank, now) : 0;
    return composeLevel(base, dip, lift);
  }

  private frame = (now: number) => {
    this.raf = 0;
    // Cap the idle loop at about 30 fps; interactive moves run at the display rate.
    if (
      this.pointer === null &&
      this.frac === this.to &&
      this.pulseAt < 0 &&
      now - this.lastDraw < 33
    ) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.draw(now, false);
    if (this.moving()) this.wake();
  };

  private draw(now: number, force: boolean) {
    const dt = Math.min(64, now - this.lastDraw || 16);
    this.lastDraw = now;
    if (this.frac !== this.to) {
      const t = this.dur > 0 ? (now - this.t0) / this.dur : 1;
      this.frac = t >= 1 ? this.to : lerp(this.from, this.to, easeOutCubic(t));
    }
    if (this.pulseAt >= 0 && now - this.pulseAt > 1000) this.pulseAt = -1;
    const k = 1 - Math.exp(-dt / 70);
    for (const p of this.walls) {
      const goal = this.target(p, now);
      p.level = force ? goal : p.level + (goal - p.level) * k;
      this.paint(p, mix(DIM, WALL, p.level));
    }
    for (const p of this.door) {
      p.level = force ? this.doorLevel : p.level + (this.doorLevel - p.level) * k;
      this.paint(p, mix(DOOR_DIM, DOOR, p.level));
    }
  }

  private paint(p: Pixel, color: string) {
    if (p.last === color) return;
    p.last = color;
    p.el.style.fill = color;
  }
}
