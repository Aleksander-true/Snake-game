import {
  GeneticTrainer,
  GeneticTrainingSession,
  createDefaultGeneticTrainingConfig,
  createSeededRng,
  crossoverGenomes,
  evaluateTrainingTask,
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

  test('reports the best candidate of each generation separately from the record holder', () => {
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
    const generations: Array<{ best: number; record: number; reportBest: number }> = [];

    new GeneticTrainer(config).run({
      onGenerationCompleted: (report, generationBest, champion) => {
        generations.push({
          best: generationBest.fitness,
          record: champion.fitness,
          reportBest: report.bestFitness,
        });
      },
    });

    expect(generations).toHaveLength(2);
    for (const generation of generations) {
      expect(generation.best).toBe(generation.reportBest);
      expect(generation.record).toBeGreaterThanOrEqual(generation.best);
    }
  });

  test('resumes from a generation checkpoint without changing the genetic result', () => {
    const config = createSmallConfig(3);
    const uninterrupted = new GeneticTrainingSession(config, { runId: 'same-run' });
    while (!uninterrupted.isComplete()) completeNextGeneration(uninterrupted);

    const interrupted = new GeneticTrainingSession(config, { runId: 'same-run' });
    completeNextGeneration(interrupted);
    const resumed = new GeneticTrainingSession(config, { checkpoint: interrupted.createCheckpoint() });
    while (!resumed.isComplete()) completeNextGeneration(resumed);

    expect(resumed.createResult().model.genome).toEqual(uninterrupted.createResult().model.genome);
    expect(resumed.createResult().reports.map((report) => report.bestFitness))
      .toEqual(uninterrupted.createResult().reports.map((report) => report.bestFitness));
  });

  test('starts fine-tuning with the saved model and mutated descendants', () => {
    const sourceConfig = createSmallConfig(1);
    const sourceModel = new GeneticTrainer(sourceConfig).run().model;
    const fineTuning = new GeneticTrainingSession(createSmallConfig(2), { initialModel: sourceModel });
    const tasks = fineTuning.createEvaluationTasks();

    expect(Array.from(tasks[0].candidate.genome)).toEqual(sourceModel.genome);
    expect(tasks.some((task, index) => (
      index > 0 && Array.from(task.candidate.genome).some((weight, weightIndex) => (
        weight !== sourceModel.genome[weightIndex]
      ))
    ))).toBe(true);
  });
});

function createSmallConfig(generations: number) {
  const config = createDefaultGeneticTrainingConfig(402);
  Object.assign(config, {
    populationSize: 4,
    generations,
    eliteCount: 1,
    tournamentSize: 2,
    mutationRate: 1,
    maxTicks: 20,
    trainingSeeds: [3],
    validationSeeds: [5],
    validationEvery: 1,
    topology: [402, 4, 3],
    scenarioWeights: { solo: 1, heuristic: 0, cohort: 0 },
  });
  return config;
}

function completeNextGeneration(session: GeneticTrainingSession): void {
  const prepared = session.prepareGeneration(session.createEvaluationTasks().map(evaluateTrainingTask));
  session.completeGeneration(
    prepared,
    prepared.validationTask ? evaluateTrainingTask(prepared.validationTask) : undefined,
    100,
  );
}
