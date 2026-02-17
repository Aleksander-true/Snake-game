import {
  applyJSONToSettings,
  createDefaultSettings,
  gameSettings,
  getLevelOverride,
  resetSettings,
  setLevelOverride,
  settingsToJSON,
} from '../src/engine/settings';
import { clearScores, getSavedNames, getScores, saveName, saveScore } from '../src/storage/scoreStorage';
import { GameFSM } from '../src/app/gameFSM';
import { GameLoopScheduler } from '../src/app/services/GameLoopScheduler';
import { LevelCompletionService } from '../src/app/services/LevelCompletionService';
import { GameState } from '../src/engine/types';
import { createEmptyBoard } from '../src/engine/board';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';

jest.mock('../src/app/ui/modal', () => ({
  showLevelCompleteModal: jest.fn(),
  showGameOverModal: jest.fn(),
  hideModal: jest.fn(),
}));

import { hideModal, showGameOverModal, showLevelCompleteModal } from '../src/app/ui/modal';

function createState(): GameState {
  return {
    board: createEmptyBoard(10, 10),
    width: 10,
    height: 10,
    snakes: [],
    rabbits: [],
    walls: [],
    level: 1,
    difficultyLevel: 1,
    tickCount: 0,
    levelTimeLeft: 180,
    gameOver: false,
    levelComplete: false,
  };
}

describe('Settings, storage and app state helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    clearScores();
    resetSettings();
  });

  test('settings JSON export/import and override helpers work', () => {
    gameSettings.hungerThreshold = 99;
    setLevelOverride(3, { wallClusters: 7, rabbitCount: 4 });

    const json = settingsToJSON();
    expect(json.snake.hungerThreshold).toBe(99);
    expect(json.levelOverrides['3']).toEqual({ wallClusters: 7, rabbitCount: 4 });

    resetSettings();
    applyJSONToSettings({
      snake: { hungerThreshold: 77, minSnakeLength: 3, initialSnakeLength: 6 },
      board: {
        baseWidth: gameSettings.baseWidth,
        baseHeight: gameSettings.baseHeight,
        levelSizeIncrement: gameSettings.levelSizeIncrement,
        levelTimeLimit: 222,
        tickIntervalMs: gameSettings.tickIntervalMs,
      },
      levelOverrides: { '5': { wallLength: 9 } },
    });

    expect(gameSettings.hungerThreshold).toBe(77);
    expect(gameSettings.minSnakeLength).toBe(3);
    expect(gameSettings.initialSnakeLength).toBe(6);
    expect(gameSettings.levelTimeLimit).toBe(222);
    expect(getLevelOverride(5)).toEqual({ wallLength: 9 });
    expect(getLevelOverride(999)).toEqual({});

    resetSettings();
    const defaults = createDefaultSettings();
    expect(gameSettings.hungerThreshold).toBe(defaults.hungerThreshold);
  });

  test('score and name storage keep sorted scores, deduplicate names and handle clear', () => {
    saveScore({ playerName: 'A', score: 5, levelsWon: 0, date: '01.01.2026', isBot: false });
    saveScore({ playerName: 'B', score: 10, levelsWon: 1, date: '01.01.2026', isBot: true });
    const scores = getScores();
    expect(scores).toHaveLength(2);
    expect(scores[0].playerName).toBe('B');
    expect(scores[1].playerName).toBe('A');

    saveName('  Alex  ');
    saveName('Ivan');
    saveName('Alex');
    saveName('   ');
    expect(getSavedNames()).toEqual(['Alex', 'Ivan']);

    clearScores();
    expect(getScores()).toEqual([]);
  });

  test('GameFSM transitions and space behavior are consistent', () => {
    const fsm = new GameFSM();
    const transitions: string[] = [];
    fsm.onTransition((from, to, event) => transitions.push(`${from}:${event}->${to}`));

    expect(fsm.getState()).toBe('Menu');
    expect(fsm.send('START_GAME')).toBe('Playing');
    expect(fsm.handleSpace()).toBe('PAUSE');
    expect(fsm.send('PAUSE')).toBe('Paused');
    expect(fsm.handleSpace()).toBe('RESUME');
    expect(fsm.send('RESUME')).toBe('Playing');
    expect(fsm.send('LEVEL_END')).toBe('LevelComplete');
    expect(fsm.handleSpace()).toBe('CONTINUE');
    expect(fsm.send('CONTINUE')).toBe('Playing');
    expect(fsm.send('GAME_END')).toBe('GameOver');
    expect(fsm.handleSpace()).toBe('SHOW_RESULTS');
    expect(fsm.send('SHOW_RESULTS')).toBe('Results');
    expect(fsm.send('GO_TO_MENU')).toBe('Menu');
    expect(fsm.send('RESUME')).toBeNull();
    expect(fsm.isStopped()).toBe(true);

    expect(transitions.length).toBeGreaterThan(0);
  });

  test('GameLoopScheduler starts once and stops both timers', () => {
    jest.useFakeTimers();
    const scheduler = new GameLoopScheduler();
    const onSecondElapsed = jest.fn();
    const onTick = jest.fn();

    scheduler.start(150, { onSecondElapsed, onTick });
    scheduler.start(150, { onSecondElapsed, onTick });
    expect(scheduler.isRunning()).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(onSecondElapsed).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalled();

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);

    const secondCalls = onSecondElapsed.mock.calls.length;
    const tickCalls = onTick.mock.calls.length;
    jest.advanceTimersByTime(1000);
    expect(onSecondElapsed.mock.calls.length).toBe(secondCalls);
    expect(onTick.mock.calls.length).toBe(tickCalls);
    jest.useRealTimers();
  });

  test('LevelCompletionService chooses level/game-over modals based on state and mode', () => {
    const service = new LevelCompletionService();
    const settings = createDefaultSettings();
    const actions = {
      setState: jest.fn(),
      onContinue: jest.fn(),
      onShowResults: jest.fn(),
      onRestartSameLevel: jest.fn(),
    };

    const progressing = createState();
    progressing.snakes = [new SnakeEntity(0, 'P1', [{ x: 1, y: 1 }, { x: 1, y: 2 }], 'up', false)];
    service.handleCompletion(progressing, false, settings, actions);
    expect(actions.setState).toHaveBeenCalledWith('LevelComplete');
    expect(showLevelCompleteModal).toHaveBeenCalled();

    jest.clearAllMocks();
    const gameOver = createState();
    const dead = new SnakeEntity(0, 'P1', [{ x: 1, y: 1 }, { x: 1, y: 2 }], 'up', false);
    dead.alive = false;
    gameOver.snakes = [dead];
    service.handleCompletion(gameOver, false, settings, actions);
    expect(actions.setState).toHaveBeenCalledWith('GameOver');
    expect(showGameOverModal).toHaveBeenCalled();

    jest.clearAllMocks();
    service.handleCompletion(gameOver, true, settings, actions);
    expect(actions.setState).toHaveBeenCalledWith('LevelComplete');
    expect(showLevelCompleteModal).toHaveBeenCalled();
    const callback = (showLevelCompleteModal as jest.Mock).mock.calls[0][1] as () => void;
    callback();
    expect(hideModal).toHaveBeenCalled();
    expect(actions.onRestartSameLevel).toHaveBeenCalledWith(gameOver.level);
  });
});
