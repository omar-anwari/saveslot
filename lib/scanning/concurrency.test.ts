import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency.ts";

describe("mapWithConcurrency", () => {
  it("preserves input order in the results", async () => {
    const results = await mapWithConcurrency([5, 1, 3], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value * 10;
    });
    expect(results).toEqual([50, 10, 30]);
  });
  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });
  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
  it("rejects an invalid limit", async () => {
    await expect(
      mapWithConcurrency([1], 0, async () => 1),
    ).rejects.toBeInstanceOf(RangeError);
  });
});