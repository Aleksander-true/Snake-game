import { Position } from '../types';
import { FoodEntity } from './FoodEntity';

export class ChickenFoodEntity extends FoodEntity {
  constructor(
    pos: Position,
    age: number,
    clockNum: number,
    reproductionCount: number,
    public originPos: Position,
    public movementClock = 0,
    public pendingMandatoryEgg = false,
    id = ''
  ) {
    super(pos, 'chicken', age, clockNum, reproductionCount, id);
  }

  static newborn(pos: Position, id = ''): ChickenFoodEntity {
    return new ChickenFoodEntity(pos, 0, 0, 0, { ...pos }, 0, false, id);
  }
}
