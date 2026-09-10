import type { RandomPort } from '../engine/ports';
import type { TrainingCandidateResult } from './types';

export function selectTournament(
  population: TrainingCandidateResult[],
  tournamentSize: number,
  rng: RandomPort,
): TrainingCandidateResult {
  if (population.length === 0) throw new Error('Tournament requires a non-empty population');
  let winner = population[Math.floor(rng.next() * population.length)];
  for (let index = 1; index < Math.max(1, tournamentSize); index++) {
    const candidate = population[Math.floor(rng.next() * population.length)];
    if (candidate.fitness > winner.fitness) winner = candidate;
  }
  return winner;
}

export function crossoverGenomes(
  first: Float32Array,
  second: Float32Array,
  rng: RandomPort,
): Float32Array {
  if (first.length !== second.length) throw new Error('Parent genomes must have equal lengths');
  const child = new Float32Array(first.length);
  for (let index = 0; index < child.length; index++) {
    child[index] = rng.next() < 0.5 ? first[index] : second[index];
  }
  return child;
}

export function mutateGenome(
  genome: Float32Array,
  mutationRate: number,
  sigma: number,
  rng: RandomPort,
): Float32Array {
  const mutated = genome.slice();
  for (let index = 0; index < mutated.length; index++) {
    if (rng.next() < mutationRate) mutated[index] += gaussian(rng) * sigma;
  }
  return mutated;
}

function gaussian(rng: RandomPort): number {
  const first = Math.max(Number.EPSILON, rng.next());
  const second = rng.next();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}
