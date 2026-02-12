import { Snake } from '../types';

/**
 * Award points to a snake for eating a rabbit.
 */
export function awardRabbitPoints(snake: Snake): void {
  snake.score += 1;
}
