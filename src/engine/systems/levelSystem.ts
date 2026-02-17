import { GameState, Snake } from '../types';
import { EngineContext } from '../context';
import { getCumulativeTargetScore } from '../formulas';

/**
 * Check if the current level is complete.
 * Single player: cumulative target score reached or snake dead.
 * Multiplayer: 1 snake left OR time expired.
 */
export function checkLevelComplete(state: GameState, ctx: EngineContext): boolean {
  const aliveSnakes = state.snakes.filter(snake => snake.alive);
  const totalSnakes = state.snakes.length;

  if (totalSnakes === 1) {
    // Single-player: check cumulative target score
    const target = getCumulativeTargetScore(state.level, ctx.settings);
    const snake = state.snakes[0];
    if (snake.score >= target) {
      return true;
    }
    if (!snake.alive) {
      return true;
    }
  } else {
    // Multiplayer: 0 or 1 snakes left
    if (aliveSnakes.length <= 1) {
      return true;
    }
    // Time expired
    if (state.levelTimeLeft <= 0) {
      return true;
    }
  }

  return false;
}

/**
 * Determine the winner of a multiplayer level.
 * - If exactly 1 alive → that snake wins.
 * - If 0 alive → no winner (draw).
 * - If multiple alive (time expired) → draw (no winner).
 * Returns the winner snake id, or null for draw/no winner.
 */
export function getLevelWinner(state: GameState): number | null {
  const aliveSnakes = state.snakes.filter(snake => snake.alive);

  if (aliveSnakes.length === 1) {
    return aliveSnakes[0].id;
  }

  // Multiple alive (time expired) or all dead = draw
  return null;
}

/**
 * Determine the overall game winner based on:
 * 1. Most levels won
 * 2. Tiebreak: most rabbits eaten (score)
 * Returns the winning snake, or null if truly tied.
 */
export function getOverallWinner(snakes: Snake[]): Snake | null {
  if (snakes.length === 0) return null;
  if (snakes.length === 1) return snakes[0];

  const sorted = [...snakes].sort((a, b) => {
    if (b.levelsWon !== a.levelsWon) return b.levelsWon - a.levelsWon;
    return b.score - a.score;
  });

  // Check if top two are truly tied
  if (sorted.length >= 2 &&
      sorted[0].levelsWon === sorted[1].levelsWon &&
      sorted[0].score === sorted[1].score) {
    return null; // true tie
  }

  return sorted[0];
}
