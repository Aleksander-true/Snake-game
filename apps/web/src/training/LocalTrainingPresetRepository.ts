import {
  resolveTrainingScenarioGames,
  type GeneticTrainingConfig,
  type TrainingLabSettings,
} from '@snake-game/core';

export const TRAINING_PRESETS_STORAGE_KEY = 'snake.trainingPresets.v1';
const MAX_CUSTOM_PRESETS = 30;

export interface CustomTrainingPreset {
  id: string;
  name: string;
  createdAt: string;
  config: GeneticTrainingConfig;
  labSettings: TrainingLabSettings;
}

export class LocalTrainingPresetRepository {
  constructor(private readonly storage: Storage = localStorage) {}

  list(): CustomTrainingPreset[] {
    const serialized = this.storage.getItem(TRAINING_PRESETS_STORAGE_KEY);
    if (!serialized) return [];
    try {
      const value = JSON.parse(serialized) as unknown;
      if (!Array.isArray(value)) return [];
      return value.filter(isCustomTrainingPreset).map(clonePreset);
    } catch {
      return [];
    }
  }

  save(preset: CustomTrainingPreset): void {
    if (!isCustomTrainingPreset(preset)) throw new Error('Invalid custom training preset');
    const presets = this.list().filter((item) => item.id !== preset.id);
    presets.unshift(clonePreset(preset));
    this.storage.setItem(
      TRAINING_PRESETS_STORAGE_KEY,
      JSON.stringify(presets.slice(0, MAX_CUSTOM_PRESETS)),
    );
  }

  delete(id: string): void {
    this.storage.setItem(
      TRAINING_PRESETS_STORAGE_KEY,
      JSON.stringify(this.list().filter((preset) => preset.id !== id)),
    );
  }
}

function isCustomTrainingPreset(value: unknown): value is CustomTrainingPreset {
  if (!value || typeof value !== 'object') return false;
  const preset = value as Partial<CustomTrainingPreset>;
  return typeof preset.id === 'string'
    && typeof preset.name === 'string'
    && preset.name.trim().length > 0
    && typeof preset.createdAt === 'string'
    && !!preset.config
    && !!preset.labSettings;
}

function clonePreset(preset: CustomTrainingPreset): CustomTrainingPreset {
  const cloned = JSON.parse(JSON.stringify(preset)) as CustomTrainingPreset;
  cloned.config.scenarioGames = resolveTrainingScenarioGames(cloned.config);
  delete cloned.config.scenarioWeights;
  return cloned;
}
