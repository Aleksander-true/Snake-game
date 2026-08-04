import { Enemy, FoodFacing, Position } from '../types';

export class HedgehogEntity implements Enemy {
  readonly kind = 'hedgehog' as const;

  constructor(
    public id: string,
    public pos: Position,
    public width: number,
    public height: number,
    public facing: FoodFacing,
    public movementClock = 0,
    public plannedMove?: Position
  ) {}
}
