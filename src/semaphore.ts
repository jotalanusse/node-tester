export class Semaphore {
  private permits: number;

  constructor(permits: number) {
    if (permits <= 0) {
      throw new Error('Semaphore max permits must be greater than 0.');
    }

    this.permits = permits;
  }

  acquire() {
    this.permits--;
  }

  release(): void {
    this.permits++;
  }

  getAvailablePermits(): number {
    return this.permits;
  }
}
