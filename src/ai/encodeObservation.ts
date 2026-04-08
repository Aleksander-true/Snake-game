import {BotInput} from "engine/types";
import defaults from '../gameDefaults.json';


export interface ObservationEncodingOptions {
  hungerThreshold: number;
  maxSnakeLengthForEncoding?: number;
  visionValueScale?: number;
}

export function getObservationSize(input: BotInput): number {
    if (!input.vision) {
        return 2;
    }
    let size = 2
    for (const row of input.vision) {
        size += row.length;
    }
    return size;
}

export const DEFAULT_MAX_SNAKE_LENGTH = 20;
export const DEFAULT_VISION_VALUE_SCALE = 100;
export const DEFAULT_HUNGER_THRESHOLD = defaults.snake.hungerThreshold;

export function encodeObservation(
    input: BotInput,
    options: ObservationEncodingOptions
  ): Float32Array {
    const result = new Float32Array(getObservationSize(input));
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
    const hungerThreshold = options.hungerThreshold <= 0 ?
        DEFAULT_HUNGER_THRESHOLD : options.hungerThreshold;
    result[index] = input.ticksWithoutFood / hungerThreshold;
    return result;
  }