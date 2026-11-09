export interface TtlCacheOptions {
  readonly ttlMs: number;
  readonly now?: () => number;
}

interface CacheEntry<Value> {
  readonly value: Value;
  readonly expiresAt: number;
}

/** A small in-memory cache with deterministic clock injection for tests. */
export class TtlCache<Key, Value> {
  readonly #entries = new Map<Key, CacheEntry<Value>>();
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor({ ttlMs, now = Date.now }: TtlCacheOptions) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("ttlMs must be a positive finite number");
    }

    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  get size(): number {
    this.#removeExpired();
    return this.#entries.size;
  }

  get(key: Key): Value | undefined {
    const entry = this.#entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: Key, value: Value): this {
    this.#entries.set(key, {
      value,
      expiresAt: this.#now() + this.#ttlMs,
    });
    return this;
  }

  delete(key: Key): boolean {
    return this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  #removeExpired(): void {
    const now = this.#now();

    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(key);
      }
    }
  }
}
