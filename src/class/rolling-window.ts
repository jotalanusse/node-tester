export class RollingWindow {
  readonly maxWindowSizeMs: number;
  private entries: { timestamp: number; amount: number }[] = [];

  constructor(maxWindowSizeMs: number) {
    this.maxWindowSizeMs = maxWindowSizeMs;
  }

  record(amount = 1): void {
    const now = Date.now();

    const lastEntry = this.entries[this.entries.length - 1];

    if (lastEntry && lastEntry.timestamp === now) {
      lastEntry.amount += amount;
    } else {
      this.entries.push({ timestamp: now, amount });
    }

    this.cleanup(now);
  }

  getCount(windowSizeMs: number): number {
    if (windowSizeMs > this.maxWindowSizeMs) {
      throw new Error(
        `Requested window size [${windowSizeMs}] is larger than the maximum window size [${this.maxWindowSizeMs}]`,
      );
    }

    const now = Date.now();
    this.cleanup(now);

    // Sum up the amounts for entries still within the requested window
    return this.entries
      .filter((entry) => now - entry.timestamp <= windowSizeMs)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  drain(): number {
    const total = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
    this.entries = [];

    return total;
  }

  private cleanup(now: number): void {
    const oldestAllowed = now - this.maxWindowSizeMs;

    // Remove entries that are too old
    this.entries = this.entries.filter(
      (entry) => entry.timestamp > oldestAllowed,
    );
  }
}
