import { Position, Rabbit } from '../types';

export class RabbitEntity implements Rabbit {
  constructor(
    public pos: Position,
    public age: number,
    public clockNum: number,
    public reproductionCount: number
  ) {}

  static newborn(pos: Position): RabbitEntity {
    return new RabbitEntity(pos, 0, 0, 0);
  }

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
