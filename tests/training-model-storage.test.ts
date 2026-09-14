import { createDefaultGeneticTrainingConfig } from '@snake-game/core';
import type { TrainedModelArtifact } from '@snake-game/core';
import {
  LocalModelRepository,
  TRAINED_MODELS_STORAGE_KEY,
  parseModelArtifact,
} from '../src/training/LocalModelRepository';
import {
  LocalTrainingPresetRepository,
  TRAINING_PRESETS_STORAGE_KEY,
} from '../src/training/LocalTrainingPresetRepository';

describe('local trained model repository', () => {
  beforeEach(() => localStorage.clear());

  test('stores and restores a versioned model', async () => {
    const repository = new LocalModelRepository(localStorage);
    const model = createModel();

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

  test('stores and deletes a named custom training preset', () => {
    const repository = new LocalTrainingPresetRepository(localStorage);
    const config = createDefaultGeneticTrainingConfig(2);
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
    observationVersion: 1,
    id: 'test-model',
    name: 'Тестовая модель',
    createdAt: '2026-09-10T10:00:00.000Z',
    topology: [2, 3],
    genome: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    trainingConfig: {
      ...createDefaultGeneticTrainingConfig(2),
      topology: [2, 3],
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
      aliveRate: 0,
      deathReasons: { wall: 1 },
    },
  };
}
