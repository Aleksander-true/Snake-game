import { Direction, Position, Snake } from '../types';

export class SnakeEntity implements Snake {
  public alive: boolean;
  public score: number;
  public levelsWon: number;
  public ticksWithoutFood: number;
  public deathReason?: string;

  constructor(
    public id: number,
    public name: string,
    public segments: Position[],
    public direction: Direction,
    public isBot: boolean
  ) {
    this.alive = true;
    this.score = 0;
    this.levelsWon = 0;
    this.ticksWithoutFood = 0;
  }

  get head(): Position {
    return this.segments[0];
  }

  applyDirection(newDirection: Direction): void {
    if (!SnakeEntity.isReverseDirection(this.direction, newDirection)) {
      this.direction = newDirection;
    }
  }

  getNextHeadPosition(): Position {
    switch (this.direction) {
      case 'up':    return { x: this.head.x, y: this.head.y - 1 };
      case 'down':  return { x: this.head.x, y: this.head.y + 1 };
      case 'left':  return { x: this.head.x - 1, y: this.head.y };
      case 'right': return { x: this.head.x + 1, y: this.head.y };
    }
  }

  move(grow: boolean): void {
    const nextHead = this.getNextHeadPosition();
    this.segments.unshift(nextHead);
    if (!grow) {
      this.segments.pop();
    }
  }

  incrementScore(points = 1): void {
    this.score += points;
  }

  incrementHungerTick(): void {
    this.ticksWithoutFood++;
  }

  resetHunger(): void {
    this.ticksWithoutFood = 0;
  }

  trimTail(): void {
    this.segments.pop();
  }

  die(reason: string): void {
    this.alive = false;
    this.deathReason = reason;
  }

  static isReverseDirection(current: Direction, next: Direction): boolean {
    const opposites: Record<Direction, Direction> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left',
    };
    return opposites[current] === next;
  }
}
