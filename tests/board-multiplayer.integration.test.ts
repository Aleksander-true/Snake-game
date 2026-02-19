import { createEmptyBoard } from '../src/engine/board';
import { EngineContext } from '../src/engine/context';
import { GameEngine } from '../src/engine/GameEngine';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { RandomPort } from '../src/engine/ports';
import { createDefaultSettings, resetSettings } from '../src/engine/settings';
import { GameState } from '../src/engine/types';

function createCtx(): EngineContext {
  const rng: RandomPort = {
    next: () => 0.5,
    nextInt: (max: number) => Math.floor(max / 2),
  };
  return {
    settings: createDefaultSettings(),
    rng,
  };
}

function createState(width = 12, height = 12): GameState {
  return {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    foods: [],
    rabbits: [],
    walls: [],
    level: 1,
    difficultyLevel: 1,
    tickCount: 0,
    lastAutoFoodSpawnTick: 0,
    levelTimeLeft: 180,
    gameOver: false,
    levelComplete: false,
  };
}

describe('Board integration - multiplayer and edge cases', () => {
  beforeEach(() => {
    resetSettings();
  });

  test('self-collision kills snake and body remains on board', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState();
    const snake = new SnakeEntity(
      0,
      'Игрок 1',
      [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 }],
      'up',
      false
    );
    state.snakes = [snake];

    const result = engine.processTick(state);
    expect(snake.alive).toBe(false);
    expect(snake.deathReason).toBe('Съела саму себя');
    expect(result.events.some(event => event.type === 'SNAKE_DIED' && event.reason === 'Съела саму себя')).toBe(true);

    for (const seg of snake.segments) {
      expect(state.board[seg.y][seg.x]).toBe('#');
    }
  });

  test('collision with another snake kills mover and keeps board consistent', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState();
    const mover = new SnakeEntity(0, 'A', [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], 'right', false);
    const blocker = new SnakeEntity(1, 'B', [{ x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }], 'up', false);
    state.snakes = [mover, blocker];

    const result = engine.processTick(state);
    expect(mover.alive).toBe(false);
    expect(mover.deathReason).toBe('Столкнулась с другой змейкой');
    expect(blocker.alive).toBe(true);
    expect(result.events.some(event => event.type === 'SNAKE_DIED' && event.snakeId === mover.id)).toBe(true);

    for (const seg of mover.segments) {
      expect(state.board[seg.y][seg.x]).toBe('#');
    }
    for (const seg of blocker.segments) {
      expect(state.board[seg.y][seg.x]).toBe('#');
    }
  });

  test('multiplayer level completes with winner and increments levelsWon for survivor', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState(8, 8);
    const survivor = new SnakeEntity(10, 'Survivor', [{ x: 2, y: 2 }, { x: 2, y: 3 }], 'right', false);
    const doomed = new SnakeEntity(11, 'Doomed', [{ x: 7, y: 4 }, { x: 6, y: 4 }], 'right', false);
    state.snakes = [survivor, doomed];

    const result = engine.processTick(state);
    expect(doomed.alive).toBe(false);
    expect(state.levelComplete).toBe(true);
    expect(survivor.levelsWon).toBe(1);

    const levelEvent = result.events.find(event => event.type === 'LEVEL_COMPLETED');
    expect(levelEvent && 'winnerId' in levelEvent ? levelEvent.winnerId : undefined).toBe(survivor.id);
  });

  test('multiplayer level completes by timer with no winner', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState(20, 20);
    const s1 = new SnakeEntity(1, 'S1', [{ x: 5, y: 5 }, { x: 4, y: 5 }], 'right', false);
    const s2 = new SnakeEntity(2, 'S2', [{ x: 10, y: 10 }, { x: 9, y: 10 }], 'right', false);
    state.snakes = [s1, s2];
    state.levelTimeLeft = 0;

    const result = engine.processTick(state);
    expect(state.levelComplete).toBe(true);
    expect(s1.levelsWon).toBe(0);
    expect(s2.levelsWon).toBe(0);

    const levelEvent = result.events.find(event => event.type === 'LEVEL_COMPLETED');
    expect(levelEvent && 'reason' in levelEvent ? levelEvent.reason : '').toBe('Время вышло');
    expect(levelEvent && 'winnerId' in levelEvent ? levelEvent.winnerId : undefined).toBeUndefined();
  });
});
