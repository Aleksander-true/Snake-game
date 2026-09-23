import {
  AppleFoodEntity, HedgehogEntity, SnakeEntity, createDefaultSettings,
  createNeuralArenaAlgorithm, createSeededRng, createSimpleNetwork, encodeObservation,
  runArenaSimulation, type Direction, type GameState, type NeuralNetworkTrace,
} from '@snake-game/core';
import { buildDualObservation } from '../../packages/core/src/ai/dualObservation';

const settings = { ...createDefaultSettings(), visionSize: 9 };
function fixture() {
  const snake = new SnakeEntity(1, 'Observer', [{ x: 10, y: 10 }], 'up', true);
  const state: GameState = {
    width: 30, height: 30, board: [], snakes: [snake], walls: [], foods: [], enemies: [],
    targetHedgehogCount: 0, roundResults: [], level: 1, difficultyLevel: 1, tickCount: 0,
    lastAutoFoodSpawnTick: 0, levelTimeLeft: 100, gameOver: false, levelComplete: false,
  };
  return { state, snake };
}

describe('dual-channel observation', () => {
  test.each([4, 5, 6] as const)('tracing does not change a deterministic arena run for v%i', observationVersion => {
    const run = (traced: boolean) => runArenaSimulation({
      seed: 42, maxTicks: 100, settings: { visionSize: 9 },
      participants: [{ name: 'Observer', algorithm: createNeuralArenaAlgorithm({
        observationVersion, network: createSimpleNetwork(observationVersion === 4 ? 167 : 86, createSeededRng(7), 4),
        onTrace: traced ? () => undefined : undefined,
      }) }],
    });
    expect(run(true)).toEqual(run(false));
  });

  test.each([3, 7, 9, 11])('centers the head at every supported odd window size (%i)', size => {
    const { state, snake } = fixture();
    const observation = buildDualObservation(state, snake, { ...settings, visionSize: size });
    expect(observation.input.vision[Math.floor(size / 2)][Math.floor(size / 2)]).toBe(-100);
    expect(observation.input.events).toHaveLength(size);
  });

  test('food movement creates +1 and outranks an occupancy trace for only one tick', () => {
    const { state, snake } = fixture();
    state.walls = [{ x: 11, y: 10 }];
    let previous = buildDualObservation(state, snake, settings);
    state.walls = [];
    state.foods = [AppleFoodEntity.newborn({ x: 11, y: 10 })];
    state.tickCount++;
    previous = buildDualObservation(state, snake, settings, previous);
    expect(previous.input.events![4][5]).toBe(1);
    snake.segments = [{ x: 10, y: 9 }];
    state.tickCount++;
    previous = buildDualObservation(state, snake, settings, previous);
    expect(previous.input.events![5][5]).toBe(1);
    expect(previous.input.events![4][5]).toBe(0);
    state.tickCount++;
    expect(buildDualObservation(state, snake, settings, previous).input.events!.flat().every(value => value <= 0)).toBe(true);
  });
  test('encodes fixed obstacles, enemy segments, three possible turns and 167 inputs', () => {
    const { state, snake } = fixture();
    state.snakes.push(new SnakeEntity(2, 'Enemy', [
      { x: 12, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 12 },
    ], 'up', true));
    state.walls = [{ x: 10, y: 6 }];
    state.foods = [AppleFoodEntity.newborn({ x: 10, y: 6 })];
    const { input } = buildDualObservation(state, snake, settings);
    expect(input.events![4][6]).toBe(-1);
    expect(input.events![5][6]).toBe(-0.8);
    expect(input.events![6][6]).toBe(-0.6);
    for (const [y, x] of [[3, 6], [4, 5], [4, 7]]) expect(input.events![y][x]).toBe(-0.2);
    const encoded = encodeObservation(input, { observationVersion: 4 });
    expect(encoded).toHaveLength(167);
    expect(encoded[4]).toBe(-1);
    expect(encoded[40]).toBe(-1);
    expect(input.events!.flat().some(value => value > 0)).toBe(false);
  });

  test.each<Direction>(['up', 'right', 'left', 'down'])('rotates old image for %s without compensating translation', direction => {
    const { state, snake } = fixture();
    state.walls = [{ x: 10, y: 7 }];
    const previous = buildDualObservation(state, snake, settings);
    snake.direction = direction;
    const delta = { up: [0, -1], right: [1, 0], left: [-1, 0], down: [0, 1] }[direction];
    snake.segments = [{ x: 10 + delta[0], y: 10 + delta[1] }];
    state.tickCount++;
    const current = buildDualObservation(state, snake, settings, previous);
    const [x, y] = { up: [4, 1], right: [1, 4], left: [7, 4], down: [4, 7] }[direction];
    expect(current.input.events![y][x]).toBe(0.5);
    current.occupied.forEach((row, cy) => row.forEach((occupied, cx) => {
      if (occupied) expect(current.input.events![cy][cx]).not.toBe(0.5);
    }));
  });

  test('events last one observation and negative threats dominate food and old occupancy', () => {
    const { state, snake } = fixture();
    state.walls = [{ x: 11, y: 10 }, { x: 12, y: 10 }];
    const previous = buildDualObservation(state, snake, settings);
    state.walls = [];
    state.foods = [AppleFoodEntity.newborn({ x: 11, y: 10 })];
    state.snakes.push(new SnakeEntity(2, 'Enemy', [{ x: 12, y: 10 }], 'up', true));
    state.tickCount++;
    const current = buildDualObservation(state, snake, settings, previous);
    expect(current.input.events![4][5]).toBe(-0.2);
    expect(current.input.events![4][6]).toBe(-1);
    state.tickCount++;
    expect(buildDualObservation(state, snake, settings, current).input.events![1][1]).toBe(0);
  });

  test('compares direct food value, not brightness or distant projections', () => {
    const { state, snake } = fixture();
    const previous = buildDualObservation(state, snake, settings);
    state.foods = [AppleFoodEntity.newborn({ x: 11, y: 10 }), AppleFoodEntity.newborn({ x: 25, y: 10 })];
    state.tickCount++;
    const current = buildDualObservation(state, snake, settings, previous);
    expect(current.input.events![4][5]).toBe(1);
    expect(current.input.events![4][8]).toBe(0);
    state.tickCount++;
    const changedBrightness = buildDualObservation(state, snake, { ...settings, foodSignalClose: 500 }, current);
    expect(changedBrightness.input.events![4][5]).toBe(0);
    state.tickCount++;
    state.foods[0].age = settings.foodYoungAge;
    expect(buildDualObservation(state, snake, settings, changedBrightness).input.events![4][5]).toBe(1);
  });

  test('hedgehog threats cover all eight legal translations without using its hidden plan', () => {
    const { state, snake } = fixture();
    const enemy = new HedgehogEntity('hedge', { x: 11, y: 10 }, 2, 2, 'right');
    state.enemies = [enemy];
    const first = buildDualObservation(state, snake, settings);
    for (let y = 3; y <= 6; y++) {
      for (let x = 4; x <= 7; x++) {
        expect(first.input.events![y][x]).toBe(y === 4 || y === 5
          ? x === 6 ? -1 : x === 5 ? -0.8 : -0.6 : -0.6);
      }
    }
    enemy.plannedMove = { x: 12, y: 10 };
    expect(buildDualObservation(state, snake, settings).input).toEqual(first.input);
    state.walls = [{ x: 13, y: 10 }, { x: 13, y: 11 }];
    expect(buildDualObservation(state, snake, settings).input.events![4][7]).toBe(0);
  });

  test('caches the same tick and isolates history by session, snake, level, size and rollback', () => {
    const { state, snake } = fixture();
    const traces: NeuralNetworkTrace[] = [];
    const policy = createNeuralArenaAlgorithm({
      observationVersion: 4, network: createSimpleNetwork(167, createSeededRng(4), 2),
      onTrace: trace => traces.push(trace),
    });
    state.walls = [{ x: 11, y: 10 }];
    const direction = policy.chooseDirection(state, snake, settings);
    state.walls = [];
    expect(policy.chooseDirection(state, snake, settings)).toBe(direction);
    expect(traces[1].input).toEqual(traces[0].input);
    state.tickCount++;
    policy.chooseDirection(state, snake, settings);
    expect(traces[2].input[81 + 41]).toBe(0.5);
    policy.chooseDirection({ ...state }, snake, settings);
    expect(traces[3].input[81 + 41]).toBe(0);
    state.tickCount = 0;
    policy.chooseDirection(state, snake, settings);
    expect(traces[4].input[81 + 41]).toBe(0);
    const previous = buildDualObservation(state, snake, settings);
    state.tickCount++;
    state.foods = [AppleFoodEntity.newborn({ x: 11, y: 10 })];
    state.level++;
    expect(buildDualObservation(state, snake, settings, previous).input.events![4][5]).toBe(0);
    expect(buildDualObservation(state, snake, { ...settings, visionSize: 7 }, previous).input.events!.flat().every(x => x <= 0)).toBe(true);
    const other = new SnakeEntity(3, 'Other', [{ x: 10, y: 10 }], 'up', true);
    expect(buildDualObservation(state, other, settings, previous).input.events!.flat().every(x => x <= 0)).toBe(true);
  });
});
