import { describe, expect, it } from "vitest";
import { niceScale } from "./usage-format";

describe("niceScale", () => {
  it("rounds the top up to an even step", () => {
    expect(niceScale(17)).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
    expect(niceScale(0.7)).toEqual({ max: 0.8, ticks: [0, 0.2, 0.4, 0.6, 0.8] });
  });

  it("never returns a top below the peak", () => {
    for (const peak of [0.03, 1, 3.2, 9.9, 24, 101, 4800]) {
      expect(niceScale(peak).max).toBeGreaterThanOrEqual(peak);
    }
  });

  it("has a unit scale for no data", () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
  });
});
