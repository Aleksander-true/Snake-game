import { GameState } from '../../engine/types';
import { GameSettings } from '../../engine/settings';
import { GameFSMState } from '../gameFSM';
import { showLevelCompleteModal, showGameOverModal, hideModal } from '../ui/modal';

export interface LevelCompletionActions {
  setState: (state: GameFSMState) => void;
  onContinue: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onRestartSameLevel: (level: number) => void;
}

/**
 * Decides which modal to show when a level ends and wires callbacks.
 */
export class LevelCompletionService {
  handleCompletion(
    state: GameState,
    devModeActive: boolean,
    settings: GameSettings,
    actions: LevelCompletionActions
  ): void {
    if (state.gameOver) {
      if (devModeActive) {
        actions.setState('LevelComplete');
        showLevelCompleteModal(
          state,
          () => {
            hideModal();
            actions.onRestartSameLevel(state.level);
          },
          settings
        );
        return;
      }

      actions.setState('GameOver');
      showGameOverModal(state, actions.onRestart, actions.onMenu);
      return;
    }

    if (state.snakes.length === 1 && state.gameMode === 'survival' && state.snakes[0].alive) {
      actions.setState('LevelComplete');
      actions.onContinue();
      return;
    }

    const aliveSnakes = state.snakes.filter(snake => snake.alive);
    const canAdvance = state.snakes.length === 1 ? state.snakes[0].alive : aliveSnakes.length >= 1;

    if (canAdvance) {
      actions.setState('LevelComplete');
      showLevelCompleteModal(state, actions.onContinue, settings);
      return;
    }

    if (devModeActive) {
      actions.setState('LevelComplete');
      showLevelCompleteModal(
        state,
        () => {
          hideModal();
          actions.onRestartSameLevel(state.level);
        },
        settings
      );
      return;
    }

    actions.setState('GameOver');
    showGameOverModal(state, actions.onRestart, actions.onMenu);
  }
}
