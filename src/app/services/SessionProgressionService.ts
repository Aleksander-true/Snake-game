import { GameEngine } from '../../engine/GameEngine';
import { GameConfig, GameState } from '../../engine/types';

/**
 * Builds next level state and carries snake progress between levels.
 */
export class SessionProgressionService {
  advanceToNextLevel(currentState: GameState, config: GameConfig, gameEngine: GameEngine): GameState {
    const nextLevel = currentState.level + 1;
    const previousSnakes = currentState.snakes;

    const nextState = gameEngine.createGameState(config, nextLevel);
    gameEngine.initLevel(nextState, config);
    this.copySnakeProgress(previousSnakes, nextState);

    return nextState;
  }

  private copySnakeProgress(previousSnakes: GameState['snakes'], nextState: GameState): void {
    for (let snakeIndex = 0; snakeIndex < nextState.snakes.length; snakeIndex++) {
      const previousSnake = previousSnakes[snakeIndex];
      const nextSnake = nextState.snakes[snakeIndex];
      if (!previousSnake || !nextSnake) continue;
      nextSnake.score = previousSnake.score;
      nextSnake.levelsWon = previousSnake.levelsWon;
    }
  }
}
