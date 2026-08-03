import { Position } from '../types';
import { FoodEntity } from './FoodEntity';

export class AppleFoodEntity extends FoodEntity {
  constructor(pos: Position, age: number, clockNum: number, reproductionCount: number, id = '') {
    super(pos, 'apple', age, clockNum, reproductionCount, id);
  }

  static newborn(pos: Position, age = 0, id = ''): AppleFoodEntity {
    return new AppleFoodEntity(pos, age, age, 0, id);
  }
}
