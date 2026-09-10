import { createArenaDemoController } from '../src/arena/ArenaDemoRunner';
import type { HeuristicAlgorithm } from '@snake-game/core';
import { renderGame } from '../src/renderer/canvasRenderer';

jest.mock('../src/renderer/canvasRenderer', () => ({
  renderGame: jest.fn(),
}));

const alwaysForward: HeuristicAlgorithm = {
  id: 'always-forward',
  chooseDirection: (_state, snake) => snake.direction,
};

describe('arena demo runner', () => {
  test('reports rendered frames and completion once', () => {
    jest.useFakeTimers();
    const canvas = document.createElement('canvas');
    canvas.getContext = jest.fn().mockReturnValue({});
    const onRender = jest.fn();
    const onComplete = jest.fn();
    const controller = createArenaDemoController({
      canvas,
      participants: [{ name: 'Champion', algorithm: alwaysForward }],
      speedMultiplier: 1000,
      onRender,
      onComplete,
    });

    controller.start();
    jest.advanceTimersByTime(100);

    expect(renderGame).toHaveBeenCalled();
    expect(onRender).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(controller.getState().gameOver || controller.getState().levelComplete).toBe(true);

    controller.start();
    jest.advanceTimersByTime(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    controller.stop();
    jest.useRealTimers();
  });
});
