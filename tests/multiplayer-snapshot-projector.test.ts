import {
  NETWORK_PROTOCOL_VERSION,
  type GameSnapshotDTO,
  type RoomSnapshotDTO,
} from '@snake-game/contracts';
import { MultiplayerGamePresenter } from '../src/app/services/MultiplayerGamePresenter';
import {
  MultiplayerSnapshotProjector,
  snapshotToGameState,
} from '../src/multiplayer/MultiplayerSnapshotProjector';

jest.mock('../src/renderer/canvasRenderer', () => ({
  calculateCellSize: jest.fn(() => 10),
  renderGame: jest.fn(),
}));

describe('multiplayer snapshot projection', () => {
  test('converts the complete server snapshot into renderer state', () => {
    const state = snapshotToGameState(createSnapshot(), 'classic');

    expect(state).toMatchObject({
      width: 12,
      height: 10,
      level: 2,
      tickCount: 7,
      difficultyLevel: 4,
      levelComplete: false,
      gameOver: false,
    });
    expect(state.snakes[0]).toMatchObject({
      id: 0,
      name: 'Игрок',
      direction: 'right',
      alive: true,
      score: 5,
      isBot: false,
    });
    expect(state.foods.map((food) => food.kind)).toEqual(['apple', 'chicken', 'meat']);
    expect(state.enemies[0]).toMatchObject({ id: 'hedgehog-1', width: 2, height: 2 });
    expect(state.walls).toEqual([{ x: 0, y: 0 }]);
  });

  test('predicts one local step and removes it after server acknowledgement', () => {
    const projector = new MultiplayerSnapshotProjector();
    projector.reconcile(createSnapshot(), 'player-1', 'classic');

    const predicted = projector.predict(0, 'down');
    expect(predicted?.snakes[0]).toMatchObject({
      direction: 'down',
      segments: [{ x: 3, y: 3 }, { x: 3, y: 2 }],
    });

    const unacknowledged = projector.reconcile(createSnapshot(), 'player-1', 'classic');
    expect(unacknowledged.snakes[0].head).toEqual({ x: 3, y: 3 });

    const acknowledgedSnapshot = createSnapshot();
    acknowledgedSnapshot.tick = 8;
    acknowledgedSnapshot.acknowledgedInputByPlayer['player-1'] = 0;
    acknowledgedSnapshot.snakes[0].direction = 'down';
    acknowledgedSnapshot.snakes[0].segments = [{ x: 3, y: 3 }, { x: 3, y: 2 }];
    const reconciled = projector.reconcile(acknowledgedSnapshot, 'player-1', 'classic');

    expect(reconciled.snakes[0].head).toEqual({ x: 3, y: 3 });
    expect(reconciled.snakes[0].segments).toHaveLength(2);
  });

  test('shows round readiness and a separate final-game action over the last board', () => {
    const root = document.createElement('div');
    const contextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);
    const presenter = new MultiplayerGamePresenter(root);
    const onReady = jest.fn();
    const onExit = jest.fn();
    const roundSnapshot = createSnapshot();
    roundSnapshot.status = 'round-complete';

    presenter.showSnapshot(
      roundSnapshot,
      'player-1',
      'classic',
      jest.fn(),
      onReady,
      onExit
    );
    presenter.showRoomState(createRoomSnapshot('round-complete', 'connected'), 'player-1', onReady, onExit);

    const action = root.querySelector('.multiplayer-round-panel .btn') as HTMLButtonElement;
    expect(root.querySelector('.multiplayer-round-panel')?.textContent).toContain('Раунд 1 завершён');
    expect(action.textContent).toBe('Играть следующий раунд');
    action.click();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(action.disabled).toBe(true);

    const finalSnapshot = createSnapshot();
    finalSnapshot.status = 'game-complete';
    finalSnapshot.snakes[0].levelsWon = 6;
    presenter.showSnapshot(finalSnapshot, 'player-1', 'classic', jest.fn(), onReady, onExit);
    expect(root.querySelector('.multiplayer-round-panel')?.textContent).toContain('Победитель: Игрок');
    expect(action.textContent).toBe('Вернуться в меню');
    action.click();
    expect(onExit).toHaveBeenCalledTimes(1);

    presenter.stop();
    contextSpy.mockRestore();
  });
});

function createRoomSnapshot(
  status: RoomSnapshotDTO['status'],
  participantStatus: RoomSnapshotDTO['participants'][number]['status']
): RoomSnapshotDTO {
  return {
    roomId: 'room-1',
    config: {
      name: 'Комната',
      visibility: 'public',
      humanSlots: 1,
      bots: [],
      difficultyLevel: 4,
      gameMode: 'classic',
    },
    status,
    participants: [{
      playerId: 'player-1',
      name: 'Игрок',
      slotIndex: 0,
      isCreator: true,
      status: participantStatus,
    }],
    currentRound: 1,
  };
}

function createSnapshot(): GameSnapshotDTO {
  return {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    matchId: 'match-1',
    serverTimeMs: 1000,
    tick: 7,
    tickIntervalMs: 150,
    acknowledgedInputByPlayer: { 'player-1': -1 },
    status: 'playing',
    level: 2,
    levelTimeLeft: 118,
    difficultyLevel: 4,
    width: 12,
    height: 10,
    snakes: [{
      snakeId: 0,
      slotIndex: 0,
      segments: [{ x: 3, y: 2 }, { x: 2, y: 2 }],
      direction: 'right',
      alive: true,
      score: 5,
      levelsWon: 1,
      ticksWithoutFood: 2,
      controller: {
        type: 'human',
        controllerId: 'player-1',
        displayName: 'Игрок',
        connected: true,
      },
    }],
    foods: [
      { position: { x: 6, y: 2 }, kind: 'apple', age: 3 },
      { position: { x: 7, y: 3 }, kind: 'chicken', age: 60, facing: 'right' },
      { position: { x: 8, y: 4 }, kind: 'meat', age: 2 },
    ],
    enemies: [{
      enemyId: 'hedgehog-1',
      kind: 'hedgehog',
      position: { x: 9, y: 7 },
      width: 2,
      height: 2,
      facing: 'left',
    }],
    walls: [{ x: 0, y: 0 }],
  };
}
