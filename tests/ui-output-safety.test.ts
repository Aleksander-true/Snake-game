import { createEmptyBoard } from '../src/engine/board';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { GameState } from '../src/engine/types';
import { renderResults } from '../src/app/ui/results';
import { renderHUD } from '../src/app/ui/game';
import { createDefaultSettings } from '../src/engine/settings';
import { getDeadSnakeColor } from '../src/shared/color';

function createUnsafeState(): GameState {
  return {
    board: createEmptyBoard(8, 8),
    width: 8,
    height: 8,
    snakes: [new SnakeEntity(0, '<img src=x onerror="alert(1)">', [{ x: 2, y: 2 }], 'right', false)],
    foods: [],
    walls: [],
    level: 1,
    difficultyLevel: 1,
    tickCount: 0,
    lastAutoFoodSpawnTick: 0,
    levelTimeLeft: 180,
    gameOver: true,
    levelComplete: true,
  };
}

describe('UI output safety', () => {
  beforeEach(() => localStorage.clear());

  test('results render player names as text instead of markup', () => {
    const root = document.createElement('div');
    renderResults(root, createUnsafeState(), jest.fn(), jest.fn());

    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  test('HUD renders player names as text instead of markup', () => {
    const top = document.createElement('div');
    const left = document.createElement('div');
    const state = createUnsafeState();
    const settings = createDefaultSettings();
    renderHUD(top, left, null, null, state, false, settings);

    expect(left.querySelector('img')).toBeNull();
    expect(left.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(left.querySelector<HTMLElement>('.hud-snake-stats')?.style.getPropertyValue('--hud-snake-color'))
      .toBe(settings.snakeColors[0]);

    state.snakes[0].alive = false;
    renderHUD(top, left, null, null, state, false, settings);
    expect(left.querySelector<HTMLElement>('.hud-snake-stats')?.style.getPropertyValue('--hud-snake-color'))
      .toBe(getDeadSnakeColor(settings.snakeColors[0]));
  });

  test('HUD offers fast-forwarding a mixed game after all human snakes die', () => {
    const top = document.createElement('div');
    const left = document.createElement('div');
    document.body.appendChild(left);
    const state = createUnsafeState();
    state.gameOver = false;
    state.levelComplete = false;
    state.snakes[0].alive = false;
    state.snakes.push(
      new SnakeEntity(1, 'Бот 1', [{ x: 3, y: 3 }], 'right', true),
      new SnakeEntity(2, 'Бот 2', [{ x: 4, y: 4 }], 'right', true)
    );
    const onFastForward = jest.fn();

    renderHUD(top, left, null, null, state, false, createDefaultSettings(), onFastForward);
    const fastForwardButton = left.querySelector<HTMLButtonElement>('.hud-fast-forward-button');
    expect(fastForwardButton?.textContent).toBe('Быстро доиграть');
    expect(fastForwardButton?.classList.contains('btn-primary')).toBe(true);
    expect(document.activeElement).toBe(fastForwardButton);

    renderHUD(top, left, null, null, state, false, createDefaultSettings(), onFastForward);
    const buttonAfterHudUpdate = left.querySelector<HTMLButtonElement>('.hud-fast-forward-button');
    expect(buttonAfterHudUpdate).toBe(fastForwardButton);

    buttonAfterHudUpdate?.click();
    expect(onFastForward).toHaveBeenCalledTimes(1);
    left.remove();
  });
});
