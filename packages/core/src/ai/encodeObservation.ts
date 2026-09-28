import { BotInput } from '../engine/types';

export const SUPPORTED_OBSERVATION_VERSIONS = [3] as const;
export type ObservationVersion = typeof SUPPORTED_OBSERVATION_VERSIONS[number];

export function isObservationVersion(value: unknown): value is ObservationVersion {
  return SUPPORTED_OBSERVATION_VERSIONS.some((version) => version === value);
}

export interface ObservationEncodingOptions {
  observationVersion?: ObservationVersion;
  maxSnakeLengthForEncoding?: number;
  visionValueScale?: number;
}

export function getObservationSize(input: BotInput, _observationVersion: ObservationVersion = 3): number {
    if (!input.vision) {
        return 5;
    }
    let size = 5
    for (const row of input.vision) {
        size += row.length;
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
    const visionValueScale = options.visionValueScale && options.visionValueScale > 0 ?
      options.visionValueScale : DEFAULT_VISION_VALUE_SCALE;
    let index = 0;
    for (let y = 0; y < input.vision.length; y++) {
      const row = input.vision[y];
      for (let x = 0; x < row.length; x++) {
        result[index] = row[x] / visionValueScale;
        index++;
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
