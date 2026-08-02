import { Snake } from '../types';

/**
 * Award points to a snake for eating food.
 */
export function awardFoodPoints(snake: Snake, points: number): void {
  snake.incrementScore(points);
}
