import { createNeuralArenaAlgorithm } from '../ai/nn/neuralArenaAlgorithm';
import {
  createDenseNetwork,
  createDenseNetworkFromGenome,
  flattenNetwork,
} from '../ai/nn/simpleNetwork';
import { runArenaSimulation, createSeededRng, type ArenaSnakeStats } from '../arena';
import type { RandomPort } from '../engine/ports';
import { getHeuristicAlgorithmById } from '../heuristic';
import { aggregateEvaluationMetrics, calculateRunFitness } from './fitness';
import { crossoverGenomes, mutateGenome, selectTournament } from './geneticOperators';
import type {
  GenerationReport,
  GeneticTrainingCallbacks,
  GeneticTrainingConfig,
  GeneticTrainingResult,
  TrainedModelArtifact,
  TrainingCandidateResult,
  TrainingEvaluationMetrics,
} from './types';

interface CandidateGenome {
  id: string;
  genome: Float32Array;
}

interface Evaluation {
  fitness: number;
  metrics: TrainingEvaluationMetrics;
  simulations: number;
}

export class TrainingCancelledError extends Error {}

export class GeneticTrainer {
  private readonly config: GeneticTrainingConfig;
  private readonly rng: RandomPort;

  constructor(config: GeneticTrainingConfig) {
    validateConfig(config);
    this.config = cloneConfig(config);
    this.rng = createSeededRng(config.trainingSeeds[0] ^ 0x6a09e667);
  }

  run(callbacks: GeneticTrainingCallbacks = {}): GeneticTrainingResult {
    let population = this.createInitialPopulation();
    const reports: GenerationReport[] = [];
    let champion: TrainingCandidateResult | null = null;

    for (let generation = 1; generation <= this.config.generations; generation++) {
      if (callbacks.shouldCancel?.()) throw new TrainingCancelledError('Training was cancelled');
      const startedAt = Date.now();
      const evaluated = population.map((candidate, index) => {
        const opponent = population[(index + generation) % population.length];
        const evaluation = this.evaluateCandidate(candidate, opponent);
        return { ...candidate, fitness: evaluation.fitness, metrics: evaluation.metrics };
      }).sort((left, right) => right.fitness - left.fitness);
      champion = !champion || evaluated[0].fitness > champion.fitness ? cloneCandidate(evaluated[0]) : champion;
      const shouldValidate = generation % this.config.validationEvery === 0
        || generation === this.config.generations;
      const validation = shouldValidate ? this.evaluateValidation(champion) : undefined;
      const elapsedMs = Math.max(1, Date.now() - startedAt);
      const simulations = evaluated.reduce((total, candidate) => total + candidate.metrics.runs, 0)
        + (validation?.metrics.runs ?? 0);
      const report = buildGenerationReport(
        generation,
        evaluated,
        validation,
        elapsedMs,
        simulations,
      );
      reports.push(report);
      callbacks.onGenerationCompleted?.(report, cloneCandidate(champion));
      if (generation < this.config.generations) population = this.createNextPopulation(evaluated, generation);
    }

    if (!champion) throw new Error('Training did not produce a champion');
    const finalReport = reports[reports.length - 1];
    return {
      model: this.createModel(champion, finalReport.validationFitness),
      reports,
      completedGenerations: reports.length,
    };
  }

  private createInitialPopulation(): CandidateGenome[] {
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

  private evaluateCandidate(candidate: CandidateGenome, opponent: CandidateGenome): Evaluation {
    const scenarioFitness: Array<{ value: number; weight: number }> = [];
    const allStats: ArenaSnakeStats[] = [];
    if (this.config.scenarioWeights.solo > 0) {
      const solo = this.evaluateScenario(candidate, undefined, this.config.trainingSeeds, 'solo');
      scenarioFitness.push({ value: solo.fitness, weight: this.config.scenarioWeights.solo });
      allStats.push(...solo.stats);
    }
    if (this.config.scenarioWeights.heuristic > 0) {
      const heuristic = this.evaluateScenario(candidate, undefined, this.config.trainingSeeds, 'heuristic');
      scenarioFitness.push({ value: heuristic.fitness, weight: this.config.scenarioWeights.heuristic });
      allStats.push(...heuristic.stats);
    }
    if (this.config.scenarioWeights.cohort > 0) {
      const cohort = this.evaluateScenario(candidate, opponent, this.config.trainingSeeds, 'cohort');
      scenarioFitness.push({ value: cohort.fitness, weight: this.config.scenarioWeights.cohort });
      allStats.push(...cohort.stats);
    }

    const totalWeight = scenarioFitness.reduce((sum, item) => sum + item.weight, 0);
    return {
      fitness: scenarioFitness.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight,
      metrics: aggregateEvaluationMetrics(allStats),
      simulations: allStats.length,
    };
  }

  private evaluateValidation(candidate: CandidateGenome): Evaluation {
    const scenario = this.evaluateScenario(candidate, undefined, this.config.validationSeeds, 'heuristic');
    return {
      fitness: scenario.fitness,
      metrics: aggregateEvaluationMetrics(scenario.stats),
      simulations: scenario.stats.length,
    };
  }

  private evaluateScenario(
    candidate: CandidateGenome,
    opponent: CandidateGenome | undefined,
    seeds: number[],
    scenario: 'solo' | 'heuristic' | 'cohort',
  ): { fitness: number; stats: ArenaSnakeStats[] } {
    const stats = seeds.map((seed, seedIndex) => {
      const participants = [{ name: 'Кандидат', algorithm: this.createAlgorithm(candidate) }];
      if (scenario === 'heuristic') {
        participants.push({
          name: 'Эвристический бот',
          algorithm: getHeuristicAlgorithmById(seedIndex % 2 === 0 ? 'basic' : 'solid'),
        });
      } else if (scenario === 'cohort' && opponent) {
        participants.push({ name: 'Соперник поколения', algorithm: this.createAlgorithm(opponent) });
      }
      return runArenaSimulation({
        participants,
        seed,
        maxTicks: this.config.maxTicks,
        level: this.config.level,
        difficultyLevel: this.config.difficultyLevel,
        gameMode: this.config.gameMode,
      }).snakes[0];
    });
    return {
      fitness: stats.reduce(
        (sum, item) => sum + calculateRunFitness(item, this.config.maxTicks, this.config.fitnessWeights),
        0,
      ) / stats.length,
      stats,
    };
  }

  private createAlgorithm(candidate: CandidateGenome) {
    return createNeuralArenaAlgorithm({
      id: candidate.id,
      network: createDenseNetworkFromGenome(this.config.topology, candidate.genome),
    });
  }

  private createNextPopulation(
    evaluated: TrainingCandidateResult[],
    generation: number,
  ): CandidateGenome[] {
    const next: CandidateGenome[] = evaluated.slice(0, this.config.eliteCount).map((candidate, index) => ({
      id: `candidate-${generation + 1}-${index + 1}`,
      genome: candidate.genome.slice(),
    }));
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

  private createModel(
    champion: TrainingCandidateResult,
    validationFitness: number | undefined,
  ): TrainedModelArtifact {
    return {
      formatVersion: 1,
      observationVersion: 1,
      id: `ga-${Date.now()}`,
      name: `GA champion ${new Date().toISOString()}`,
      createdAt: new Date().toISOString(),
      topology: [...this.config.topology],
      genome: Array.from(champion.genome),
      trainingConfig: cloneConfig(this.config),
      trainingFitness: champion.fitness,
      validationFitness,
      metrics: champion.metrics,
    };
  }
}

function buildGenerationReport(
  generation: number,
  evaluated: TrainingCandidateResult[],
  validation: Evaluation | undefined,
  elapsedMs: number,
  simulations: number,
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
    bestMetrics: evaluated[0].metrics,
    validationMetrics: validation?.metrics,
    elapsedMs,
    simulationsPerSecond: simulations * 1000 / elapsedMs,
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

function cloneCandidate(candidate: TrainingCandidateResult): TrainingCandidateResult {
  return { ...candidate, genome: candidate.genome.slice(), metrics: { ...candidate.metrics } };
}

function cloneConfig(config: GeneticTrainingConfig): GeneticTrainingConfig {
  return {
    ...config,
    topology: [...config.topology],
    trainingSeeds: [...config.trainingSeeds],
    validationSeeds: [...config.validationSeeds],
    scenarioWeights: { ...config.scenarioWeights },
    fitnessWeights: { ...config.fitnessWeights },
  };
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
  const scenarioWeight = Object.values(config.scenarioWeights).reduce((sum, value) => sum + value, 0);
  if (scenarioWeight <= 0) throw new Error('scenario weights must have a positive sum');
}
