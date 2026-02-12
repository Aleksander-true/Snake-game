import { Snake } from '../types';
import { gameSettings } from '../settings';

/**
 * Process hunger for a snake each tick.
 * Returns true if the snake starved to death.
 */
export function processHunger(snake: Snake): boolean {
  if (!snake.alive) return false;

  snake.ticksWithoutFood++;

  if (snake.ticksWithoutFood >= gameSettings.hungerThreshold) {
    // Lose one segment from the tail
    snake.segments.pop();
    snake.ticksWithoutFood = 0;

    if (snake.segments.length < gameSettings.minSnakeLength) {
      snake.alive = false;
      snake.deathReason = 'Умерла с голоду';
      return true;
    }
  }

  return false;
}

/**
 * Reset hunger counter (called when snake eats a rabbit).
 */
export function resetHunger(snake: Snake): void {
  snake.ticksWithoutFood = 0;
}
