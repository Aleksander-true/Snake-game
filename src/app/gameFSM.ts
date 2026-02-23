/**
 * GameFSM — Finite State Machine for UI screens and in-game modals.
 *
 * States:
 *   Menu          — main menu is displayed
 *   Playing       — game loop is running, no modal visible
 *   Paused        — game loop stopped, pause modal shown
 *   LevelComplete — game loop stopped, level-end modal shown
 *   GameOver      — game loop stopped, game-over modal shown
 *   Results       — results screen is displayed
 *
 * Events:
 *   START_GAME    — user clicks Start / dev-mode start
 *   PAUSE         — Space while Playing
 *   RESUME        — Space / button while Paused
 *   LEVEL_END     — engine signals level completion (can continue)
 *   GAME_END      — engine signals game over (no more levels)
 *   CONTINUE      — Space / button on LevelComplete → next level
 *   SHOW_RESULTS  — legacy transition to results screen (kept for compatibility)
 *   GO_TO_MENU    — button on Results → menu
 *   RESTART       — button on Results → restart game
 */

export type GameFSMState =
  | 'Menu'
  | 'Playing'
  | 'Paused'
  | 'LevelComplete'
  | 'GameOver'
  | 'Results';

export type GameFSMEvent =
  | 'START_GAME'
  | 'PAUSE'
  | 'RESUME'
  | 'LEVEL_END'
  | 'GAME_END'
  | 'CONTINUE'
  | 'SHOW_RESULTS'
  | 'GO_TO_MENU'
  | 'RESTART';

export type FSMTransitionCallback = (from: GameFSMState, to: GameFSMState, event: GameFSMEvent) => void;

/** Transition table: [currentState][event] → nextState (or undefined if invalid). */
const transitions: Record<GameFSMState, Partial<Record<GameFSMEvent, GameFSMState>>> = {
  Menu: {
    START_GAME: 'Playing',
  },
  Playing: {
    PAUSE: 'Paused',
    LEVEL_END: 'LevelComplete',
    GAME_END: 'GameOver',
  },
  Paused: {
    RESUME: 'Playing',
  },
  LevelComplete: {
    CONTINUE: 'Playing',
  },
  GameOver: {
    SHOW_RESULTS: 'Results',
    GO_TO_MENU: 'Menu',
    RESTART: 'Playing',
    // In dev mode, CONTINUE may be used instead of SHOW_RESULTS
    CONTINUE: 'Playing',
  },
  Results: {
    GO_TO_MENU: 'Menu',
    RESTART: 'Playing',
  },
};

export class GameFSM {
  private current: GameFSMState = 'Menu';
  private listeners: FSMTransitionCallback[] = [];

  getState(): GameFSMState {
    return this.current;
  }

  /** Subscribe to all transitions. */
  onTransition(cb: FSMTransitionCallback): void {
    this.listeners.push(cb);
  }

  /**
   * Send an event to the FSM.
   * Returns the new state, or null if the transition is invalid.
   */
  send(event: GameFSMEvent): GameFSMState | null {
    const nextState = transitions[this.current]?.[event];
    if (!nextState) {
      // Invalid transition — ignore silently
      return null;
    }

    const from = this.current;
    this.current = nextState;

    for (const cb of this.listeners) {
      cb(from, nextState, event);
    }

    return nextState;
  }

  /** Force state (useful for initialization). */
  reset(state: GameFSMState = 'Menu'): void {
    this.current = state;
  }

  /** True when the game loop should be actively ticking. */
  isPlaying(): boolean {
    return this.current === 'Playing';
  }

  /** True when game loop should be stopped (paused, modal, menu, results). */
  isStopped(): boolean {
    return !this.isPlaying();
  }

  /** Handle Space key — context-dependent action. */
  handleSpace(): GameFSMEvent | null {
    switch (this.current) {
      case 'Playing':       return 'PAUSE';
      case 'Paused':        return 'RESUME';
      case 'LevelComplete': return 'CONTINUE';
      case 'GameOver':      return 'GO_TO_MENU';
      default:              return null;
    }
  }
}
