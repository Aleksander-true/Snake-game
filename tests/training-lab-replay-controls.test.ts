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
    const controller = new TrainingLabController({
      canvas,
      panel: document.createElement('aside'),
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

    const column = middle.querySelector('.training-canvas-column');
    const select = column?.querySelector<HTMLSelectElement>('#trainingReplayScenario');
    expect(select).not.toBeNull();
    expect(Array.from(select?.options ?? []).map((option) => option.value))
      .toEqual(['solo', 'heuristic', 'cohort']);
    expect(column?.querySelector('.training-canvas-stage canvas')).toBe(canvas);
    controller.stop();
  });
});
