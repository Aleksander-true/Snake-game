import { TrainingLabController } from '../apps/web/src/training/TrainingLabController';

jest.mock('../apps/web/src/training/LocalModelRepository', () => ({
  LocalModelRepository: class {
    list = async () => [];
  },
  parseModelArtifact: jest.fn(),
}));

jest.mock('../apps/web/src/training/TrainingCheckpointRepository', () => ({
  IndexedDbTrainingCheckpointRepository: class {
    list = async () => [];
  },
}));

jest.mock('../apps/web/src/training/BrowserGeneticTrainingRunner', () => ({
  BrowserGeneticTrainingRunner: class {
    isRunning = () => false;
    stop = jest.fn();
  },
}));

describe('training replay controls', () => {
  test('places the training scenario selector above the canvas', () => {
    const middle = document.createElement('div');
    const canvas = document.createElement('canvas');
    middle.appendChild(canvas);
    const panel = document.createElement('aside');
    const controller = new TrainingLabController({
      canvas,
      panel,
      outputHost: document.createElement('div'),
      previewPanel: document.createElement('div'),
      initialConfig: {
        seed: 1,
        level: 1,
        difficultyLevel: 1,
        maxTicks: 1_000,
        gameMode: 'classic',
      },
      onBack: jest.fn(),
    });

    controller.mount();

    const opponent = panel.querySelector<HTMLSelectElement>('#trainingHeuristicOpponent')!;
    expect(Array.from(opponent.options).map(option => option.value)).toEqual(['rookie', 'basic', 'solid', 'wise']);
    expect(opponent.value).toBe('rookie');
    opponent.value = 'solid';
    panel.querySelector<HTMLInputElement>('#trainingPresetName')!.value = 'Only Solid';
    panel.querySelector<HTMLButtonElement>('#trainingPresetSave')!.click();
    opponent.value = 'rookie';
    panel.querySelector<HTMLButtonElement>('#trainingPresetApply')!.click();
    expect(opponent.value).toBe('solid');

    const column = middle.querySelector('.training-canvas-column');
    const select = column?.querySelector<HTMLSelectElement>('#trainingReplayScenario');
    expect(select).not.toBeNull();
    expect(Array.from(select?.options ?? []).map((option) => option.value))
      .toEqual(['solo', 'heuristic', 'cohort']);
    expect(column?.querySelector('.training-canvas-stage canvas')).toBe(canvas);
    const vision = panel.querySelector<HTMLInputElement>('#trainingVisionSize')!;
    expect(vision.value).toBe('9');
    expect(vision.step).toBe('2');
    const type = panel.querySelector<HTMLSelectElement>('#trainingObservationVersion')!;
    expect(type.value).toBe('4');
    expect(Array.from(type.options).map(option => option.value)).toEqual(['3', '4', '5', '6']);
    for (const version of ['5', '6']) {
      type.value = version;
      type.dispatchEvent(new Event('change'));
      panel.querySelector<HTMLInputElement>('#trainingPresetName')!.value = `Version ${version}`;
      panel.querySelector<HTMLButtonElement>('#trainingPresetSave')!.click();
      type.value = '3';
      panel.querySelector<HTMLButtonElement>('#trainingPresetApply')!.click();
      expect(type.value).toBe(version);
    }
    for (const invalid of ['10', '8.5', '64', '2', '']) {
      vision.value = invalid;
      vision.dispatchEvent(new Event('input'));
      expect(vision.checkValidity()).toBe(false);
    }
    vision.value = '11';
    vision.dispatchEvent(new Event('input'));
    expect(vision.checkValidity()).toBe(true);
    type.value = '3';
    type.dispatchEvent(new Event('change'));
    expect(vision.value).toBe('11');
    controller.stop();
  });
});
