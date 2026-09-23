import { DEFAULT_MAX_SNAKE_LENGTH, DEFAULT_VISION_VALUE_SCALE, encodeObservation, getObservationSize } from '@snake-game/core';
import type { BotInput } from '@snake-game/core';

describe('encodeObservation', () => {
  test('calculates observation size from vision, scalar features and previous decision', () => {
    const input: BotInput = {
      vision: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      snakeLength: 5,
      satiety: 0,
    };

    expect(getObservationSize(input)).toBe(11);
  });

  test('flattens vision row by row', () => {
    const input: BotInput = {
      vision: [
        [100, 0],
        [-100, 50],
      ],
      snakeLength: 5,
      satiety: 0,
    };

    const result = encodeObservation(input, {});

    expect(result.slice(0, 4)).toEqual(new Float32Array([1, 0, -1, 0.5]));
  });

  test('appends normalized snake length and satiety', () => {
    const input: BotInput = {
      vision: [
        [0, 0],
        [0, 0],
      ],
      snakeLength: 10,
      satiety: 3,
    };

    const result = encodeObservation(input, {
      maxSnakeLengthForEncoding: 20,
    });
    expect(result.slice(4, 6)).toEqual(new Float32Array([0.5, 3]));
    expect(result.slice(-3)).toEqual(new Float32Array([0, 1, 0]));
  });

  test('clamps negative satiety to zero', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: 5,
      satiety: -1,
    };

    const result = encodeObservation(input, {});

    expect(result[2]).toBe(0);
  });

  test('empty vision still includes scalar and previous-decision inputs', () => {
    const input: BotInput = {
      vision: [],
      snakeLength: 5,
      satiety: 0,
    };

    expect(getObservationSize(input)).toBe(5);
    expect(encodeObservation(input, {}).length).toBe(5);
  });

  test('vision with no cells in the first row still includes extra inputs', () => {
    const input: BotInput = {
      vision: [[]],
      snakeLength: 5,
      satiety: 0,
    };

    expect(getObservationSize(input)).toBe(5);
    expect(encodeObservation(input, {}).length).toBe(5);
  });

  test('zero maxSnakeLengthForEncoding makes normalized snake length default for non-zero length', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: 5,
      satiety: 2.5,
    };

    const result = encodeObservation(input, {
      maxSnakeLengthForEncoding: 0,
    });

    expect(result[1]).toBeCloseTo(5 / DEFAULT_MAX_SNAKE_LENGTH);
    expect(result[2]).toBeCloseTo(2.5);
  });

  test('zero visionValueScale makes non-zero vision cells default', () => {
    const input: BotInput = {
      vision: [[42]],
      snakeLength: 5,
      satiety: 2.5,
    };

    const result = encodeObservation(input, {
      visionValueScale: 0,
    });

    expect(result[0]).toBeCloseTo(42 / DEFAULT_VISION_VALUE_SCALE);
    expect(result[2]).toBeCloseTo(2.5);
  });

  test('handles negative snake length safely', () => {
    const input: BotInput = {
      vision: [[0]],
      snakeLength: -5,
      satiety: 0,
    };

    const result = encodeObservation(input, {});

    expect(result[1]).toBeCloseTo(-5 / 20);
  });

  test('encodes the previous relative decision as one-hot values', () => {
    const result = encodeObservation({
      vision: [[0]],
      snakeLength: 5,
      satiety: 0,
      previousDecision: 'left',
    }, {});

    expect(result.slice(-3)).toEqual(new Float32Array([1, 0, 0]));
  });

  test('passes food-value satiety without normalization', () => {
    const result = encodeObservation({
      vision: [],
      snakeLength: 5,
      satiety: 3,
    }, {});

    expect(result[1]).toBe(3);
  });

}); 
