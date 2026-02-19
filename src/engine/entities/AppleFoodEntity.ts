import { Position } from '../types';
import { FoodEntity } from './FoodEntity';

export class AppleFoodEntity extends FoodEntity {
  constructor(pos: Position, age: number, clockNum: number, reproductionCount: number) {
    super(pos, 'apple', age, clockNum, reproductionCount);
  }

  static newborn(pos: Position, age = 0): AppleFoodEntity {
    return new AppleFoodEntity(pos, age, age, 0);
  }
}
