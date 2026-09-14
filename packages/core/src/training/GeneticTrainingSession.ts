import { createNeuralArenaAlgorithm } from '../ai/nn/neuralArenaAlgorithm';
import {
  createDenseNetwork,
  createDenseNetworkFromGenome,
  flattenNetwork,
} from '../ai/nn/simpleNetwork';
import {
  createStatefulSeededRng,
  runArenaSimulation,
  type ArenaSnakeStats,
} from '../arena';
import type { StatefulRandomPort } from '../engine/ports';
import { getHeuristicAlgorithmById } from '../heuristic';
import { aggregateEvaluationMetrics, calculateRunFitness } from './fitness';
import { resolveTrainingScenarioGames } from './defaults';
import { crossoverGenomes, mutateGenome, selectTournament } from './geneticOperators';
import type {
  CompletedTrainingGeneration,
  GenerationReport,
  GeneticTrainingCheckpoint,
  GeneticTrainingConfig,
  GeneticTrainingResult,
  PreparedTrainingGeneration,
  SerializedTrainingCandidate,
  TrainedModelArtifact,
  TrainingCandidateGenome,
  TrainingCandidateResult,
  TrainingEvaluationResult,
  TrainingEvaluationTask,
} from './types';

export interface GeneticTrainingSessionOptions {
  checkpoint?: GeneticTrainingCheckpoint;
  initialModel?: TrainedModelArtifact;
  runId?: string;
}

interface ScenarioEvaluation {
  fitness: number;
  stats: ArenaSnakeStats[];
  ticksExecuted: number;
}

export class GeneticTrainingSession {
  private readonly config: GeneticTrainingConfig;
  private readonly rng: StatefulRandomPort;
  private readonly runId: string;
  private readonly createdAt: string;
  private readonly parentModelId?: string;
  private readonly parentTrainingFitness?: number;
  private readonly initialModelGenome: Float32Array | null;
  private population: TrainingCandidateGenome[];
  private reports: GenerationReport[];
  private champion: TrainingCandidateResult | null;
  private championGeneration: number;
  private championValidationFitness?: number;
  private nextGeneration: number;

  constructor(config: GeneticTrainingConfig, options: GeneticTrainingSessionOptions = {}) {
    this.config = cloneConfig(config);
    validateConfig(this.config);
    const checkpoint = options.checkpoint;
    if (checkpoint) validateCheckpoint(checkpoint, this.config);
    const timestamp = new Date().toISOString();
    this.runId = checkpoint?.runId ?? options.runId ?? `training-${Date.now()}`;
    this.createdAt = checkpoint?.createdAt ?? timestamp;
    this.parentModelId = checkpoint?.parentModelId ?? options.initialModel?.id;
    this.parentTrainingFitness = checkpoint?.parentTrainingFitness
      ?? options.initialModel?.trainingFitness;
    this.rng = createStatefulSeededRng(
      this.config.trainingSeeds[0] ^ 0x6a09e667,
      checkpoint?.rngState,
    );
    this.reports = checkpoint?.reports.map(cloneReport) ?? [];
    this.champion = checkpoint?.champion ? deserializeEvaluatedCandidate(checkpoint.champion) : null;
    this.championGeneration = checkpoint?.championGeneration ?? 0;
    this.championValidationFitness = checkpoint?.championValidationFitness
      ?? findLegacyChampionValidationFitness(checkpoint);
    this.nextGeneration = checkpoint?.nextGeneration ?? 1;
    this.initialModelGenome = options.initialModel
      ? validateAndReadModelGenome(options.initialModel, this.config)
      : null;
    this.population = checkpoint
      ? checkpoint.population.map(deserializeCandidateGenome)
      : this.createInitialPopulation(options.initialModel);
  }

  isComplete(): boolean {
    return this.nextGeneration > this.config.generations;
  }

  getNextGeneration(): number {
    return this.nextGeneration;
  }

  getConfig(): GeneticTrainingConfig {
    return cloneConfig(this.config);
  }

  createEvaluationTasks(): TrainingEvaluationTask[] {
    if (this.isComplete()) return [];
    const generationConfig = cloneConfig(this.config);
    generationConfig.trainingSeeds = createGenerationTrainingSeeds(
      this.config,
      this.nextGeneration,
    );
    return this.population.map((candidate, index) => ({
      id: `${this.nextGeneration}/${candidate.id}/training`,
      mode: 'training',
      candidate: cloneGenomeCandidate(candidate),
      opponent: cloneGenomeCandidate(
        this.population[(index + this.nextGeneration) % this.population.length],
      ),
      config: cloneConfig(generationConfig),
    }));
  }

  prepareGeneration(results: TrainingEvaluationResult[]): PreparedTrainingGeneration {
    if (this.isComplete()) throw new Error('Training session is already complete');
    const byCandidateId = new Map(results.map((result) => [result.candidateId, result]));
    if (byCandidateId.size !== this.population.length) {
      throw new Error('Generation evaluation is incomplete');
    }
    const evaluated = this.population.map((candidate) => {
      const result = byCandidateId.get(candidate.id);
      if (!result) throw new Error(`Missing evaluation for ${candidate.id}`);
      return {
        ...cloneGenomeCandidate(candidate),
        fitness: result.fitness,
        metrics: cloneMetrics(result.metrics),
      };
    }).sort((left, right) => right.fitness - left.fitness);
    const generationBest = evaluated[0];
    const shouldValidate = this.nextGeneration % this.config.validationEvery === 0
      || this.nextGeneration === this.config.generations;
    const generationBestPopulationIndex = this.population.findIndex((candidate) => (
      candidate.id === generationBest.id || genomesEqual(candidate.genome, generationBest.genome)
    ));
    const validationOpponent = this.config.scenarioGames.cohort > 0
      ? this.population[(Math.max(0, generationBestPopulationIndex) + this.nextGeneration) % this.population.length]
      : undefined;
    return {
      generation: this.nextGeneration,
      evaluated,
      champion: this.champion
        ? cloneEvaluatedCandidate(this.champion)
        : cloneEvaluatedCandidate(generationBest),
      championGeneration: this.champion ? this.championGeneration : this.nextGeneration,
      evaluationResults: results.map(cloneEvaluationResult),
      validationTask: shouldValidate ? {
        id: `${this.nextGeneration}/${generationBest.id}/validation`,
        mode: 'validation',
        candidate: cloneGenomeCandidate(generationBest),
        opponent: validationOpponent ? cloneGenomeCandidate(validationOpponent) : undefined,
        config: cloneConfig(this.config),
      } : undefined,
    };
  }

  completeGeneration(
    prepared: PreparedTrainingGeneration,
    validation: TrainingEvaluationResult | undefined,
    elapsedMs: number,
  ): CompletedTrainingGeneration {
    if (prepared.generation !== this.nextGeneration) {
      throw new Error('Prepared generation does not match training state');
    }
    if (!!prepared.validationTask !== !!validation) {
      throw new Error('Validation result does not match generation requirements');
    }
    const generationBest = prepared.evaluated[0];
    if (validation && (
      this.championValidationFitness === undefined
      || validation.fitness > this.championValidationFitness
    )) {
      this.champion = cloneEvaluatedCandidate(generationBest);
      this.championGeneration = this.nextGeneration;
      this.championValidationFitness = validation.fitness;
    } else if (this.championValidationFitness === undefined) {
      this.champion = cloneEvaluatedCandidate(generationBest);
      this.championGeneration = this.nextGeneration;
    }
    if (!this.champion) throw new Error('Training generation did not produce a champion');
    const simulations = prepared.evaluationResults.reduce(
      (total, result) => total + result.simulations,
      validation?.simulations ?? 0,
    );
    const ticksExecuted = prepared.evaluationResults.reduce(
      (total, result) => total + result.ticksExecuted,
      validation?.ticksExecuted ?? 0,
    );
    const report = buildGenerationReport(
      this.nextGeneration,
      prepared.evaluated,
      validation,
      Math.max(1, elapsedMs),
      simulations,
      ticksExecuted,
    );
    this.reports.push(report);
    if (this.nextGeneration < this.config.generations) {
      this.population = this.createNextPopulation(prepared.evaluated, this.nextGeneration);
    }
    this.nextGeneration++;
    return {
      report: cloneReport(report),
      generationBest: cloneEvaluatedCandidate(prepared.evaluated[0]),
      champion: cloneEvaluatedCandidate(this.champion),
      championGeneration: this.championGeneration,
      championValidationFitness: this.championValidationFitness,
    };
  }

  createCheckpoint(): GeneticTrainingCheckpoint {
    return {
      formatVersion: 1,
      runId: this.runId,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      nextGeneration: this.nextGeneration,
      config: cloneConfig(this.config),
      population: this.population.map(serializeCandidate),
      champion: this.champion ? serializeCandidate(this.champion) : null,
      championGeneration: this.championGeneration,
      championValidationFitness: this.championValidationFitness,
      rngState: this.rng.getState(),
      reports: this.reports.map(cloneReport),
      parentModelId: this.parentModelId,
      parentTrainingFitness: this.parentTrainingFitness,
    };
  }

  createResult(): GeneticTrainingResult {
    if (!this.isComplete() || !this.champion) throw new Error('Training session is not complete');
    return {
      model: {
        formatVersion: 1,
        observationVersion: 1,
        id: `ga-${this.runId}`,
        name: `GA champion ${new Date().toISOString()}`,
        createdAt: new Date().toISOString(),
        topology: [...this.config.topology],
        genome: Array.from(this.champion.genome),
        trainingConfig: cloneConfig(this.config),
        trainingFitness: this.champion.fitness,
        validationFitness: this.championValidationFitness,
        metrics: cloneMetrics(this.champion.metrics),
        parentModelId: this.parentModelId,
        parentTrainingFitness: this.parentTrainingFitness,
      },
      reports: this.reports.map(cloneReport),
      completedGenerations: this.reports.length,
    };
  }

  createChampionModel(): TrainedModelArtifact {
    if (!this.champion) throw new Error('Training session has no evaluated champion');
    return {
      formatVersion: 1,
      observationVersion: 1,
      id: `ga-${this.runId}`,
      name: `GA checkpoint ${this.runId}`,
      createdAt: new Date().toISOString(),
      topology: [...this.config.topology],
      genome: Array.from(this.champion.genome),
      trainingConfig: cloneConfig(this.config),
      trainingFitness: this.champion.fitness,
      validationFitness: this.championValidationFitness,
      metrics: cloneMetrics(this.champion.metrics),
      parentModelId: this.parentModelId,
      parentTrainingFitness: this.parentTrainingFitness,
    };
  }

  private createInitialPopulation(initialModel?: TrainedModelArtifact): TrainingCandidateGenome[] {
    if (initialModel) {
      const genome = validateAndReadModelGenome(initialModel, this.config);
      return Array.from({ length: this.config.populationSize }, (_, index) => ({
        id: `candidate-1-${index + 1}`,
        genome: index === 0
          ? genome.slice()
          : mutateGenome(genome, this.config.mutationRate, this.config.mutationSigma, this.rng),
      }));
    }
    return Array.from({ length: this.config.populationSize }, (_, index) => ({
      id: `candidate-1-${index + 1}`,
      genome: flattenNetwork(createDenseNetwork(
        this.config.topology[0],
        this.config.topology.slice(1, -1),
        this.config.topology[this.config.topology.length - 1],
        this.rng,
      )),
    }));
  }

  private createNextPopulation(
    evaluated: TrainingCandidateResult[],
    generation: number,
  ): TrainingCandidateGenome[] {
    const next: TrainingCandidateGenome[] = [];
    if (generation === 1 && this.initialModelGenome) {
      next.push({ id: `candidate-2-1`, genome: this.initialModelGenome.slice() });
    }
    for (const candidate of evaluated) {
      if (next.length >= this.config.eliteCount) break;
      if (next.some((item) => genomesEqual(item.genome, candidate.genome))) continue;
      next.push({
        id: `candidate-${generation + 1}-${next.length + 1}`,
        genome: candidate.genome.slice(),
      });
    }
    while (next.length < this.config.populationSize) {
      const first = selectTournament(evaluated, this.config.tournamentSize, this.rng);
      const second = selectTournament(evaluated, this.config.tournamentSize, this.rng);
      const crossed = this.rng.next() < this.config.crossoverRate
        ? crossoverGenomes(first.genome, second.genome, this.rng)
        : first.genome.slice();
      next.push({
        id: `candidate-${generation + 1}-${next.length + 1}`,
        genome: mutateGenome(crossed, this.config.mutationRate, this.config.mutationSigma, this.rng),
      });
    }
    return next;
  }
}

export function evaluateTrainingTask(task: TrainingEvaluationTask): TrainingEvaluationResult {
  let fitnessTotal = 0;
  const allStats: ArenaSnakeStats[] = [];
  let ticksExecuted = 0;
  const addScenario = (evaluation: ScenarioEvaluation) => {
    fitnessTotal += evaluation.fitness * evaluation.stats.length;
    allStats.push(...evaluation.stats);
    ticksExecuted += evaluation.ticksExecuted;
  };

  const seeds = task.mode === 'validation'
    ? task.config.validationSeeds
    : task.config.trainingSeeds;
  const games = resolveTrainingScenarioGames(task.config);
  if (games.solo > 0) {
    addScenario(evaluateScenario(task, createScenarioSeeds(seeds, games.solo, 0x243f6a88), 'solo'));
  }
  if (games.heuristic > 0) {
    addScenario(evaluateScenario(task, createScenarioSeeds(seeds, games.heuristic, 0x85a308d3), 'heuristic'));
  }
  if (games.cohort > 0) {
    addScenario(evaluateScenario(task, createScenarioSeeds(seeds, games.cohort, 0x13198a2e), 'cohort'));
  }

  return {
    taskId: task.id,
    candidateId: task.candidate.id,
    fitness: fitnessTotal / allStats.length,
    metrics: aggregateEvaluationMetrics(allStats),
    simulations: allStats.length,
    ticksExecuted,
  };
}

function createScenarioSeeds(baseSeeds: number[], count: number, scenarioSalt: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    let value = (baseSeeds[index % baseSeeds.length] ^ scenarioSalt ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return value === 0 ? 1 : value;
  });
}

function evaluateScenario(
  task: TrainingEvaluationTask,
  seeds: number[],
  scenario: 'solo' | 'heuristic' | 'cohort',
): ScenarioEvaluation {
  let ticksExecuted = 0;
  const stats = seeds.map((seed, seedIndex) => {
    const participants = [{
      name: 'Кандидат',
      algorithm: createNeuralArenaAlgorithm({
        id: task.candidate.id,
        network: createDenseNetworkFromGenome(task.config.topology, task.candidate.genome),
      }),
    }];
    if (scenario === 'heuristic') {
      participants.push({
        name: 'Эвристический бот',
        algorithm: getHeuristicAlgorithmById(seedIndex % 2 === 0 ? 'basic' : 'solid'),
      });
    } else if (scenario === 'cohort' && task.opponent) {
      participants.push({
        name: 'Соперник поколения',
        algorithm: createNeuralArenaAlgorithm({
          id: task.opponent.id,
          network: createDenseNetworkFromGenome(task.config.topology, task.opponent.genome),
        }),
      });
    }
    const run = runArenaSimulation({
      participants,
      seed,
      maxTicks: task.config.maxTicks,
      level: task.config.level,
      difficultyLevel: task.config.difficultyLevel,
      gameMode: task.config.gameMode,
    });
    ticksExecuted += run.ticksExecuted;
    return run.snakes[0];
  });
  return {
    fitness: stats.reduce(
      (sum, item) => sum + calculateRunFitness(item, task.config.maxTicks, task.config.fitnessWeights),
      0,
    ) / stats.length,
    stats,
    ticksExecuted,
  };
}

function buildGenerationReport(
  generation: number,
  evaluated: TrainingCandidateResult[],
  validation: TrainingEvaluationResult | undefined,
  elapsedMs: number,
  simulations: number,
  ticksExecuted: number,
): GenerationReport {
  const fitness = evaluated.map((candidate) => candidate.fitness).sort((a, b) => a - b);
  const middle = Math.floor(fitness.length / 2);
  const median = fitness.length % 2 === 0
    ? (fitness[middle - 1] + fitness[middle]) / 2
    : fitness[middle];
  return {
    generation,
    bestFitness: evaluated[0].fitness,
    meanFitness: fitness.reduce((sum, value) => sum + value, 0) / fitness.length,
    medianFitness: median,
    diversity: calculateDiversity(evaluated),
    validationFitness: validation?.fitness,
    bestMetrics: cloneMetrics(evaluated[0].metrics),
    validationMetrics: validation ? cloneMetrics(validation.metrics) : undefined,
    elapsedMs,
    simulationsPerSecond: simulations * 1000 / elapsedMs,
    ticksPerSecond: ticksExecuted * 1000 / elapsedMs,
  };
}

function calculateDiversity(population: TrainingCandidateResult[]): number {
  if (population.length < 2) return 0;
  const champion = population[0].genome;
  let total = 0;
  let comparisons = 0;
  for (let candidateIndex = 1; candidateIndex < population.length; candidateIndex++) {
    for (let geneIndex = 0; geneIndex < champion.length; geneIndex++) {
      total += Math.abs(champion[geneIndex] - population[candidateIndex].genome[geneIndex]);
      comparisons++;
    }
  }
  return comparisons > 0 ? total / comparisons : 0;
}

function validateConfig(config: GeneticTrainingConfig): void {
  if (!Number.isInteger(config.populationSize) || config.populationSize < 2) {
    throw new Error('populationSize must be at least 2');
  }
  if (!Number.isInteger(config.generations) || config.generations < 1) {
    throw new Error('generations must be at least 1');
  }
  if (config.eliteCount < 1 || config.eliteCount >= config.populationSize) {
    throw new Error('eliteCount must be between 1 and populationSize - 1');
  }
  if (config.topology.length < 2 || config.topology[config.topology.length - 1] !== 3) {
    throw new Error('topology must contain input, hidden layers and 3 outputs');
  }
  if (config.trainingSeeds.length === 0 || config.validationSeeds.length === 0) {
    throw new Error('training and validation seeds must not be empty');
  }
  const scenarioGames = Object.values(config.scenarioGames);
  if (scenarioGames.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('scenario game counts must be non-negative integers');
  }
  if (scenarioGames.every((value) => value === 0)) {
    throw new Error('at least one scenario game count must be positive');
  }
}

function createGenerationTrainingSeeds(
  config: GeneticTrainingConfig,
  generation: number,
): number[] {
  if (config.trainingSeedStrategy !== 'per-generation' || generation <= 1) {
    return [...config.trainingSeeds];
  }
  const generationSalt = Math.imul(generation - 1, 0x9e3779b1);
  return config.trainingSeeds.map((seed) => {
    let value = (seed ^ generationSalt) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return value === 0 ? 1 : value;
  });
}

function findLegacyChampionValidationFitness(
  checkpoint: GeneticTrainingCheckpoint | undefined,
): number | undefined {
  if (!checkpoint?.champion) return undefined;
  return [...checkpoint.reports]
    .reverse()
    .find((report) => (
      report.generation >= checkpoint.championGeneration
      && report.validationFitness !== undefined
    ))?.validationFitness;
}

function validateCheckpoint(
  checkpoint: GeneticTrainingCheckpoint,
  config: GeneticTrainingConfig,
): void {
  if (checkpoint.formatVersion !== 1) throw new Error('Unsupported training checkpoint version');
  if (checkpoint.nextGeneration < 1 || checkpoint.nextGeneration > config.generations + 1) {
    throw new Error('Checkpoint generation is outside the configured range');
  }
  if (checkpoint.population.length !== config.populationSize) {
    throw new Error('Checkpoint population size does not match configuration');
  }
  if (checkpoint.config.topology.join(',') !== config.topology.join(',')) {
    throw new Error('Checkpoint topology does not match configuration');
  }
}

function validateAndReadModelGenome(
  model: TrainedModelArtifact,
  config: GeneticTrainingConfig,
): Float32Array {
  if (model.observationVersion !== 1 || model.topology.join(',') !== config.topology.join(',')) {
    throw new Error('Model observation or topology is not compatible with training configuration');
  }
  const genome = new Float32Array(model.genome);
  createDenseNetworkFromGenome(config.topology, genome);
  return genome;
}

function cloneConfig(config: GeneticTrainingConfig): GeneticTrainingConfig {
  return {
    ...config,
    topology: [...config.topology],
    trainingSeeds: [...config.trainingSeeds],
    validationSeeds: [...config.validationSeeds],
    scenarioGames: resolveTrainingScenarioGames(config),
    scenarioWeights: undefined,
    fitnessWeights: { ...config.fitnessWeights },
  };
}

function cloneMetrics<T extends TrainingCandidateResult['metrics']>(metrics: T): T {
  return {
    ...metrics,
    deathReasons: { ...metrics.deathReasons },
  };
}

function cloneGenomeCandidate(candidate: TrainingCandidateGenome): TrainingCandidateGenome {
  return { id: candidate.id, genome: candidate.genome.slice() };
}

function cloneEvaluatedCandidate(candidate: TrainingCandidateResult): TrainingCandidateResult {
  return {
    ...cloneGenomeCandidate(candidate),
    fitness: candidate.fitness,
    metrics: cloneMetrics(candidate.metrics),
  };
}

function cloneEvaluationResult(result: TrainingEvaluationResult): TrainingEvaluationResult {
  return { ...result, metrics: cloneMetrics(result.metrics) };
}

function cloneReport(report: GenerationReport): GenerationReport {
  return {
    ...report,
    bestMetrics: cloneMetrics(report.bestMetrics),
    validationMetrics: report.validationMetrics
      ? cloneMetrics(report.validationMetrics)
      : undefined,
  };
}

function serializeCandidate(
  candidate: TrainingCandidateGenome | TrainingCandidateResult,
): SerializedTrainingCandidate {
  const evaluated = candidate as Partial<TrainingCandidateResult>;
  return {
    id: candidate.id,
    genome: Array.from(candidate.genome),
    fitness: evaluated.fitness,
    metrics: evaluated.metrics ? cloneMetrics(evaluated.metrics) : undefined,
  };
}

function deserializeCandidateGenome(candidate: SerializedTrainingCandidate): TrainingCandidateGenome {
  return { id: candidate.id, genome: new Float32Array(candidate.genome) };
}

function deserializeEvaluatedCandidate(candidate: SerializedTrainingCandidate): TrainingCandidateResult {
  if (candidate.fitness === undefined || !candidate.metrics) {
    throw new Error('Checkpoint champion is missing fitness metrics');
  }
  return {
    ...deserializeCandidateGenome(candidate),
    fitness: candidate.fitness,
    metrics: cloneMetrics(candidate.metrics),
  };
}

function genomesEqual(first: Float32Array, second: Float32Array): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}
