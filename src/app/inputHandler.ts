import { Direction } from '../engine/types';

type KeyMap = Record<string, Direction>;

const PLAYER1_KEYS: KeyMap = {
  'KeyW': 'up',
  'KeyA': 'left',
  'KeyS': 'down',
  'KeyD': 'right',
};

const PLAYER2_KEYS: KeyMap = {
  'ArrowUp': 'up',
  'ArrowLeft': 'left',
  'ArrowDown': 'down',
  'ArrowRight': 'right',
};

/** Consumed directions for all players in a single tick. */
export interface InputSnapshot {
  directions: (Direction | null)[];
}

/**
 * InputBuffer — captures keyboard input and stores pending directions.
 *
 * DOM event handlers only write commands into the buffer.
 * On each tick boundary, `consumeAll()` is called to drain
 * the last valid direction for each player.
 *
 * Space is handled separately via `onPause` callback.
 */
export class InputHandler {
  private pendingDirections: (Direction | null)[] = [null, null];
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  private pauseCallback: (() => void) | null = null;

  /** Register a callback to be called when Space is pressed. */
  onPause(callback: () => void): void {
    this.pauseCallback = callback;
  }

  start(): void {
    if (this.keydownHandler) return; // already started

    this.keydownHandler = (event: KeyboardEvent) => {
      // Pause (Space) — separate from direction buffer
      if (event.code === 'Space') {
        event.preventDefault();
        if (this.pauseCallback) this.pauseCallback();
        return;
      }

      // Player 1
      if (PLAYER1_KEYS[event.code]) {
        event.preventDefault();
        this.pendingDirections[0] = PLAYER1_KEYS[event.code];
      }
      // Player 2
      if (PLAYER2_KEYS[event.code]) {
        event.preventDefault();
        this.pendingDirections[1] = PLAYER2_KEYS[event.code];
      }
    };

    document.addEventListener('keydown', this.keydownHandler);
  }

  stop(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    this.pauseCallback = null;
    this.pendingDirections = [null, null];
  }

  /**
   * Consume all pending directions at tick boundary.
   * Returns the last valid direction for each player slot, then clears the buffer.
   */
  consumeAll(): InputSnapshot {
    const snapshot: InputSnapshot = {
      directions: [...this.pendingDirections],
    };
    this.pendingDirections = [null, null];
    return snapshot;
  }

  /**
   * Get and consume the pending direction for a single player (0-indexed).
   * Legacy helper — prefer consumeAll() in new code.
   */
  consumeDirection(playerIndex: number): Direction | null {
    const pendingDirection = this.pendingDirections[playerIndex];
    this.pendingDirections[playerIndex] = null;
    return pendingDirection;
  }
}
