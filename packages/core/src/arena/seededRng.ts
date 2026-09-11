import { RandomPort, StatefulRandomPort } from '../engine/ports';

/**
 * Deterministic LCG RNG for reproducible arena simulations.
 */
export function createSeededRng(seed: number): RandomPort {
  return createStatefulSeededRng(seed);
}

export function createStatefulSeededRng(seed: number, savedState?: number): StatefulRandomPort {
  let state = savedState === undefined ? (seed >>> 0) || 1 : savedState >>> 0;

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
    getState(): number {
      return state;
    },
  };
}
