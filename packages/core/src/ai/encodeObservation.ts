import { BotInput } from '../engine/types';

export type ObservationVersion = 3 | 4 | 5 | 6;

export function isObservationVersion(value: unknown): value is ObservationVersion {
  return value === 3 || value === 4 || value === 5 || value === 6;
}

export interface ObservationEncodingOptions {
  observationVersion?: ObservationVersion;
  maxSnakeLengthForEncoding?: number;
  visionValueScale?: number;
}

export function getObservationSize(input: BotInput, observationVersion: ObservationVersion = 3): number {
    if (!input.vision) {
        return 5;
    }
    let size = 5
    for (const row of input.vision) {
        size += row.length * (observationVersion === 4 ? 2 : 1);
    }
    return size;
}

export const DEFAULT_MAX_SNAKE_LENGTH = 20;
export const DEFAULT_VISION_VALUE_SCALE = 100;
export function encodeObservation(
    input: BotInput,
    options: ObservationEncodingOptions
  ): Float32Array {
    const result = new Float32Array(getObservationSize(input, options.observationVersion));
    const maxSnakeLength = options.maxSnakeLengthForEncoding && options.maxSnakeLengthForEncoding > 0 ?
        options.maxSnakeLengthForEncoding : DEFAULT_MAX_SNAKE_LENGTH;
    const visionValueScale = options.observationVersion !== 4 && options.visionValueScale && options.visionValueScale > 0 ?
      options.visionValueScale : DEFAULT_VISION_VALUE_SCALE;
    let index = 0;
    for (let y = 0; y < input.vision.length; y++) {
      const row = input.vision[y];
      for (let x = 0; x < row.length; x++) {
        result[index] = row[x] / visionValueScale;
        index++;
      }
    }
    if (options.observationVersion === 4) {
      if (!input.events || input.events.length !== input.vision.length
        || input.events.some((row, y) => row.length !== input.vision[y].length)) {
        throw new Error('Observation version 4 requires two equally sized channels');
      }
      for (const row of input.events) {
        for (const value of row) result[index++] = value;
      }
    }
    result[index] = input.snakeLength / maxSnakeLength;
    index++;
    result[index] = Math.max(0, input.satiety);
    index++;
    const previousDecision = input.previousDecision ?? 'front';
    result[index] = previousDecision === 'left' ? 1 : 0;
    result[index + 1] = previousDecision === 'front' ? 1 : 0;
    result[index + 2] = previousDecision === 'right' ? 1 : 0;
    return result;
  }
