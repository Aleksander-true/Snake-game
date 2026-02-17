/**
 * Domain Events — facts produced by the Engine during processTick.
 * The App layer consumes these to trigger side-effects (modals, sounds, storage).
 */
import { Position } from './types';

export type DomainEvent =
  | { type: 'SNAKE_DIED'; snakeId: number; reason: string }
  | { type: 'RABBIT_EATEN'; snakeId: number; pos: Position; newScore: number }
  | { type: 'RABBIT_BORN'; parentPos: Position; childPos: Position }
  | { type: 'LEVEL_COMPLETED'; reason: string; winnerId?: number }
  | { type: 'GAME_OVER' };

/** Result of a single tick. Contains all domain events produced during the tick. */
export interface TickResult {
  events: DomainEvent[];
}
