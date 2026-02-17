/**
 * Math.random() adapter — production implementation of RandomPort.
 */
import { RandomPort } from '../../engine/ports';

export const mathRng: RandomPort = {
  next(): number {
    return Math.random();
  },
  nextInt(max: number): number {
    return Math.floor(Math.random() * max);
  },
};
