import { DEFAULT_MAX_SNAKE_LENGTH, DEFAULT_VISION_VALUE_SCALE, encodeObservation, getObservationSize } from '../../src/ai/encodeObservation';
import type { BotInput } from '../../src/engine/types';
import defaults from '../../src/gameDefaults.json';

describe('encodeObservation', () => {
  test('calculates observation size from vision plus two extra features', () => {
    const input: BotInput = {
      vision: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      snakeLength: 5,
      ticksWithoutFood: 2,
    };

    expect(getObservationSize(input)).toBe(8);
  });

  test('flattens vision row by row', () => {
    const input: BotInput = {
      vision: [
        [100, 0],
        [-100, 50],
      ],
      snakeLength: 5,
      ticksWithoutFood: 3,
    };

    const result = encodeObservation(input, {
      hungerThreshold: 15,
    });

    expect(result.slice(0,-2)).toEqual(new Float32Array([1,0,-1,0.5]))
  });

  test('appends normalized snake length and hunger', () => {
    const input: BotInput = {
      vision: [
        [0, 0],
        [0, 0],
      ],
      snakeLength: 10,
      ticksWithoutFood: 6,
    };

    const result = encodeObservation(input, {
      hungerThreshold: 12,
      maxSnakeLengthForEncoding: 20,
    });
    expect(result.slice(-2)).toEqual(new Float32Array([0.5,0.5]))
  });

  test('handles zero or negative hunger threshold safely', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: 5,
      ticksWithoutFood: 10,
    };

    const result = encodeObservation(input, {
      hungerThreshold: 0,
    });

    expect(result.every(i => !isNaN(i) && isFinite(i))).toBe(true);
  });

  test('empty vision array yields zero-length observation', () => {
    const input: BotInput = {
      vision: [],
      snakeLength: 5,
      ticksWithoutFood: 10,
    };

    expect(getObservationSize(input)).toBe(2);
    expect(encodeObservation(input, { hungerThreshold: 15 }).length).toBe(2);
  });

  test('vision with no cells in the first row yields zero-length observation', () => {
    const input: BotInput = {
      vision: [[]],
      snakeLength: 5,
      ticksWithoutFood: 10,
    };

    expect(getObservationSize(input)).toBe(2);
    expect(encodeObservation(input, { hungerThreshold: 15 }).length).toBe(2);
  });

  test('negative hungerThreshold uses default hunger threshold from game defaults', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: 5,
      ticksWithoutFood: 30,
    };

    const result = encodeObservation(input, {
      hungerThreshold: -1,
    });

    expect(result.slice(-1)[0]).toBe(30 / defaults.snake.hungerThreshold);
  });

  test('zero maxSnakeLengthForEncoding makes normalized snake length default for non-zero length', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: 5,
      ticksWithoutFood: 10,
    };

    const result = encodeObservation(input, {
      hungerThreshold: 15,
      maxSnakeLengthForEncoding: 0,
    });

    expect(result.slice(-2)[0]).toBeCloseTo(5 / DEFAULT_MAX_SNAKE_LENGTH);
    expect(result.slice(-2)[1]).toBeCloseTo(10 / 15);
  });

  test('zero visionValueScale makes non-zero vision cells default', () => {
    const input: BotInput = {
      vision: [[42]],
      snakeLength: 5,
      ticksWithoutFood: 10,
    };

    const result = encodeObservation(input, {
      hungerThreshold: 15,
      visionValueScale: 0,
    });

    expect(result[0]).toBeCloseTo(42 / DEFAULT_VISION_VALUE_SCALE);
    expect(result.slice(-2)[1]).toBeCloseTo(10 / 15);
  });

  test('handles negative snake length safely', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: -5,
      ticksWithoutFood: 10,
    };

    const result = encodeObservation(input, {
      hungerThreshold: 15,
    });

    expect(result.slice(-2)[0]).toBeCloseTo(-5 / 20);
  });
}); 
