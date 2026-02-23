import { GameConfig, GameState, Direction, Snake } from './types';
import { createEmptyBoard, buildBoard } from './board';
import { EngineContext } from './context';
import { applyLevelSettingOverrides, getLevelOverride, GameSettings } from './settings';
import { generateWalls } from './spawning/wallsGenerator';
import { spawnFood } from './spawning/rabbitsSpawner';
import { runTickPipeline } from './systems/tickPipeline';
import { DomainEvent, TickResult } from './events';
import { SnakeEntity } from './entities/SnakeEntity';
import { getInitialFoodCount, getWallClusterCount, getWallLength } from './formulas';
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
      gameMode: config.gameMode ?? 'classic',
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
          this.getBotColorName(snakeId, settings),
          startSlot.position,
          startSlot.direction,
          true
        )
      );
      snakeId++;
    }

    const foodCount =
      levelOverride.foodCount
      ?? levelOverride.rabbitCount
      ?? getInitialFoodCount(totalSnakes, state.difficultyLevel, settings);
    state.foods = spawnFood(foodCount, state, this.context);
    syncLegacyFoodAlias(state);

    state.board = buildBoard(state, this.context.settings);
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

  private getBotColorName(snakeId: number, settings: GameSettings): string {
    const palette = settings.snakeColors;
    if (palette.length === 0) return `Бот ${snakeId + 1}`;
    const color = palette[snakeId % palette.length].toLowerCase();
    const map: Record<string, string> = {
      '#ff0000': 'Красный',
      '#00ff00': 'Зелёный',
      '#0000ff': 'Синий',
      '#ffff00': 'Жёлтый',
      '#ff00ff': 'Фиолетовый',
      '#ff8800': 'Оранжевый',
      '#88ff88': 'Салатовый',
    };
    if (map[color]) return map[color];

    const rgb = this.hexToRgb(color);
    if (!rgb) return `Бот ${snakeId + 1}`;

    // Family-based fallback so near-blue tones (e.g. #00CCFF) still get a color name.
    if (rgb.b >= 170 && rgb.g >= 140 && rgb.r <= 90) return 'Синий';
    if (rgb.g >= 170 && rgb.r <= 120 && rgb.b <= 120) return 'Зелёный';
    if (rgb.r >= 170 && rgb.g >= 120 && rgb.b <= 90) return 'Оранжевый';
    if (rgb.r >= 170 && rgb.g >= 170 && rgb.b <= 110) return 'Жёлтый';
    if (rgb.r >= 150 && rgb.b >= 150 && rgb.g <= 130) return 'Фиолетовый';
    if (rgb.r >= 170 && rgb.g <= 110 && rgb.b <= 110) return 'Красный';

    return `Бот ${snakeId + 1}`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return null;
    const value = match[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

}
