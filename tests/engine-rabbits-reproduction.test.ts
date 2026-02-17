import { createEmptyBoard } from '../src/engine/board';
import { EngineContext } from '../src/engine/context';
import { RabbitEntity } from '../src/engine/entities/RabbitEntity';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { RandomPort } from '../src/engine/ports';
import { createDefaultSettings, resetSettings } from '../src/engine/settings';
import { GameState } from '../src/engine/types';
import {
  chebyshevDistance,
  countNearbyRabbits,
  getRabbitPhase,
  isValidRabbitPosition,
  processRabbitReproduction,
} from '../src/engine/systems/rabbitsReproductionSystem';

function createState(width = 20, height = 20): GameState {
  return {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    rabbits: [],
    walls: [],
    level: 1,
    difficultyLevel: 1,
    tickCount: 0,
    levelTimeLeft: 180,
    gameOver: false,
    levelComplete: false,
  };
}

describe('Rabbit lifecycle and reproduction', () => {
  beforeEach(() => {
    resetSettings();
  });

  test('distance, phase and nearby counting helpers work as expected', () => {
    const settings = createDefaultSettings();
    const rabbit = new RabbitEntity({ x: 5, y: 5 }, 0, 0, 0);

    expect(chebyshevDistance({ x: 1, y: 1 }, { x: 4, y: 3 })).toBe(3);
    expect(getRabbitPhase(rabbit, settings)).toBe('young');

    rabbit.age = settings.rabbitYoungAge;
    expect(getRabbitPhase(rabbit, settings)).toBe('adult');

    rabbit.age = settings.rabbitAdultAge;
    expect(getRabbitPhase(rabbit, settings)).toBe('old');

    const rabbits = [
      rabbit,
      new RabbitEntity({ x: 6, y: 6 }, 10, 0, 0),
      new RabbitEntity({ x: 12, y: 12 }, 10, 0, 0),
    ];
    expect(countNearbyRabbits({ x: 5, y: 5 }, rabbits, 2, rabbit)).toBe(1);
  });

  test('isValidRabbitPosition rejects walls, alive snakes and nearby rabbits', () => {
    const state = createState(10, 10);
    state.walls = [{ x: 2, y: 2 }];
    state.snakes = [new SnakeEntity(0, 'P1', [{ x: 3, y: 3 }, { x: 3, y: 4 }], 'up', false)];
    state.rabbits = [new RabbitEntity({ x: 5, y: 5 }, 0, 0, 0)];

    expect(isValidRabbitPosition({ x: -1, y: 0 }, state)).toBe(false);
    expect(isValidRabbitPosition({ x: 2, y: 2 }, state)).toBe(false);
    expect(isValidRabbitPosition({ x: 3, y: 4 }, state)).toBe(false);
    expect(isValidRabbitPosition({ x: 6, y: 6 }, state)).toBe(false);
    expect(isValidRabbitPosition({ x: 8, y: 8 }, state)).toBe(true);
  });

  test('processRabbitReproduction increments lifecycle, spawns child and resets parent counters', () => {
    const settings = createDefaultSettings();
    settings.reproductionProbabilityBase = 1;
    settings.reproductionMinCooldown = 1;
    settings.maxReproductions = 5;
    settings.maxReproductionNeighbors = 99;
    settings.rabbitMaxAge = 200;

    const rng: RandomPort = {
      next: () => 0,
      nextInt: () => 0,
    };
    const ctx: EngineContext = { settings, rng };
    const state = createState(30, 30);
    const parent = new RabbitEntity({ x: 15, y: 15 }, settings.rabbitYoungAge, 1, 0);
    state.rabbits = [parent];

    const births = processRabbitReproduction(state, ctx);

    expect(parent.age).toBe(settings.rabbitYoungAge + 1);
    expect(parent.clockNum).toBe(0);
    expect(parent.reproductionCount).toBe(1);
    expect(births.length).toBe(1);
    expect(state.rabbits.length).toBe(2);
    expect(births[0].child.age).toBe(0);
    expect(births[0].child.clockNum).toBe(0);
    expect(births[0].child.reproductionCount).toBe(0);
    const d = chebyshevDistance(parent.pos, births[0].child.pos);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(2);
  });

  test('processRabbitReproduction blocks spawn when neighbor limit reached and removes old rabbits', () => {
    const settings = createDefaultSettings();
    settings.reproductionProbabilityBase = 1;
    settings.reproductionMinCooldown = 1;
    settings.maxReproductionNeighbors = 1;
    settings.neighborReproductionRadius = 4;
    settings.rabbitMaxAge = 150;

    const ctx: EngineContext = {
      settings,
      rng: {
        next: () => 0,
        nextInt: () => 0,
      },
    };
    const state = createState(20, 20);
    const adult = new RabbitEntity({ x: 10, y: 10 }, settings.rabbitYoungAge, 2, 0);
    const neighbor = new RabbitEntity({ x: 11, y: 10 }, settings.rabbitYoungAge, 2, 0);
    const old = new RabbitEntity({ x: 2, y: 2 }, settings.rabbitMaxAge - 1, 0, 0);
    state.rabbits = [adult, neighbor, old];

    const births = processRabbitReproduction(state, ctx);
    expect(births.length).toBe(0);
    expect(state.rabbits.some(r => r.pos.x === 2 && r.pos.y === 2)).toBe(false);
    expect(state.rabbits.length).toBe(2);
  });

  test('processRabbitReproduction does not spawn when maxReproductions is reached', () => {
    const settings = createDefaultSettings();
    settings.reproductionProbabilityBase = 1;
    settings.reproductionMinCooldown = 1;
    settings.maxReproductions = 1;
    settings.maxReproductionNeighbors = 99;

    const ctx: EngineContext = {
      settings,
      rng: {
        next: () => 0,
        nextInt: () => 0,
      },
    };
    const state = createState(20, 20);
    const adultAtLimit = new RabbitEntity(
      { x: 10, y: 10 },
      settings.rabbitYoungAge,
      settings.reproductionMinCooldown,
      settings.maxReproductions
    );
    state.rabbits = [adultAtLimit];

    const births = processRabbitReproduction(state, ctx);
    expect(births).toHaveLength(0);
    expect(state.rabbits).toHaveLength(1);
    expect(state.rabbits[0].reproductionCount).toBe(settings.maxReproductions);
  });
});
