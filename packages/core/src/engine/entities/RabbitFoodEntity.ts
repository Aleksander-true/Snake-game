import { Position } from '../types';
import { FoodEntity } from './FoodEntity';

export class RabbitFoodEntity extends FoodEntity {
  constructor(pos: Position, age: number, clockNum: number, reproductionCount: number, id = '') {
    super(pos, 'rabbit', age, clockNum, reproductionCount, id);
  }

  static newborn(pos: Position, id = ''): RabbitFoodEntity {
    return new RabbitFoodEntity(pos, 0, 0, 0, id);
  }
}
