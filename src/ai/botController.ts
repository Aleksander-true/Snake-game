import { BotDecision, BotInput, Snake, GameState, Direction, Position } from '../engine/types';
import { generateVision } from './vision';
import { getNextHeadPosition } from '../engine/systems/movementSystem';
import { collidesWithWall, collidesWithSnake } from '../engine/collision';

/**
 * Main bot decision function.
 */
export function botDecide(input: BotInput): BotDecision {
  // Placeholder heuristic — will be fully implemented in Stage 5
  const half = Math.floor(input.vision.length / 2);
  const center = half;

  // Evaluate three directions: left, front, right
  // In vision space: front = up (row decreasing), left = left column, right = right column
  const scores: Record<BotDecision, number> = {
    front: evaluateDirection(input.vision, center, center - 1),
    left: evaluateDirection(input.vision, center - 1, center),
    right: evaluateDirection(input.vision, center + 1, center),
  };

  // Pick the best
  const decisions: BotDecision[] = ['front', 'left', 'right'];
  let best: BotDecision = 'front';
  let bestScore = -Infinity;

  for (const d of decisions) {
    if (scores[d] > bestScore) {
      bestScore = scores[d];
      best = d;
    }
  }

  return best;
}

function evaluateDirection(vision: number[][], targetX: number, targetY: number): number {
  if (targetY < 0 || targetY >= vision.length || targetX < 0 || targetX >= vision[0].length) {
    return -Infinity;
  }
  return vision[targetY][targetX];
}

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
