import { NETWORK_PROTOCOL_VERSION, type GameSnapshotDTO } from '@snake-game/contracts';
import {
  MultiplayerSnapshotProjector,
  snapshotToGameState,
} from '../src/multiplayer/MultiplayerSnapshotProjector';

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
});

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
