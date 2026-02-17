export interface GameLoopSchedulerCallbacks {
  onSecondElapsed: () => void;
  onTick: () => void;
}

/**
 * Encapsulates setInterval lifecycle for game tick and 1-second timer.
 */
export class GameLoopScheduler {
  private tickIntervalId: number | null = null;
  private secondIntervalId: number | null = null;

  start(tickIntervalMs: number, callbacks: GameLoopSchedulerCallbacks): void {
    if (this.tickIntervalId !== null) return;

    this.secondIntervalId = window.setInterval(() => {
      callbacks.onSecondElapsed();
    }, 1000);

    this.tickIntervalId = window.setInterval(() => {
      callbacks.onTick();
    }, tickIntervalMs);
  }

  stop(): void {
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    if (this.secondIntervalId !== null) {
      clearInterval(this.secondIntervalId);
      this.secondIntervalId = null;
    }
  }

  isRunning(): boolean {
    return this.tickIntervalId !== null;
  }
}
