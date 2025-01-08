export class RollingWindow {
  readonly maxWindowSizeMs: number;
  private entries: number[] = [];

  constructor(maxWindowSizeMs: number) {
    this.maxWindowSizeMs = maxWindowSizeMs;
  }

  record(): void {
    const now = Date.now();
    this.entries.push(now);
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

    return this.entries.filter((timestamp) => now - timestamp <= windowSizeMs)
      .length;
  }

  private cleanup(now: number): void {
    const oldestAllowed = now - this.maxWindowSizeMs;
    this.entries = this.entries.filter(
      (timestamp) => timestamp > oldestAllowed,
    );
  }
}
