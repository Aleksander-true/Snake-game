import { BotDecision, GameState, Direction } from '../engine/types';
import { GameSettings } from '../engine/settings';
import { chooseDirectionByDifficulty } from '../heuristic';

/**
 * Get the actual new direction for a bot given current direction and decision.
 */
export function getBotDirection(current: Direction, decision: BotDecision): Direction {
  const turnMap: Record<Direction, Record<BotDecision, Direction>> = {
    up: { front: 'up', left: 'left', right: 'right' },
    down: { front: 'down', left: 'right', right: 'left' },
    left: { front: 'left', left: 'down', right: 'up' },
    right: { front: 'right', left: 'up', right: 'down' },
  };
  return turnMap[current][decision];
}

/**
 * Process all bot snakes: generate vision, decide, and return the directions.
 * Does NOT mutate state — returns a map of snakeId → Direction.
 */
export function processBots(state: GameState, settings: GameSettings): Map<number, Direction> {
  const result = new Map<number, Direction>();

  for (const snake of state.snakes) {
    if (!snake.isBot || !snake.alive) continue;
    result.set(snake.id, chooseDirectionByDifficulty(state, snake, settings));
  }

  return result;
}
