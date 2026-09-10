import {
  GeneticTrainer,
  createDefaultGeneticTrainingConfig,
  createSeededRng,
  crossoverGenomes,
  mutateGenome,
} from '@snake-game/core';

describe('genetic training', () => {
  test('applies seeded crossover and mutation deterministically', () => {
    const first = new Float32Array([1, 1, 1, 1]);
    const second = new Float32Array([2, 2, 2, 2]);
    const run = () => mutateGenome(
      crossoverGenomes(first, second, createSeededRng(7)),
      1,
      0.1,
      createSeededRng(9),
    );

    expect(run()).toEqual(run());
    expect(run()).not.toEqual(first);
  });

  test('completes a small deterministic training run', () => {
    const config = createDefaultGeneticTrainingConfig(402);
    Object.assign(config, {
      populationSize: 4,
      generations: 2,
      eliteCount: 1,
      tournamentSize: 2,
      maxTicks: 20,
      trainingSeeds: [3],
      validationSeeds: [5],
      validationEvery: 1,
      topology: [402, 4, 3],
      scenarioWeights: { solo: 1, heuristic: 0, cohort: 0 },
    });
    const run = () => new GeneticTrainer(config).run();
    const first = run();
    const second = run();

    expect(first.completedGenerations).toBe(2);
    expect(first.reports).toHaveLength(2);
    expect(first.model.topology).toEqual([402, 4, 3]);
    expect(first.reports.map((report) => report.bestFitness))
      .toEqual(second.reports.map((report) => report.bestFitness));
    expect(first.model.genome).toEqual(second.model.genome);
  });
});
