import { GameState } from '../../engine/types';
import { saveScore } from '../../storage/scoreStorage';

/**
 * Persists session scores when the game reaches results screen.
 */
export class ScorePersistenceService {
  private readonly persistedStates = new WeakSet<GameState>();

  saveSessionScores(state: GameState): void {
    if (this.persistedStates.has(state)) return;
    for (const snake of state.snakes) {
      if (snake.isBot) continue;
      saveScore({
        playerName: snake.name,
        score: snake.score,
        levelsWon: snake.levelsWon,
        date: new Date().toLocaleDateString('ru-RU'),
        isBot: false,
      });
    }
    this.persistedStates.add(state);
  }
}
