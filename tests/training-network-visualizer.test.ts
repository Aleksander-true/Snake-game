import type { NeuralNetworkTrace } from '@snake-game/core';
import { TrainingNetworkVisualizer } from '../apps/web/src/training/TrainingNetworkVisualizer';

describe('training network visualizer', () => {
  test('renders v3 as a single 9 by 9 vision grid', () => {
    const host = document.createElement('aside');
    new TrainingNetworkVisualizer(host).showTopology([86, 16, 9, 3], 3);
    const grids = host.querySelectorAll('.training-network-grid--vision');
    expect(grids).toHaveLength(1);
    expect(grids[0].children).toHaveLength(81);
    expect(host.textContent).not.toContain('Угрозы и события');
  });
  test('renders vision, hidden layers and relative output activations', () => {
    const host = document.createElement('aside');
    const visualizer = new TrainingNetworkVisualizer(host);
    const trace: NeuralNetworkTrace = {
      input: new Float32Array([-1, 0, 1, 0.5, 0.25, 0.75, 0, 1, 0]),
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

    visualizer.showTopology([9, 4, 3]);
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

  test('groups previous-turn inputs under one triangular label', () => {
    const host = document.createElement('aside');
    const visualizer = new TrainingNetworkVisualizer(host);
    visualizer.showTopology([9, 3]);
    visualizer.render({
      input: new Float32Array([0, 0, 0, 0, 0.5, 0.25, 1, 0, 0]),
      layerValues: [new Float32Array([1, 0, 0])],
      output: {
        scores: new Float32Array([1, 0, 0]),
        actionIndex: 0,
        action: 'left',
      },
    });

    expect(host.querySelector('.training-network-turn-input')?.textContent).toContain('Повороты');
    expect(host.querySelector('.training-network-extra-inputs')?.textContent).toContain('Насыщение');
    expect(host.querySelectorAll('.training-network-turn')).toHaveLength(3);
    expect(host.querySelector('.training-network-turn--front')).not.toBeNull();
    expect(host.querySelector('.training-network-turn--left')).not.toBeNull();
    expect(host.querySelector('.training-network-turn--right')).not.toBeNull();
  });
});
