import { describe, expect, it } from "vitest";

import { TtlCache } from "../src/cache/ttl-cache.js";

describe("TtlCache", () => {
  it("returns values until their TTL expires", () => {
    let now = 1_000;
    const cache = new TtlCache<string, number>({
      ttlMs: 500,
      now: () => now,
    });

    cache.set("score", 87);
    expect(cache.get("score")).toBe(87);

    now = 1_499;
    expect(cache.get("score")).toBe(87);

    now = 1_500;
    expect(cache.get("score")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("supports replacement, deletion, and clearing", () => {
    const cache = new TtlCache<string, string>({ ttlMs: 1_000 });

    cache.set("repository", "first").set("repository", "second");
    expect(cache.get("repository")).toBe("second");
    expect(cache.delete("repository")).toBe(true);
    expect(cache.delete("repository")).toBe(false);

    cache.set("left", "healthy").set("right", "mixed");
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("rejects invalid TTL values", () => {
    expect(() => new TtlCache({ ttlMs: 0 })).toThrow(RangeError);
    expect(() => new TtlCache({ ttlMs: Number.NaN })).toThrow(
      "ttlMs must be a positive finite number",
    );
  });
});
