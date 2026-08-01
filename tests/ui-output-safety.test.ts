import { createEmptyBoard } from '../src/engine/board';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { GameState } from '../src/engine/types';
import { renderResults } from '../src/app/ui/results';
import { renderHUD } from '../src/app/ui/game';
import { GameLayoutBuilder } from '../src/app/ui/game-layout';
import { createDefaultSettings } from '../src/engine/settings';
import { getDeadSnakeColor } from '../src/shared/color';
import { renderGame } from '../src/renderer/canvasRenderer';
import { saveScore } from '../src/storage/scoreStorage';

function createUnsafeState(): GameState {
  return {
    board: createEmptyBoard(8, 8),
    width: 8,
    height: 8,
    snakes: [new SnakeEntity(0, '<img src=x onerror="alert(1)">', [{ x: 2, y: 2 }], 'right', false)],
    foods: [],
    roundResults: [],
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

  test('canvas marks only human snakes with their colored player numbers during round start', () => {
    const state = createUnsafeState();
    state.gameOver = false;
    state.levelComplete = false;
    state.snakes.push(
      new SnakeEntity(1, 'Игрок 2', [{ x: 5, y: 5 }], 'left', false),
      new SnakeEntity(2, 'Бот', [{ x: 4, y: 4 }], 'up', true)
    );
    const settings = createDefaultSettings();
    const markerTexts: Array<{ text: string; color: string | CanvasGradient | CanvasPattern }> = [];
    let currentFillStyle: string | CanvasGradient | CanvasPattern = '';
    const contextMethods = {
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      filter: 'none',
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      scale: jest.fn(),
      fillText(text: string) {
        markerTexts.push({ text, color: currentFillStyle });
      },
    };
    Object.defineProperty(contextMethods, 'fillStyle', {
      get: () => currentFillStyle,
      set: (value: string | CanvasGradient | CanvasPattern) => { currentFillStyle = value; },
    });
    const ctx = contextMethods as unknown as CanvasRenderingContext2D;

    renderGame(ctx, state, 10, settings, { playerMarkerElapsedMs: 0 });
    expect(markerTexts).toEqual([
      { text: '1', color: settings.snakeColors[0] },
      { text: '2', color: settings.snakeColors[1] },
    ]);

    markerTexts.length = 0;
    renderGame(ctx, state, 10, settings, { playerMarkerElapsedMs: 1000 });
    expect(markerTexts).toEqual([]);
  });

  test('results render compact final ranking and safe player names', () => {
    const root = document.createElement('div');
    const state = createUnsafeState();
    state.snakes[0].score = 30;
    state.snakes[0].levelsWon = 2;
    state.snakes.push(
      new SnakeEntity(1, 'Серебряный', [{ x: 3, y: 3 }], 'right', true),
      new SnakeEntity(2, 'Бронзовый', [{ x: 4, y: 4 }], 'right', true)
    );
    state.snakes[1].score = 20;
    state.snakes[1].levelsWon = 1;
    state.snakes[2].score = 10;
    state.snakes[2].die('Столкновение со стеной');
    state.roundResults = [1, 2].map(level => ({
      level,
      winnerId: level === 1 ? 0 : 1,
      snakes: state.snakes.map(snake => ({
        snakeId: snake.id,
        name: snake.name,
        isBot: snake.isBot,
        foodsEaten: level + snake.id,
        scoreGained: 5,
        totalScore: level * 5,
        alive: snake.id !== 2,
        deathReason: snake.id === 2 ? 'Столкновение со стеной' : undefined,
      })),
    }));
    saveScore({
      playerName: 'Рекордсмен',
      score: 100,
      levelsWon: 3,
      date: '01.08.2026',
      isBot: false,
    });
    saveScore({
      playerName: 'Старый рекорд бота',
      score: 200,
      levelsWon: 10,
      date: '01.08.2026',
      isBot: true,
    });

    renderResults(root, state, jest.fn(), jest.fn());

    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(root.querySelector('.results-rounds-table')).toBeNull();
    expect(root.querySelector('.results-title')?.textContent).toBe('Итоговые результаты');
    expect(root.querySelectorAll('.results-final-table tbody tr')).toHaveLength(3);
    expect(root.querySelector('.podium-place--1')?.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(root.querySelector('.podium-place--2')?.textContent).toContain('Серебряный');
    expect(root.querySelector('.podium-place--3')?.textContent).toContain('Бронзовый');
    expect(root.querySelector('.results-winner')?.textContent).toContain('Победитель');
    expect(root.textContent).toContain('Столкновение со стеной');
    expect(root.querySelector('#participants-title')?.textContent).toBe('Итоги по всем раундам');
    expect(root.querySelector('.results-high-scores-table')?.textContent).toContain('Рекордсмен');
    expect(root.querySelector('.results-high-scores-table')?.textContent).not.toContain('Старый рекорд бота');
    const finalSection = root.querySelector('.results-final-section')!;
    const winner = root.querySelector('.results-winner')!;
    const podium = root.querySelector('.results-podium')!;
    const highScores = root.querySelector('.results-high-scores-section')!;
    expect(finalSection.compareDocumentPosition(winner) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(winner.compareDocumentPosition(podium) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(podium.compareDocumentPosition(highScores) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(root.querySelector('.results-summary-grid')).toBeNull();
  });

  test('HUD renders player names as text instead of markup', () => {
    const appRoot = document.createElement('div');
    document.body.appendChild(appRoot);
    new GameLayoutBuilder(appRoot).build(false);
    const top = appRoot.querySelector<HTMLElement>('#hud-top')!;
    const left = appRoot.querySelector<HTMLElement>('#hud-left')!;
    const right = appRoot.querySelector<HTMLElement>('#hud-right')!;
    const bots = appRoot.querySelector<HTMLElement>('#hud-bottom')!;
    const fastForwardSlot = appRoot.querySelector<HTMLElement>('#hud-fast-forward')!;
    const state = createUnsafeState();
    const settings = createDefaultSettings();
    renderHUD(top, left, right, bots, fastForwardSlot, state, false, settings);

    expect(left.previousElementSibling?.textContent).toBe('Игрок 1');
    expect(right.previousElementSibling?.textContent).toBe('Игрок 2');
    expect(left.closest('.game-players-panel')).toBe(right.closest('.game-players-panel'));
    expect(right.closest<HTMLElement>('.game-player-section')?.hidden).toBe(true);
    expect(bots.closest('.game-bots-panel')).not.toBeNull();
    expect(appRoot.querySelector('.game-middle')?.children[1].id).toBe('gameCanvas');
    expect(left.querySelector('img')).toBeNull();
    expect(left.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(left.querySelector<HTMLElement>('.hud-snake-stats')?.style.getPropertyValue('--hud-snake-color'))
      .toBe(settings.snakeColors[0]);

    state.snakes[0].alive = false;
    renderHUD(top, left, right, bots, fastForwardSlot, state, false, settings);
    expect(left.querySelector<HTMLElement>('.hud-snake-stats')?.style.getPropertyValue('--hud-snake-color'))
      .toBe(getDeadSnakeColor(settings.snakeColors[0]));
    appRoot.remove();
  });

  test('HUD offers fast-forwarding a mixed game after all human snakes die', () => {
    const appRoot = document.createElement('div');
    document.body.appendChild(appRoot);
    new GameLayoutBuilder(appRoot).build(false);
    const top = appRoot.querySelector<HTMLElement>('#hud-top')!;
    const left = appRoot.querySelector<HTMLElement>('#hud-left')!;
    const right = appRoot.querySelector<HTMLElement>('#hud-right')!;
    const bots = appRoot.querySelector<HTMLElement>('#hud-bottom')!;
    const fastForwardSlot = appRoot.querySelector<HTMLElement>('#hud-fast-forward')!;
    const state = createUnsafeState();
    state.gameOver = false;
    state.levelComplete = false;
    state.snakes[0].alive = false;
    state.snakes.push(
      new SnakeEntity(1, 'Бот 1', [{ x: 3, y: 3 }], 'right', true),
      new SnakeEntity(2, 'Бот 2', [{ x: 4, y: 4 }], 'right', true)
    );
    const onFastForward = jest.fn();

    renderHUD(top, left, right, bots, fastForwardSlot, state, false, createDefaultSettings(), onFastForward);
    const fastForwardButton = fastForwardSlot.querySelector<HTMLButtonElement>('.hud-fast-forward-button');
    expect(fastForwardButton?.textContent).toBe('Быстро доиграть');
    expect(fastForwardButton?.classList.contains('btn-primary')).toBe(true);
    expect(document.activeElement).toBe(fastForwardButton);
    expect(fastForwardSlot.previousElementSibling).toBe(right.closest('.game-player-section'));
    expect(right.closest<HTMLElement>('.game-player-section')?.hidden).toBe(true);

    renderHUD(top, left, right, bots, fastForwardSlot, state, false, createDefaultSettings(), onFastForward);
    const buttonAfterHudUpdate = fastForwardSlot.querySelector<HTMLButtonElement>('.hud-fast-forward-button');
    expect(buttonAfterHudUpdate).toBe(fastForwardButton);

    buttonAfterHudUpdate?.click();
    expect(onFastForward).toHaveBeenCalledTimes(1);
    appRoot.remove();
  });
});
