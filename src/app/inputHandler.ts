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

/**
 * Input handler that captures keyboard input and stores pending directions
 * for each player.
 */
export class InputHandler {
  private pendingDirections: (Direction | null)[] = [null, null];
  private keydownHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.keydownHandler = (e: KeyboardEvent) => {
      // Player 1
      if (PLAYER1_KEYS[e.code]) {
        e.preventDefault();
        this.pendingDirections[0] = PLAYER1_KEYS[e.code];
      }
      // Player 2
      if (PLAYER2_KEYS[e.code]) {
        e.preventDefault();
        this.pendingDirections[1] = PLAYER2_KEYS[e.code];
      }
    };
  }

  start(): void {
    document.addEventListener('keydown', this.keydownHandler);
  }

  stop(): void {
    document.removeEventListener('keydown', this.keydownHandler);
  }

  /**
   * Get and consume the pending direction for a player (0-indexed).
   */
  consumeDirection(playerIndex: number): Direction | null {
    const dir = this.pendingDirections[playerIndex];
    this.pendingDirections[playerIndex] = null;
    return dir;
  }
}
