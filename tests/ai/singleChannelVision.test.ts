import {
  AppleFoodEntity, HedgehogEntity, SnakeEntity, buildBotInput, createDefaultSettings,
  encodeObservation, generateVision, rotateToVision, type Direction, type GameState,
} from '@snake-game/core';
import { buildDualObservation } from '../../packages/core/src/ai/dualObservation';

const settings = { ...createDefaultSettings(), visionSize: 9 };
function fixture() {
  const snake = new SnakeEntity(1, 'Observer', [{ x: 10, y: 10 }, { x: 10, y: 11 }], 'up', true);
  const enemy = new SnakeEntity(2, 'Opponent', [
    { x: 12, y: 9 }, { x: 12, y: 10 }, { x: 12, y: 11 },
  ], 'up', true);
  const state: GameState = {
    width: 30, height: 30, board: [], snakes: [snake, enemy], walls: [], foods: [], enemies: [],
    targetHedgehogCount: 0, roundResults: [], level: 1, difficultyLevel: 1, tickCount: 0,
    lastAutoFoodSpawnTick: 0, levelTimeLeft: 100, gameOver: false, levelComplete: false,
  };
  return { state, snake, enemy };
}

describe('single-channel neural vision', () => {
  test.each([3, 4, 5, 6] as const)('uses the same normalized food signals in observation v%i', observationVersion => {
    const { state, snake } = fixture();
    state.foods = [
      AppleFoodEntity.newborn({ x: 10, y: 5 }),
      AppleFoodEntity.newborn({ x: 9, y: 10 }),
      AppleFoodEntity.newborn({ x: 6, y: 10 }, settings.foodYoungAge),
    ];
    const input = observationVersion !== 4
      ? buildBotInput(state, snake, settings)
      : buildDualObservation(state, snake, settings).input;
    const encoded = encodeObservation(input, { observationVersion });
    expect(encoded[4]).toBeCloseTo(0.525);
    expect(encoded[4 * 9 + 3]).toBe(1);
    expect(encoded[4 * 9]).toBe(2);
    if (observationVersion === 4) expect(input.events![0][4]).toBe(0);
  });

  test.each<Direction>(['up', 'right', 'down', 'left'])('encodes exact normalized segment values facing %s', direction => {
    const { state, snake, enemy } = fixture();
    snake.direction = direction;
    state.walls = [{ x: 10, y: 6 }, { x: 9, y: 10 }];
    const input = encodeObservation(buildBotInput(state, snake, settings), {});
    const at = (x: number, y: number) => {
      const local = rotateToVision(x - 10, y - 10, direction);
      return input[(local.y + 4) * 9 + local.x + 4];
    };
    expect(input).toHaveLength(86);
    expect(at(10, 6)).toBe(-1);
    expect(at(9, 10)).toBe(-1);
    expect(at(10, 10)).toBe(-1);
    expect(at(10, 11)).toBe(-1);
    enemy.segments.forEach((segment, index) => {
      expect(at(segment.x, segment.y)).toBeCloseTo([-2, -1.6, -1.2][index]);
    });
    expect(at(11, 9)).toBe(0);
  });

  test.each(['left', 'right'] as const)('uses the two front hedgehog cells for facing %s', facing => {
    const { state, snake } = fixture();
    state.enemies = [new HedgehogEntity('hedge', { x: 7, y: 7 }, 2, 2, facing)];
    const input = encodeObservation(buildBotInput(state, snake, settings), {});
    for (const y of [1, 2]) {
      expect(input[y * 9 + 1]).toBeCloseTo(facing === 'left' ? -1.6 : -1.2);
      expect(input[y * 9 + 2]).toBeCloseTo(facing === 'right' ? -1.6 : -1.2);
    }
  });

  test('negative minimum overrides overlapping food and projections; free food is unchanged', () => {
    const { state, snake } = fixture();
    state.walls = [{ x: 14, y: 10 }, { x: 12, y: 9 }];
    state.foods = [
      AppleFoodEntity.newborn({ x: 12, y: 9 }),
      AppleFoodEntity.newborn({ x: 20, y: 10 }),
      AppleFoodEntity.newborn({ x: 9, y: 10 }),
    ];
    const original = generateVision(snake.head, snake.direction, state, settings);
    const input = buildBotInput(state, snake, settings);
    expect(input.vision[3][6]).toBe(-200);
    expect(input.vision[4][8]).toBe(-100);
    expect(input.vision[4][3]).toBe(original[4][3]);
    expect(input.vision[4][3]).toBeGreaterThan(0);
    expect(buildDualObservation(state, snake, settings).input.vision[3][6]).toBe(-100);
  });

  test('boundaries remain -1 at all distances and dead opponents leave no obstacle', () => {
    const { state, snake, enemy } = fixture();
    enemy.die('test');
    expect(buildBotInput(state, snake, settings).vision[3][6]).toBe(0);
    snake.segments = [{ x: 1, y: 1 }];
    const input = encodeObservation(buildBotInput(state, snake, settings), {});
    expect(input[0]).toBe(-1);
    expect(input[4 * 9]).toBe(-1);
  });
});
