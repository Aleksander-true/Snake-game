import { processBots } from '../../ai/botController';
import { GameConfig, GameState } from '../../engine/types';
import { GameSettings } from '../../engine/settings';
import { applyDirection } from '../../engine/systems/movementSystem';
import { isReverseDirection } from '../../engine/collision';
import { InputSnapshot } from '../inputHandler';

/**
 * Applies all movement commands at tick boundary.
 * Keeps command application logic isolated from high-level game orchestration.
 */
export class InputApplicationService {
  applyTickCommands(state: GameState, config: GameConfig, settings: GameSettings, input: InputSnapshot): void {
    this.applyPlayerDirections(state, config, input);
    this.applyBotDirections(state, settings);
  }

  private applyPlayerDirections(state: GameState, config: GameConfig, input: InputSnapshot): void {
    for (let playerIndex = 0; playerIndex < config.playerCount; playerIndex++) {
      const playerSnake = state.snakes[playerIndex];
      if (!playerSnake || !playerSnake.alive) continue;
      const queuedDirections = input.directionQueues?.[playerIndex]
        ?? (input.directions[playerIndex] ? [input.directions[playerIndex] as NonNullable<typeof input.directions[number]>] : []);
      const requestedDirection = [...queuedDirections]
        .reverse()
        .find(direction => !isReverseDirection(playerSnake.direction, direction));
      if (!requestedDirection) continue;
      applyDirection(playerSnake, requestedDirection);
    }
  }

  private applyBotDirections(state: GameState, settings: GameSettings): void {
    const botDirections = processBots(state, settings);
    for (const [botSnakeId, requestedDirection] of botDirections) {
      const botSnake = state.snakes.find(snake => snake.id === botSnakeId);
      if (!botSnake || !botSnake.alive) continue;
      applyDirection(botSnake, requestedDirection);
    }
  }
}
