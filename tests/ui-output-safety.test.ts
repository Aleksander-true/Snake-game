import { createEmptyBoard } from '../src/engine/board';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { GameState } from '../src/engine/types';
import { renderResults } from '../src/app/ui/results';
import { renderHUD } from '../src/app/ui/game';
import { createDefaultSettings } from '../src/engine/settings';

function createUnsafeState(): GameState {
  return {
    board: createEmptyBoard(8, 8),
    width: 8,
    height: 8,
    snakes: [new SnakeEntity(0, '<img src=x onerror="alert(1)">', [{ x: 2, y: 2 }], 'right', false)],
    foods: [],
    rabbits: [],
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
    renderHUD(top, left, null, null, createUnsafeState(), false, createDefaultSettings());

    expect(left.querySelector('img')).toBeNull();
    expect(left.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
