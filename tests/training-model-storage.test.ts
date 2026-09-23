import { createDefaultGeneticTrainingConfig } from '@snake-game/core';
import type { TrainedModelArtifact } from '@snake-game/core';
import {
  LocalModelRepository,
  TRAINED_MODELS_STORAGE_KEY,
  parseModelArtifact,
} from '../apps/web/src/training/LocalModelRepository';
import {
  LocalTrainingPresetRepository,
  TRAINING_PRESETS_STORAGE_KEY,
} from '../apps/web/src/training/LocalTrainingPresetRepository';

describe('local trained model repository', () => {
  beforeEach(() => localStorage.clear());

  test.each([5, 6] as const)('round-trips v%i models and presets without modifying the genome', observationVersion => {
    const model = createModel();
    model.observationVersion = observationVersion;
    model.trainingConfig = { ...createDefaultGeneticTrainingConfig(86, 1, observationVersion), topology: [86, 2, 3] };
    model.topology = [86, 2, 3];
    model.genome = Array.from({ length: 183 }, (_, i) => i / 1000);
    expect(parseModelArtifact(JSON.stringify(model))).toEqual(model);
    const presets = new LocalTrainingPresetRepository(localStorage);
    presets.save({ id: 'new-version', name: 'Инициализация', config: model.trainingConfig,
      createdAt: model.createdAt, labSettings: {
        displayMode: 'background', workerSelection: 'automatic', workerCount: 4, checkpointEvery: 10,
      } });
    expect(presets.list()[0].config.observationVersion).toBe(observationVersion);
    model.trainingConfig.visionSize = 10;
    expect(() => parseModelArtifact(JSON.stringify(model))).toThrow();
  });

  test('stores and restores a versioned model', async () => {
    const repository = new LocalModelRepository(localStorage);
    const model = createModel();
    model.trainingConfig.heuristicOpponent = 'solid';

    await repository.save(model);

    await expect(repository.get(model.id)).resolves.toEqual(model);
    expect(localStorage.getItem(TRAINED_MODELS_STORAGE_KEY)).toContain(model.id);
    expect(parseModelArtifact(JSON.stringify(model))).toEqual(model);
  });

  test('rejects a model whose genome does not match its topology', () => {
    const model = createModel();
    model.genome.pop();

    expect(() => parseModelArtifact(JSON.stringify(model))).toThrow('совместимую модель');
  });

  test('rejects unknown heuristic IDs in imported models', () => {
    const model = createModel();
    const invalid = { ...model, trainingConfig: { ...model.trainingConfig, heuristicOpponent: 'mixed' } };
    expect(() => parseModelArtifact(JSON.stringify(invalid))).toThrow('совместимую модель');
  });

  test('round-trips dual-channel models and rejects inconsistent observation metadata', async () => {
    const model = createModel();
    model.observationVersion = 4;
    model.trainingConfig = createDefaultGeneticTrainingConfig(167, 1, 4);
    model.topology = [167, 3];
    model.trainingConfig.topology = [...model.topology];
    model.genome = new Array(504).fill(0);
    const repository = new LocalModelRepository(localStorage);
    await repository.save(model);
    expect(await repository.get(model.id)).toEqual(model);
    expect(parseModelArtifact(JSON.stringify(model))).toEqual(model);
    model.trainingConfig.observationVersion = 3;
    expect(() => parseModelArtifact(JSON.stringify(model))).toThrow('совместимую модель');
  });

  test('rejects models with an older observation version', () => {
    const model = { ...createModel(), observationVersion: 2 };

    expect(() => parseModelArtifact(JSON.stringify(model))).toThrow('совместимую модель');
  });

  test('stores and deletes a named custom training preset', () => {
    const repository = new LocalTrainingPresetRepository(localStorage);
    const config = createDefaultGeneticTrainingConfig(14);
    repository.save({
      id: 'feeding-tuned',
      name: 'Моё кормление',
      createdAt: '2026-09-14T10:00:00.000Z',
      config,
      labSettings: {
        displayMode: 'background',
        workerSelection: 'automatic',
        workerCount: 4,
        checkpointEvery: 10,
      },
    });

    expect(repository.list()).toHaveLength(1);
    expect(localStorage.getItem(TRAINING_PRESETS_STORAGE_KEY)).toContain('Моё кормление');
    repository.delete('feeding-tuned');
    expect(repository.list()).toEqual([]);
  });
});

function createModel(): TrainedModelArtifact {
  return {
    formatVersion: 1,
    observationVersion: 3,
    id: 'test-model',
    name: 'Тестовая модель',
    createdAt: '2026-09-10T10:00:00.000Z',
    topology: [14, 3],
    genome: new Array(45).fill(0),
    trainingConfig: {
      ...createDefaultGeneticTrainingConfig(14),
      topology: [14, 3],
    },
    trainingFitness: 5,
    validationFitness: 4,
    metrics: {
      runs: 1,
      averageScore: 1,
      averageFoodEaten: 1,
      averageSurvivedTicks: 10,
      averageFinalLength: 6,
      winRate: 0,
      drawRate: 0,
      tickLimitRate: 0,
      aliveRate: 0,
      deathReasons: { wall: 1 },
    },
  };
}
