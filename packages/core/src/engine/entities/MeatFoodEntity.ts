import { Position } from '../types';
import { FoodEntity } from './FoodEntity';

export class MeatFoodEntity extends FoodEntity {
  constructor(pos: Position, age = 0, id = '') {
    super(pos, 'meat', age, age, 0, id);
  }

  static newborn(pos: Position, id = ''): MeatFoodEntity {
    return new MeatFoodEntity(pos, 0, id);
  }
}
