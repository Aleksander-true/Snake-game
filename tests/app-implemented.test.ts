import { InputHandler } from '../src/app/inputHandler';
import { InputApplicationService } from '../src/app/services/InputApplicationService';
import { SessionProgressionService } from '../src/app/services/SessionProgressionService';
import { ScorePersistenceService } from '../src/app/services/ScorePersistenceService';
import { GameController } from '../src/app/gameController';
import { GameEngine } from '../src/engine/GameEngine';
import { createDefaultSettings, resetSettings } from '../src/engine/settings';
import { EngineContext } from '../src/engine/context';
import { RandomPort } from '../src/engine/ports';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { GameConfig, GameState } from '../src/engine/types';
import { createEmptyBoard } from '../src/engine/board';
import { clearScores, getScores } from '../src/storage/scoreStorage';
import { processBots } from '../src/ai/botController';
import { hideModal } from '../src/app/ui/modal';

jest.mock('../src/ai/botController', () => ({
  processBots: jest.fn(),
}));

const testRng: RandomPort = {
  next: () => 0.5,
  nextInt: (max: number) => Math.floor(max / 2),
};

function createCtx(): EngineContext {
  return {
    settings: createDefaultSettings(),
    rng: testRng,
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

describe('App implemented behavior', () => {
  beforeEach(() => {
    resetSettings();
    localStorage.clear();
    clearScores();
    (processBots as jest.Mock).mockReturnValue(new Map());
  });

  describe('InputHandler', () => {
    test('stores last direction per player and clears buffer on consume', () => {
      const input = new InputHandler();
      input.setPlayerCount(2);
      input.start();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));

      const snapshot = input.consumeAll();
      expect(snapshot.directions[0]).toBe('right');
      expect(snapshot.directions[1]).toBe('left');

      const afterConsume = input.consumeAll();
      expect(afterConsume.directions).toEqual([null, null]);

      input.stop();
    });

    test('space key triggers pause callback and does not add direction command', () => {
      const input = new InputHandler();
      const pauseSpy = jest.fn();
      input.onPause(pauseSpy);
      input.start();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(pauseSpy).toHaveBeenCalledTimes(1);
      expect(input.consumeAll().directions).toEqual([null, null]);

      input.stop();
    });

    test('in single-player mode arrow keys are mapped to player 1', () => {
      const input = new InputHandler();
      input.setPlayerCount(1);
      input.start();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      const snapshot = input.consumeAll();
      expect(snapshot.directions).toEqual(['up', null]);

      input.stop();
    });

    test('in two-player mode WASD controls P1 and arrows control P2 simultaneously', () => {
      const input = new InputHandler();
      input.setPlayerCount(2);
      input.start();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
      const snapshot = input.consumeAll();
      expect(snapshot.directions).toEqual(['right', 'left']);

      input.stop();
    });

    test('escape triggers escape callback and enter triggers confirm callback', () => {
      const input = new InputHandler();
      const escapeSpy = jest.fn();
      const confirmSpy = jest.fn();
      input.onEscape(escapeSpy);
      input.onConfirm(confirmSpy);
      input.start();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
      expect(escapeSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(input.consumeAll().directions).toEqual([null, null]);

      input.stop();
    });
  });

  describe('InputApplicationService', () => {
    test('applies player directions only for alive player snakes', () => {
      const service = new InputApplicationService();
      const state = createState();
      const player = new SnakeEntity(0, 'P1', [{ x: 3, y: 3 }, { x: 2, y: 3 }], 'right', false);
      const deadPlayer = new SnakeEntity(1, 'P2', [{ x: 7, y: 7 }, { x: 6, y: 7 }], 'up', false);
      deadPlayer.alive = false;
      state.snakes = [player, deadPlayer];

      const config: GameConfig = {
        playerCount: 2,
        botCount: 0,
        playerNames: ['P1', 'P2'],
        difficultyLevel: 1,
      };

      service.applyTickCommands(state, config, createDefaultSettings(), {
        directions: ['up', 'left'],
      });

      expect(player.direction).toBe('up');
      expect(deadPlayer.direction).toBe('up');
    });

    test('applies bot directions by snake id and ignores dead bots', () => {
      const service = new InputApplicationService();
      const state = createState();
      const bot1 = new SnakeEntity(2, 'Бот 1', [{ x: 3, y: 3 }, { x: 2, y: 3 }], 'up', true);
      const bot2 = new SnakeEntity(3, 'Бот 2', [{ x: 7, y: 7 }, { x: 6, y: 7 }], 'left', true);
      bot2.alive = false;
      state.snakes = [bot1, bot2];

      (processBots as jest.Mock).mockReturnValue(
        new Map<number, 'up' | 'down' | 'left' | 'right'>([
          [2, 'right'],
          [3, 'down'],
        ])
      );

      const config: GameConfig = {
        playerCount: 0,
        botCount: 2,
        playerNames: [],
        difficultyLevel: 1,
      };

      service.applyTickCommands(state, config, createDefaultSettings(), {
        directions: [null, null],
      });

      expect(bot1.direction).toBe('right');
      expect(bot2.direction).toBe('left');
    });

    test('applies both player commands in the same tick in two-player mode', () => {
      const service = new InputApplicationService();
      const state = createState();
      const player1 = new SnakeEntity(0, 'P1', [{ x: 3, y: 3 }, { x: 2, y: 3 }], 'right', false);
      const player2 = new SnakeEntity(1, 'P2', [{ x: 7, y: 7 }, { x: 8, y: 7 }], 'left', false);
      state.snakes = [player1, player2];

      const config: GameConfig = {
        playerCount: 2,
        botCount: 0,
        playerNames: ['P1', 'P2'],
        difficultyLevel: 1,
      };

      service.applyTickCommands(state, config, createDefaultSettings(), {
        directions: ['up', 'down'],
      });

      expect(player1.direction).toBe('up');
      expect(player2.direction).toBe('down');
    });
  });

  describe('SessionProgressionService', () => {
    test('advances level and preserves score/levelsWon between states', () => {
      const ctx = createCtx();
      const engine = new GameEngine(ctx);
      const progression = new SessionProgressionService();
      const config: GameConfig = {
        playerCount: 1,
        botCount: 0,
        playerNames: ['Игрок 1'],
        difficultyLevel: 1,
      };

      const current = engine.createGameState(config, 1);
      engine.initLevel(current, config);
      current.snakes[0].score = 9;
      current.snakes[0].levelsWon = 2;

      const next = progression.advanceToNextLevel(current, config, engine);
      expect(next.level).toBe(2);
      expect(next.snakes[0].score).toBe(9);
      expect(next.snakes[0].levelsWon).toBe(2);
      expect(next.tickCount).toBe(0);
      expect(next.levelComplete).toBe(false);
    });
  });

  describe('GameEngine bot names', () => {
    test('assigns bot names based on snake color palette', () => {
      const ctx = createCtx();
      const engine = new GameEngine(ctx);
      const config: GameConfig = {
        playerCount: 0,
        botCount: 2,
        playerNames: [],
        difficultyLevel: 1,
      };

      const state = engine.createGameState(config, 1);
      engine.initLevel(state, config);

      expect(state.snakes[0].name).toBe('Зелёный');
      expect(state.snakes[1].name).toBe('Синий');
    });
  });

  describe('ScorePersistenceService', () => {
    test('saves session scores for every snake', () => {
      const service = new ScorePersistenceService();
      const state = createState();
      state.snakes = [
        new SnakeEntity(0, 'Игрок 1', [{ x: 1, y: 1 }, { x: 1, y: 2 }], 'up', false),
        new SnakeEntity(1, 'Бот 1', [{ x: 4, y: 4 }, { x: 4, y: 5 }], 'up', true),
      ];
      state.snakes[0].score = 7;
      state.snakes[0].levelsWon = 1;
      state.snakes[1].score = 3;
      state.snakes[1].levelsWon = 0;

      service.saveSessionScores(state);

      const scores = getScores();
      expect(scores).toHaveLength(2);
      expect(scores.some(score => score.playerName === 'Игрок 1' && score.score === 7 && !score.isBot)).toBe(true);
      expect(scores.some(score => score.playerName === 'Бот 1' && score.score === 3 && score.isBot)).toBe(true);
    });
  });

  describe('GameController keyboard exit flows', () => {
    test('Escape in paused state exits to menu immediately', () => {
      const callbacks = {
        onShowResults: jest.fn(),
        onGoToMenu: jest.fn(),
      };
      const controller = new GameController(createCtx(), new InputHandler(), callbacks, false);
      controller.getFSM().reset('Paused');

      controller.handleEscapeKey();

      expect(callbacks.onGoToMenu).toHaveBeenCalledTimes(1);
    });

    test('Escape in playing opens confirm modal, Enter confirms exit to menu', () => {
      const callbacks = {
        onShowResults: jest.fn(),
        onGoToMenu: jest.fn(),
      };
      const controller = new GameController(createCtx(), new InputHandler(), callbacks, false);
      controller.getFSM().reset('Playing');

      controller.handleEscapeKey();
      expect(document.getElementById('modal-overlay')).not.toBeNull();
      expect(document.getElementById('modal-confirm')).not.toBeNull();
      expect(callbacks.onGoToMenu).toHaveBeenCalledTimes(0);

      controller.handleConfirmKey();
      expect(callbacks.onGoToMenu).toHaveBeenCalledTimes(1);
      hideModal();
    });
  });
});
