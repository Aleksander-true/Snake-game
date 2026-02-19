import { Position } from '../types';
import { FoodEntity } from './FoodEntity';

export class RabbitFoodEntity extends FoodEntity {
  constructor(pos: Position, age: number, clockNum: number, reproductionCount: number) {
    super(pos, 'rabbit', age, clockNum, reproductionCount);
  }

  static newborn(pos: Position): RabbitFoodEntity {
    return new RabbitFoodEntity(pos, 0, 0, 0);
  }
}
