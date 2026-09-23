import {
  buildBotInput,
  chooseNeuralDecision,
  chooseNeuralDirection,
  createDefaultSettings,
  createNeuralArenaAlgorithm,
  createSeededRng,
  createSimpleNetwork,
  runArenaSimulation,
} from '@snake-game/core';
import type {
  BotInput,
  Direction,
  GameSettings,
  GameState,
  NeuralArenaAlgorithmOptions,
  SimpleNetwork,
  Snake,
  NeuralNetworkTrace,
} from '@snake-game/core';

function createTestNetwork(inputSize: number): SimpleNetwork {
  return {
    hiddenLayer: {
      inputSize,
      outputSize: 2,
      weights: new Float32Array([
        1, 0, ...new Array(inputSize - 2).fill(0),
        0, 1, ...new Array(inputSize - 2).fill(0),
      ]),
      bias: new Float32Array([0, 0]),
    },
    outputLayer: {
      inputSize: 2,
      outputSize: 3,
      weights: new Float32Array([
        1, 0,
        0, 1,
        -1, -1,
      ]),
      bias: new Float32Array([0, 0, 0]),
    },
  };
}

const defaultState: GameState = {
    width: 10,
    height: 10,
    walls: [],
    foods: [],
    enemies: [],
    nextEnemyId: 0,
    targetHedgehogCount: 0,
    roundResults: [],
    snakes: [],
    board: [],
    level: 0,
    difficultyLevel: 0,
    tickCount: 0,
    lastAutoFoodSpawnTick: 0,
    levelTimeLeft: 0,
    gameOver: false,
    levelComplete: false
};

describe('neuralArenaAlgorithm', () => {
  test('buildBotInput returns vision, snake length and satiety', () => {
    const settings = createDefaultSettings();

    const snake = {
      head: { x: 5, y: 5 },
      direction: 'up',
      segments: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
      ticksWithoutFood: 4,
      satiety: 2.5,
    } as Snake;

    const input = buildBotInput(defaultState, snake, settings);

    expect(input.snakeLength).toBe(3);
    expect(input.satiety).toBe(2.5);
    expect(Array.isArray(input.vision)).toBe(true);
  });

  test('chooseNeuralDecision returns a relative action', () => {
    const settings = createDefaultSettings();

    const network = createTestNetwork(7);

    const decision = chooseNeuralDecision(
      {
        vision: [[1, 0]],
        snakeLength: 5,
        satiety: 0,
      },
      settings,
      {
        network,
        maxSnakeLengthForEncoding: 20,
        visionValueScale: 1,
      }
    );

    expect(['left', 'front', 'right']).toContain(decision);
    expect(decision).toBe('left');
  });

  test('chooseNeuralDirection converts relative action into world direction', () => {
    const settings = createDefaultSettings();

    const snake = {
      head: { x: 5, y: 5 },
      direction: 'up' as Direction,
      segments: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      ticksWithoutFood: 0,
      satiety: 0,
    } as Snake;

    const inputSize = settings.visionSize * settings.visionSize + 5;
    const network = createTestNetwork(inputSize);

    const direction = chooseNeuralDirection(defaultState, snake, settings, {
      network,
    });

    expect(direction).toBe('right');
  });

  test('createNeuralArenaAlgorithm creates arena-compatible algorithm', () => {
    const settings = createDefaultSettings();
    const inputSize = settings.visionSize * settings.visionSize + 5;
    const network = createTestNetwork(inputSize);

    const algorithm = createNeuralArenaAlgorithm({
      network,
    });

    expect(algorithm.id).toBe('neural-simple-v1');
    expect(typeof algorithm.chooseDirection).toBe('function');
  });

  test('passes the previous relative decision to the next network input', () => {
    const settings = createDefaultSettings();
    const inputSize = settings.visionSize * settings.visionSize + 5;
    const traces: NeuralNetworkTrace[] = [];
    const algorithm = createNeuralArenaAlgorithm({
      network: createTestNetwork(inputSize),
      onTrace: (trace) => traces.push(trace),
    });
    const snake = {
      id: 7,
      alive: true,
      head: { x: 5, y: 5 },
      direction: 'up' as Direction,
      segments: [{ x: 5, y: 5 }, { x: 5, y: 6 }],
      ticksWithoutFood: 0,
      satiety: 0,
    } as Snake;

    algorithm.chooseDirection(defaultState, snake, settings);
    algorithm.chooseDirection(defaultState, snake, settings);

    expect(traces[0].input.slice(-3)).toEqual(new Float32Array([0, 1, 0]));
    const previousAction = traces[0].output.action;
    const expected = previousAction === 'left' ? [1, 0, 0]
      : previousAction === 'front' ? [0, 1, 0]
        : [0, 0, 1];
    expect(traces[1].input.slice(-3)).toEqual(new Float32Array(expected));
  });

  test('neural algorithm completes a headless arena run', () => {
    const settings = createDefaultSettings();
    const inputSize = settings.visionSize * settings.visionSize + 5;
    const network = createTestNetwork(inputSize);

    const algorithm = createNeuralArenaAlgorithm({
      network,
      id: 'neural-test-v1',
    });

    const result = runArenaSimulation({
      participants: [{ name: 'Тест', algorithm }],
      seed: 7,
      level: 1,
      difficultyLevel: 1,
      gameMode: 'classic',
      maxTicks: 500,
    });

    expect(result.ticksExecuted).toBeGreaterThan(0);
    expect(result.ticksExecuted).toBeLessThanOrEqual(500);
    expect(result.snakes).toHaveLength(1);
    expect(result.snakes[0].algorithmId).toBe('neural-test-v1');
  });

  test('createNeuralArenaAlgorithm returns current direction when snake is dead', () => {
    const network = createTestNetwork(10);

    const algorithm = createNeuralArenaAlgorithm({
      network,
    });

    const settings = createDefaultSettings();

    const snake = {
      head: { x: 5, y: 5 },
      direction: 'up' as Direction,
      segments: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      ticksWithoutFood: 5,
      satiety: 0,
      alive: false,
    } as Snake;

    const direction = algorithm.chooseDirection(defaultState, snake, settings);

    expect(direction).toBe('up');
  });


  test('throws an error when encoded observation length does not match network input size', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: 5,
      satiety: 0,
    };

    const NETWORK_INPUT_SIZE = 10;

    const network = createSimpleNetwork(NETWORK_INPUT_SIZE, createSeededRng(1));

    const settings = {
      hungerThreshold: 15,
    } as GameSettings;

    const options = {
      network,
    } as NeuralArenaAlgorithmOptions;

    expect(() => chooseNeuralDecision(input, settings, options)).toThrow(`Neural network input size mismatch: encoded observation has length 6, but network input size is ${NETWORK_INPUT_SIZE}`);
  });
});
