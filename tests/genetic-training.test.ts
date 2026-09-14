import {
  GeneticTrainer,
  GeneticTrainingSession,
  calculateRunFitness,
  createBuiltInGeneticTrainingPresets,
  createDefaultGeneticTrainingConfig,
  createSeededRng,
  crossoverGenomes,
  evaluateTrainingTask,
  mutateGenome,
  resolveTrainingScenarioGames,
} from '@snake-game/core';
import defaults from '../packages/core/src/gameDefaults.json';

describe('genetic training', () => {
  test('loads tuned genetic defaults from the canonical JSON', () => {
    const config = createDefaultGeneticTrainingConfig(402);
    const training = defaults.training;

    expect(config).toMatchObject({
      populationSize: training.populationSize,
      generations: training.generations,
      eliteCount: training.eliteCount,
      tournamentSize: training.tournamentSize,
      crossoverRate: training.crossoverRate,
      mutationRate: training.mutationRate,
      mutationSigma: training.mutationSigma,
      topology: [402, ...training.hiddenLayers, 3],
      trainingSeedStrategy: training.seedStrategy,
      trainingSeeds: training.trainingSeedOffsets.map((offset) => training.seed + offset),
      validationSeeds: training.validationSeedOffsets.map((offset) => training.seed + offset),
      scenarioGames: training.scenarioGames,
      fitnessWeights: training.fitnessWeights,
    });
  });

  test('provides the four staged training presets', () => {
    const presets = createBuiltInGeneticTrainingPresets(402);

    expect(presets.map((preset) => preset.name)).toEqual([
      'Начальное обучение кормлению',
      'Дообучение кормлению',
      'Дообучение с противником-эвристикой',
      'Дообучение с другими нейросетями',
    ]);
    expect(presets[0].config.scenarioGames).toEqual({ solo: 12, heuristic: 0, cohort: 0 });
    expect(presets[2].config.scenarioGames.heuristic).toBeGreaterThan(
      presets[2].config.scenarioGames.solo,
    );
  });

  test('migrates legacy scenario weights to deterministic game counts', () => {
    expect(resolveTrainingScenarioGames({
      trainingSeeds: [1, 2, 3, 4, 5, 6],
      scenarioWeights: { solo: 0.5, heuristic: 0.3, cohort: 0.2 },
    })).toEqual({ solo: 9, heuristic: 5, cohort: 4 });
  });

  test('rewards bounded progress toward food without replacing score rewards', () => {
    const config = createDefaultGeneticTrainingConfig(402);
    const baseStats = {
      snakeId: 1,
      name: 'Candidate',
      algorithmId: 'candidate',
      score: 0,
      foodEaten: 0,
      foodApproachProgress: 0,
      finalLength: 5,
      levelsWon: 0,
      survivedTicks: 100,
      survivedMs: 15_000,
      aliveAtEnd: false,
      deathReason: 'wall',
    };
    const withoutProgress = calculateRunFitness(baseStats, 10_000, config.fitnessWeights);
    const withProgress = calculateRunFitness(
      { ...baseStats, foodApproachProgress: 12 },
      10_000,
      config.fitnessWeights,
    );

    expect(withProgress - withoutProgress).toBeCloseTo(12 * config.fitnessWeights.approach!);

    const aliveAtLimit = calculateRunFitness({
      ...baseStats,
      survivedTicks: 10_000,
      aliveAtEnd: true,
      deathReason: undefined,
    }, 10_000, { ...config.fitnessWeights, cycle: 999 });
    expect(aliveAtLimit).toBe(
      config.fitnessWeights.survival + config.fitnessWeights.aliveAtLimit,
    );
  });

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
      scenarioGames: { solo: 1, heuristic: 0, cohort: 0 },
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

  test('reports each generation best and saves the best validation result', () => {
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
      scenarioGames: { solo: 1, heuristic: 0, cohort: 0 },
    });
    const generations: Array<{ best: number; reportBest: number; validation?: number }> = [];

    const result = new GeneticTrainer(config).run({
      onGenerationCompleted: (report, generationBest) => {
        generations.push({
          best: generationBest.fitness,
          reportBest: report.bestFitness,
          validation: report.validationFitness,
        });
      },
    });

    expect(generations).toHaveLength(2);
    for (const generation of generations) {
      expect(generation.best).toBe(generation.reportBest);
    }
    expect(result.model.validationFitness).toBe(Math.max(
      ...generations.map((generation) => generation.validation ?? Number.NEGATIVE_INFINITY),
    ));
  });

  test('uses common rotating training seeds within each generation', () => {
    const session = new GeneticTrainingSession(createSmallConfig(2));
    const firstTasks = session.createEvaluationTasks();
    const firstSeeds = firstTasks[0].config.trainingSeeds;

    expect(firstTasks.every((task) => task.config.trainingSeeds.join(',') === firstSeeds.join(',')))
      .toBe(true);
    completeNextGeneration(session);
    const secondTasks = session.createEvaluationTasks();
    const secondSeeds = secondTasks[0].config.trainingSeeds;

    expect(secondTasks.every((task) => task.config.trainingSeeds.join(',') === secondSeeds.join(',')))
      .toBe(true);
    expect(secondSeeds).not.toEqual(firstSeeds);

    const legacyConfig = createSmallConfig(2);
    delete legacyConfig.trainingSeedStrategy;
    const legacySession = new GeneticTrainingSession(legacyConfig);
    const legacySeeds = legacySession.createEvaluationTasks()[0].config.trainingSeeds;
    completeNextGeneration(legacySession);
    expect(legacySession.createEvaluationTasks()[0].config.trainingSeeds).toEqual(legacySeeds);
  });

  test('does not replace the validation champion with a worse validation candidate', () => {
    const session = new GeneticTrainingSession(createSmallConfig(2));
    const firstTasks = session.createEvaluationTasks();
    const firstResults = firstTasks.map((task, index) => ({
      ...evaluateTrainingTask(task),
      fitness: firstTasks.length - index,
    }));
    const firstPrepared = session.prepareGeneration(firstResults);
    if (!firstPrepared.validationTask) throw new Error('Expected first validation task');
    const firstCompleted = session.completeGeneration(firstPrepared, {
      ...evaluateTrainingTask(firstPrepared.validationTask),
      fitness: 10,
    }, 100);
    const firstChampionGenome = Array.from(firstCompleted.champion.genome);

    const secondTasks = session.createEvaluationTasks();
    const secondResults = secondTasks.map((task, index) => ({
      ...evaluateTrainingTask(task),
      fitness: index === secondTasks.length - 1 ? 1_000 : index,
    }));
    const secondPrepared = session.prepareGeneration(secondResults);
    if (!secondPrepared.validationTask) throw new Error('Expected second validation task');
    const secondCompleted = session.completeGeneration(secondPrepared, {
      ...evaluateTrainingTask(secondPrepared.validationTask),
      fitness: -10,
    }, 100);

    expect(secondCompleted.championValidationFitness).toBe(10);
    expect(Array.from(secondCompleted.champion.genome)).toEqual(firstChampionGenome);
    expect(session.createResult().model.genome).toEqual(firstChampionGenome);
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
    expect(resumed.createResult().model.validationFitness)
      .toBe(uninterrupted.createResult().model.validationFitness);
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

  test('applies parallel evaluation results in canonical candidate order', () => {
    const config = createSmallConfig(1);
    const ordered = new GeneticTrainingSession(config, { runId: 'ordered' });
    const reordered = new GeneticTrainingSession(config, { runId: 'ordered' });
    const results = ordered.createEvaluationTasks().map(evaluateTrainingTask);
    const orderedPrepared = ordered.prepareGeneration(results);
    const reorderedPrepared = reordered.prepareGeneration([...results].reverse());

    ordered.completeGeneration(
      orderedPrepared,
      orderedPrepared.validationTask ? evaluateTrainingTask(orderedPrepared.validationTask) : undefined,
      100,
    );
    reordered.completeGeneration(
      reorderedPrepared,
      reorderedPrepared.validationTask ? evaluateTrainingTask(reorderedPrepared.validationTask) : undefined,
      100,
    );

    expect(reordered.createResult().model.genome).toEqual(ordered.createResult().model.genome);
  });

  test('validates with the training scenario mix on separate validation seeds', () => {
    const config = createSmallConfig(1);
    config.scenarioGames = { solo: 2, heuristic: 1, cohort: 1 };
    const session = new GeneticTrainingSession(config);
    const prepared = session.prepareGeneration(session.createEvaluationTasks().map(evaluateTrainingTask));
    const validationTask = prepared.validationTask;

    if (!validationTask) throw new Error('Expected a validation task');
    expect(validationTask.opponent).toBeDefined();
    const validation = evaluateTrainingTask(validationTask);
    const matchingTrainingConditions = evaluateTrainingTask({
      ...validationTask,
      id: 'matching-training-conditions',
      mode: 'training',
      config: {
        ...validationTask.config,
        trainingSeeds: [...validationTask.config.validationSeeds],
      },
    });

    expect(validation.fitness).toBe(matchingTrainingConditions.fitness);
    expect(validation.metrics).toEqual(matchingTrainingConditions.metrics);
    expect(validation.simulations).toBe(matchingTrainingConditions.simulations);
    expect(validation.simulations).toBe(4);
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
    scenarioGames: { solo: 1, heuristic: 0, cohort: 0 },
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
