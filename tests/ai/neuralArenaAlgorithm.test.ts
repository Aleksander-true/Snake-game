import { runArenaSimulation } from '../../src/arena';
import { createDefaultSettings, GameSettings } from '../../src/engine/settings';
import type { GameState, Snake, Direction, BotInput } from '../../src/engine/types';
import { createSimpleNetwork, type SimpleNetwork } from '../../src/ai/nn/simpleNetwork';
import {
  buildBotInput,
  chooseNeuralDecision,
  chooseNeuralDirection,
  createNeuralArenaAlgorithm,
  NeuralArenaAlgorithmOptions,
} from '../../src/ai/nn/neuralArenaAlgorithm';

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
    snakes: [],
    board: [],
    rabbits: [],
    level: 0,
    difficultyLevel: 0,
    tickCount: 0,
    lastAutoFoodSpawnTick: 0,
    levelTimeLeft: 0,
    gameOver: false,
    levelComplete: false
};

describe('neuralArenaAlgorithm', () => {
  test('buildBotInput returns vision, snake length and hunger', () => {
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
    } as Snake;

    const input = buildBotInput(defaultState, snake, settings);

    expect(input.snakeLength).toBe(3);
    expect(input.ticksWithoutFood).toBe(4);
    expect(Array.isArray(input.vision)).toBe(true);
  });

  test('chooseNeuralDecision returns a relative action', () => {
    const settings = createDefaultSettings();

    const network: SimpleNetwork = {
      hiddenLayer: {
        inputSize: 4,
        outputSize: 2,
        weights: new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
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

    const decision = chooseNeuralDecision(
      {
        vision: [[1, 0]],
        snakeLength: 5,
        ticksWithoutFood: 0,
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
    } as Snake;

    const inputSize = settings.visionSize * settings.visionSize + 2;
    const network = createTestNetwork(inputSize);

    const direction = chooseNeuralDirection(defaultState, snake, settings, {
      network,
    });

    expect(direction).toBe('right');
  });

  test('createNeuralArenaAlgorithm creates arena-compatible algorithm', () => {
    const settings = createDefaultSettings();
    const inputSize = settings.visionSize * settings.visionSize + 2;
    const network = createTestNetwork(inputSize);

    const algorithm = createNeuralArenaAlgorithm({
      network,
    });

    expect(algorithm.id).toBe('neural-simple-v1');
    expect(typeof algorithm.chooseDirection).toBe('function');
  });

  test('neural algorithm completes a headless arena run', () => {
    const settings = createDefaultSettings();
    const inputSize = settings.visionSize * settings.visionSize + 2;
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
      alive: false,
    } as Snake;

    const direction = algorithm.chooseDirection(defaultState, snake, settings);

    expect(direction).toBe('up');
  });


  test('throws an error when encoded observation length does not match network input size', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: 5,
      ticksWithoutFood: 10,
    };

    const NETWORK_INPUT_SIZE = 10;

    const network = createSimpleNetwork(NETWORK_INPUT_SIZE);

    const settings = {
      hungerThreshold: 15,
    } as GameSettings;

    const options = {
      network,
    } as NeuralArenaAlgorithmOptions;

    expect(() => chooseNeuralDecision(input, settings, options)).toThrow(`Neural network input size mismatch: encoded observation has length 3, but hiddenLayer.inputSize is ${NETWORK_INPUT_SIZE}`);
  });
});