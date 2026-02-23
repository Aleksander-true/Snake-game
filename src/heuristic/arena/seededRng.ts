import { RandomPort } from '../../engine/ports';

/**
 * Small deterministic LCG RNG for reproducible arena simulations.
 */
export function createSeededRng(seed: number): RandomPort {
  let state = (seed >>> 0) || 1;

  const nextUint32 = (): number => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state;
  };

  return {
    next(): number {
      return nextUint32() / 0x100000000;
    },
    nextInt(max: number): number {
      if (max <= 0) return 0;
      return Math.floor((nextUint32() / 0x100000000) * max);
    },
  };
}

