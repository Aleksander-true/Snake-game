/**
 * Math.random() adapter — production implementation of RandomPort.
 */
import type { RandomPort } from '@snake-game/core';

export const mathRng: RandomPort = {
  next(): number {
    return Math.random();
  },
  nextInt(max: number): number {
    return Math.floor(Math.random() * max);
  },
};
