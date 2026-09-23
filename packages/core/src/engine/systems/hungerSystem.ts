import { Snake } from '../types';
import { EngineContext } from '../context';

/**
 * Process hunger for a snake each tick.
 * Returns true if the snake starved to death.
 */
export function processHunger(
  snake: Snake,
  ctx: EngineContext,
  decreaseSatiety = true,
): boolean {
  if (!snake.alive) return false;

  const settings = ctx.settings;
  snake.incrementHungerTick();
  if (decreaseSatiety && settings.hungerThreshold > 0) {
    snake.decreaseSatiety(1 / settings.hungerThreshold);
  }

  if (snake.ticksWithoutFood >= settings.hungerThreshold) {
    // Lose one segment from the tail
    snake.trimTail();
    snake.resetHunger();

    if (snake.segments.length < settings.minSnakeLength) {
      snake.die('Умерла с голоду');
      return true;
    }
  }

  return false;
}

/**
 * Reset hunger counter (called when snake eats food).
 */
export function resetHunger(snake: Snake): void {
  snake.resetHunger();
}
