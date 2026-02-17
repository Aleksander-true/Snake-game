import { GameState } from '../../engine/types';
import { renderResults } from '../ui/results';

export interface ResultsScreenCallbacks {
  onRestart: () => void;
  onMenu: () => void;
}

/**
 * Handles results screen rendering.
 */
export class ResultsScreenService {
  constructor(private readonly appRoot: HTMLElement) {}

  show(state: GameState, callbacks: ResultsScreenCallbacks): void {
    renderResults(this.appRoot, state, callbacks.onRestart, callbacks.onMenu);
  }
}
