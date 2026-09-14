import type { TrainedModelArtifact } from '@snake-game/core';

export const TRAINED_MODELS_STORAGE_KEY = 'snake.geneticModels.v1';
const MAX_LOCAL_MODELS = 10;

export interface ModelRepository {
  save(model: TrainedModelArtifact): Promise<void>;
  get(id: string): Promise<TrainedModelArtifact | null>;
  list(): Promise<TrainedModelArtifact[]>;
  delete(id: string): Promise<void>;
}

export class LocalModelRepository implements ModelRepository {
  constructor(private readonly storage: Storage = localStorage) {}

  async save(model: TrainedModelArtifact): Promise<void> {
    validateModelArtifact(model);
    const models = (await this.list()).filter((item) => item.id !== model.id);
    models.unshift(cloneModel(model));
    this.storage.setItem(TRAINED_MODELS_STORAGE_KEY, JSON.stringify(models.slice(0, MAX_LOCAL_MODELS)));
  }

  async get(id: string): Promise<TrainedModelArtifact | null> {
    return (await this.list()).find((model) => model.id === id) ?? null;
  }

  async list(): Promise<TrainedModelArtifact[]> {
    const serialized = this.storage.getItem(TRAINED_MODELS_STORAGE_KEY);
    if (!serialized) return [];
    try {
      const value = JSON.parse(serialized) as unknown;
      if (!Array.isArray(value)) return [];
      return value.filter(isModelArtifact).map(cloneModel);
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const models = (await this.list()).filter((model) => model.id !== id);
    this.storage.setItem(TRAINED_MODELS_STORAGE_KEY, JSON.stringify(models));
  }
}

export function parseModelArtifact(serialized: string): TrainedModelArtifact {
  const value = JSON.parse(serialized) as unknown;
  if (!isModelArtifact(value)) throw new Error('Файл не содержит совместимую модель версии 1');
  return cloneModel(value);
}

function validateModelArtifact(value: TrainedModelArtifact): void {
  if (!isModelArtifact(value)) throw new Error('Invalid trained model artifact');
}

function isModelArtifact(value: unknown): value is TrainedModelArtifact {
  if (!value || typeof value !== 'object') return false;
  const model = value as Partial<TrainedModelArtifact>;
  const topology = model.topology;
  const expectedGenomeLength = Array.isArray(topology) && topology.length >= 2
    ? topology.slice(1).reduce((count, size, index) =>
      typeof size === 'number' && typeof topology[index] === 'number'
        ? count + topology[index] * size + size
        : Number.NaN,
    0)
    : Number.NaN;
  return model.formatVersion === 1
    && model.observationVersion === 1
    && typeof model.id === 'string'
    && typeof model.name === 'string'
    && Array.isArray(model.topology)
    && model.topology.length >= 2
    && model.topology.every((size) => Number.isInteger(size) && size > 0)
    && model.topology[model.topology.length - 1] === 3
    && Array.isArray(model.genome)
    && model.genome.length === expectedGenomeLength
    && model.genome.every((weight) => typeof weight === 'number' && Number.isFinite(weight))
    && !!model.trainingConfig
    && !!model.metrics
    && (model.labSettings === undefined || isLabSettings(model.labSettings));
}

function isLabSettings(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (settings.displayMode === 'visual' || settings.displayMode === 'background')
    && (settings.workerSelection === 'automatic' || settings.workerSelection === 'manual')
    && Number.isInteger(settings.workerCount)
    && (settings.workerCount as number) >= 1
    && Number.isInteger(settings.checkpointEvery)
    && (settings.checkpointEvery as number) >= 1
    && (settings.checkpointEvery as number) <= 100;
}

function cloneModel(model: TrainedModelArtifact): TrainedModelArtifact {
  return JSON.parse(JSON.stringify(model)) as TrainedModelArtifact;
}
