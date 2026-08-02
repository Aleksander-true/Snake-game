import type { ArenaAlgorithm } from '../../arena/types';
import { randomArenaAlgorithm } from '../ai_algorithm';
import { createNeuralArenaAlgorithm } from './neuralArenaAlgorithm';
import { createSimpleNetwork } from './simpleNetwork';

export const trainingLabPolicyIds = ['random-turns', 'neural-simple-v1'] as const;
export type TrainingLabPolicyId = typeof trainingLabPolicyIds[number];

export interface DemoNeuralPolicyOptions {
  id?: string;
  hiddenSize?: number;
  maxSnakeLengthForEncoding?: number;
  visionValueScale?: number;
}

/** Encoded observation = flattened square vision + two scalar features. */
export function calculateObservationInputSize(visionSize: number): number {
  return visionSize * visionSize + 2;
}

/** Build an untrained neural policy whose weights are initialized by the Arena RNG. */
export function createDemoNeuralPolicy(options: DemoNeuralPolicyOptions = {}): ArenaAlgorithm {
  let arenaAlgorithm: ArenaAlgorithm | null = null;
  return {
    id: options.id ?? 'neural-simple-v1',
    chooseDirection(state, snake, runtimeSettings, rng) {
      if (!rng) {
        throw new Error('neural-simple-v1 requires an injected RNG');
      }
      if (!arenaAlgorithm) {
        const inputSize = calculateObservationInputSize(runtimeSettings.visionSize);
        const network = createSimpleNetwork(inputSize, rng, options.hiddenSize);
        arenaAlgorithm = createNeuralArenaAlgorithm({
          id: options.id,
          network,
          maxSnakeLengthForEncoding: options.maxSnakeLengthForEncoding,
          visionValueScale: options.visionValueScale,
        });
      }
      return arenaAlgorithm.chooseDirection(state, snake, runtimeSettings, rng);
    },
  };
}

export function isTrainingLabPolicyId(value: string): value is TrainingLabPolicyId {
  return trainingLabPolicyIds.some((policyId) => policyId === value);
}

/** Select the algorithm used by a headless training-lab run. */
export function getTrainingLabAlgorithm(policyId: TrainingLabPolicyId): ArenaAlgorithm {
  if (policyId === 'random-turns') {
    return randomArenaAlgorithm;
  }
  if (policyId === 'neural-simple-v1') {
    return createDemoNeuralPolicy({ id: policyId });
  }
  const exhaustiveCheck: never = policyId;
  throw new Error(`Unsupported training policy: ${String(exhaustiveCheck)}`);
}
