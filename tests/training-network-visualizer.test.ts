import type { NeuralNetworkTrace } from '@snake-game/core';
import { TrainingNetworkVisualizer } from '../src/training/TrainingNetworkVisualizer';

describe('training network visualizer', () => {
  test('renders vision, hidden layers and relative output activations', () => {
    const host = document.createElement('aside');
    const visualizer = new TrainingNetworkVisualizer(host);
    const trace: NeuralNetworkTrace = {
      input: new Float32Array([-1, 0, 1, 0.5, 0.25, 0.75]),
      layerValues: [
        new Float32Array([-0.5, 0, 0.5, 1]),
        new Float32Array([-0.2, 0.7, 0.1]),
      ],
      output: {
        scores: new Float32Array([-0.2, 0.7, 0.1]),
        actionIndex: 1,
        action: 'front',
      },
    };

    visualizer.showTopology([6, 4, 3]);
    visualizer.render(trace);

    const visionCells = host.querySelectorAll('.training-network-grid--vision .training-network-cell');
    expect(visionCells).toHaveLength(4);
    expect((visionCells[0] as HTMLElement).style.getPropertyValue('--activation-color'))
      .toMatch(/^rgb\(255,/);
    expect((visionCells[1] as HTMLElement).style.getPropertyValue('--activation-color'))
      .toBe('rgb(255, 255, 255)');
    expect((visionCells[2] as HTMLElement).style.getPropertyValue('--activation-color'))
      .toMatch(/, 255,/);
    expect(host.querySelectorAll('.training-network-grid--hidden .training-network-cell'))
      .toHaveLength(4);
    expect(host.querySelector('[data-action="front"]')?.textContent).toBe('↑');
    expect(host.querySelector('[data-action="left"]')?.textContent).toBe('←');
    expect(host.querySelector('[data-action="right"]')?.textContent).toBe('→');
    expect(host.querySelector('[data-action="front"]')?.classList
      .contains('training-network-output--selected')).toBe(true);
  });
});
