import { Position } from '../types';
import { RabbitFoodEntity } from './RabbitFoodEntity';

// Backward-compatible name used by older tests/modules.
export class RabbitEntity extends RabbitFoodEntity {
  static newborn(pos: Position): RabbitEntity {
    return new RabbitEntity(pos, 0, 0, 0);
  }
}
