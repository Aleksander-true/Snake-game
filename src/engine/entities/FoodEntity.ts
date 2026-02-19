import { Food, FoodKind, Position } from '../types';

export abstract class FoodEntity implements Food {
  constructor(
    public pos: Position,
    public kind: FoodKind,
    public age: number,
    public clockNum: number,
    public reproductionCount: number
  ) {}

  tickLifecycle(): void {
    this.age++;
    this.clockNum++;
  }

  resetReproductionClock(): void {
    this.clockNum = 0;
  }

  incrementReproductionCount(): void {
    this.reproductionCount++;
  }
}
