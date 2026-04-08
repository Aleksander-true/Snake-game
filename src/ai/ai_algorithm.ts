import type { BotDecision } from '../engine/types';
import type { ArenaAlgorithm } from '../arena/types';
import { getBotDirection } from './botController';

/**
 * Uniform random choice among left / front / right relative to current heading.
 * Exported for tests and for future neural policy wrappers.
 */
export function randomBotDecision(): BotDecision {
  const options: BotDecision[] = ['left', 'front', 'right'];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Baseline ArenaAlgorithm for the training lab: random turns (id: random-turns).
 * Swap this export when you plug in a trained model implementing ArenaAlgorithm.
 */
export const randomArenaAlgorithm: ArenaAlgorithm = {
  id: 'random-turns',
  chooseDirection(_state, snake, _settings) {
    if (!snake.alive) {
      return snake.direction;
    }
    return getBotDirection(snake.direction, randomBotDecision());
  },
};
