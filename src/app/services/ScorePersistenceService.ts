import { GameState } from '../../engine/types';
import { saveScore } from '../../storage/scoreStorage';

/**
 * Persists session scores when the game reaches results screen.
 */
export class ScorePersistenceService {
  saveSessionScores(state: GameState): void {
    for (const snake of state.snakes) {
      saveScore({
        playerName: snake.name,
        score: snake.score,
        levelsWon: snake.levelsWon,
        date: new Date().toLocaleDateString('ru-RU'),
        isBot: snake.isBot,
      });
    }
  }
}
