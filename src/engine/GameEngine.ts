import { GameConfig, GameState, Direction, Snake } from './types';
import { createEmptyBoard, buildBoard } from './board';
import { EngineContext } from './context';
import { applyLevelSettingOverrides, getLevelOverride, GameSettings } from './settings';
import { generateWalls } from './spawning/wallsGenerator';
import { spawnRabbits } from './spawning/rabbitsSpawner';
import { runTickPipeline } from './systems/tickPipeline';
import { DomainEvent, TickResult } from './events';
import { SnakeEntity } from './entities/SnakeEntity';
import { getInitialRabbitCount, getWallClusterCount, getWallLength } from './formulas';
import { syncLegacyFoodAlias } from './systems/foodSystem';

/**
 * OOP facade for core game engine operations.
 * Keeps state initialization and tick progression in one cohesive class.
 */
export class GameEngine {
  constructor(private readonly context: EngineContext) {}

  createGameState(config: GameConfig, level: number): GameState {
    const settings = this.context.settings;
    const width = settings.baseWidth + (level - 1) * settings.levelSizeIncrement;
    const height = settings.baseHeight + (level - 1) * settings.levelSizeIncrement;

    return {
      board: createEmptyBoard(width, height),
      width,
      height,
      snakes: [],
      foods: [],
      rabbits: [],
      walls: [],
      level,
      difficultyLevel: config.difficultyLevel,
      tickCount: 0,
      lastAutoFoodSpawnTick: 0,
      levelTimeLeft: settings.levelTimeLimit,
      gameOver: false,
      levelComplete: false,
    };
  }

  initLevel(state: GameState, config: GameConfig): void {
    const settings = this.context.settings;
    applyLevelSettingOverrides(state.level, settings);
    const totalSnakes = config.playerCount + config.botCount;
    const startPositions = this.getStartPositions(state.width, state.height, totalSnakes, settings);

    const exclusionZones = startPositions.flatMap(startSlot => {
      const zones: { x: number; y: number }[] = [];
      for (let segmentOffset = 0; segmentOffset < settings.initialSnakeLength; segmentOffset++) {
        switch (startSlot.direction) {
          case 'right': zones.push({ x: startSlot.position.x - segmentOffset, y: startSlot.position.y }); break;
          case 'left': zones.push({ x: startSlot.position.x + segmentOffset, y: startSlot.position.y }); break;
          case 'down': zones.push({ x: startSlot.position.x, y: startSlot.position.y - segmentOffset }); break;
          case 'up': zones.push({ x: startSlot.position.x, y: startSlot.position.y + segmentOffset }); break;
        }
      }
      return zones;
    });

    const levelOverride = getLevelOverride(state.level, settings);
    const clusterCount = levelOverride.wallClusters ?? getWallClusterCount(state.level, settings);
    const wallLength = levelOverride.wallLength ?? getWallLength(state.difficultyLevel, settings);
    state.walls = generateWalls(state.width, state.height, clusterCount, wallLength, exclusionZones, this.context);

    state.snakes = [];
    let snakeId = 0;

    for (let playerIndex = 0; playerIndex < config.playerCount; playerIndex++) {
      const startSlot = startPositions[snakeId];
      state.snakes.push(
        this.createSnake(
          snakeId,
          config.playerNames[playerIndex] || `Игрок ${playerIndex + 1}`,
          startSlot.position,
          startSlot.direction,
          false
        )
      );
      snakeId++;
    }

    for (let botIndex = 0; botIndex < config.botCount; botIndex++) {
      const startSlot = startPositions[snakeId];
      state.snakes.push(
        this.createSnake(
          snakeId,
          `Бот ${botIndex + 1}`,
          startSlot.position,
          startSlot.direction,
          true
        )
      );
      snakeId++;
    }

    const rabbitCount =
      levelOverride.rabbitCount ?? getInitialRabbitCount(totalSnakes, state.difficultyLevel, settings);
    state.foods = spawnRabbits(rabbitCount, state, this.context);
    syncLegacyFoodAlias(state);

    state.board = buildBoard(state);
    state.tickCount = 0;
    state.lastAutoFoodSpawnTick = 0;
    state.levelTimeLeft = settings.levelTimeLimit;
    state.levelComplete = false;
    state.gameOver = false;
  }

  processTick(state: GameState): TickResult {
    const events: DomainEvent[] = [];

    if (state.gameOver || state.levelComplete) return { events };

    state.tickCount++;
    runTickPipeline(state, this.context, events);
    return { events };
  }

  createSnake(
    id: number,
    name: string,
    startPos: { x: number; y: number },
    direction: Direction,
    isBot: boolean
  ): Snake {
    const settings = this.context.settings;
    const segments: { x: number; y: number }[] = [];

    for (let segmentOffset = 0; segmentOffset < settings.initialSnakeLength; segmentOffset++) {
      switch (direction) {
        case 'up':
          segments.push({ x: startPos.x, y: startPos.y + segmentOffset });
          break;
        case 'down':
          segments.push({ x: startPos.x, y: startPos.y - segmentOffset });
          break;
        case 'left':
          segments.push({ x: startPos.x + segmentOffset, y: startPos.y });
          break;
        case 'right':
          segments.push({ x: startPos.x - segmentOffset, y: startPos.y });
          break;
      }
    }

    return new SnakeEntity(id, name, segments, direction, isBot);
  }

  private getStartPositions(
    width: number,
    height: number,
    count: number,
    settings: GameSettings
  ): Array<{ position: { x: number; y: number }; direction: Direction }> {
    const margin = settings.initialSnakeLength + 2;
    const positions: Array<{ position: { x: number; y: number }; direction: Direction }> = [
      { position: { x: margin, y: Math.floor(height / 2) }, direction: 'right' },
      { position: { x: width - margin - 1, y: Math.floor(height / 2) }, direction: 'left' },
      { position: { x: Math.floor(width / 2), y: margin }, direction: 'down' },
      { position: { x: Math.floor(width / 2), y: height - margin - 1 }, direction: 'up' },
      { position: { x: margin, y: margin }, direction: 'right' },
      { position: { x: width - margin - 1, y: height - margin - 1 }, direction: 'left' },
    ];
    return positions.slice(0, count);
  }

}
