import { GameConfig, GameState, Direction, Snake } from './types';
import { createEmptyBoard, buildBoard } from './board';
import { EngineContext } from './context';
import { getLevelOverride, GameSettings, resolveSettingsForLevel } from './settings';
import { generateWalls, validateWalls } from './spawning/wallsGenerator';
import { spawnFood } from './spawning/rabbitsSpawner';
import { runTickPipeline } from './systems/tickPipeline';
import { DomainEvent, TickResult } from './events';
import { SnakeEntity } from './entities/SnakeEntity';
import { getInitialFoodCount, getWallClusterCount, getWallLength } from './formulas';
import {
  getEnemyCells,
} from './systems/enemySystem';

/**
 * OOP facade for core game engine operations.
 * Keeps state initialization and tick progression in one cohesive class.
 */
export class GameEngine {
  private activeContext: EngineContext;

  constructor(private readonly context: EngineContext) {
    this.activeContext = context;
  }

  getSettings(): GameSettings {
    return this.activeContext.settings;
  }

  createGameState(config: GameConfig, level: number): GameState {
    this.activateLevelSettings(level);
    const settings = this.activeContext.settings;
    const boardLevel = config.gameMode === 'survival'
      ? Math.min(level, settings.survivalMaxBoardLevel)
      : level;
    const width = settings.baseWidth + (boardLevel - 1) * settings.levelSizeIncrement;
    const height = settings.baseHeight + (boardLevel - 1) * settings.levelSizeIncrement;

    return {
      board: createEmptyBoard(width, height),
      width,
      height,
      snakes: [],
      foods: [],
      enemies: [],
      nextFoodId: 0,
      nextEnemyId: 0,
      targetHedgehogCount: 0,
      roundResults: [],
      walls: [],
      level,
      gameMode: config.gameMode ?? 'classic',
      difficultyLevel: config.difficultyLevel,
      tickCount: 0,
      hedgehogSpawnWindowStartTick: 0,
      lastAutoFoodSpawnTick: 0,
      levelTimeLeft: settings.levelTimeLimit,
      gameOver: false,
      levelComplete: false,
    };
  }

  initLevel(state: GameState, config: GameConfig): void {
    this.activateLevelSettings(state.level);
    const settings = this.activeContext.settings;
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
    state.walls = generateWalls(state.width, state.height, clusterCount, wallLength, exclusionZones, this.activeContext);

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

    state.enemies = [];
    state.nextEnemyId = 0;

    const foodCount =
      levelOverride.foodCount
      ?? getInitialFoodCount(totalSnakes, state.difficultyLevel, settings);
    state.foods = spawnFood(foodCount, state, this.activeContext);
    state.targetHedgehogCount = 0;

    state.board = buildBoard(state, this.activeContext.settings);
    state.tickCount = 0;
    state.hedgehogSpawnWindowStartTick = 0;
    state.lastAutoFoodSpawnTick = 0;
    state.levelTimeLeft = settings.levelTimeLimit;
    state.levelComplete = false;
    state.gameOver = false;
  }

  /** Expand a survival board while preserving every existing game entity. */
  expandSurvivalLevel(state: GameState): GameState {
    const previousSettings = this.activeContext.settings;
    const previousOverride = getLevelOverride(state.level, previousSettings);
    const previousClusterCount = previousOverride.wallClusters
      ?? getWallClusterCount(state.level, previousSettings);
    const nextLevel = state.level + 1;

    this.activateLevelSettings(nextLevel);
    const settings = this.activeContext.settings;
    const boardLevel = Math.min(nextLevel, settings.survivalMaxBoardLevel);
    const targetWidth = Math.max(
      state.width,
      settings.baseWidth + (boardLevel - 1) * settings.levelSizeIncrement
    );
    const targetHeight = Math.max(
      state.height,
      settings.baseHeight + (boardLevel - 1) * settings.levelSizeIncrement
    );
    const offsetX = Math.floor((targetWidth - state.width) / 2);
    const offsetY = Math.floor((targetHeight - state.height) / 2);
    const oldBounds = {
      x: offsetX,
      y: offsetY,
      width: state.width,
      height: state.height,
    };

    if (offsetX > 0 || offsetY > 0) {
      for (const snake of state.snakes) {
        for (const segment of snake.segments) this.shiftPosition(segment, offsetX, offsetY);
      }
      for (const food of state.foods) {
        this.shiftPosition(food.pos, offsetX, offsetY);
        if (food.originPos) this.shiftPosition(food.originPos, offsetX, offsetY);
      }
      for (const enemy of state.enemies) {
        this.shiftPosition(enemy.pos, offsetX, offsetY);
        if (enemy.plannedMove) this.shiftPosition(enemy.plannedMove, offsetX, offsetY);
      }
      for (const wall of state.walls) this.shiftPosition(wall, offsetX, offsetY);

      const nextOverride = getLevelOverride(nextLevel, settings);
      const nextClusterCount = nextOverride.wallClusters
        ?? getWallClusterCount(nextLevel, settings);
      const additionalClusterCount = Math.max(0, nextClusterCount - previousClusterCount);
      const wallLength = nextOverride.wallLength ?? getWallLength(state.difficultyLevel, settings);
      this.addWallsToExpandedArea(
        state,
        targetWidth,
        targetHeight,
        oldBounds,
        additionalClusterCount,
        wallLength
      );
    }

    state.level = nextLevel;
    state.width = targetWidth;
    state.height = targetHeight;
    state.targetHedgehogCount = 0;
    state.hedgehogSpawnWindowStartTick = state.tickCount;
    state.board = buildBoard(state, settings);
    state.levelComplete = false;
    state.gameOver = false;
    return state;
  }

  processTick(state: GameState): TickResult {
    const events: DomainEvent[] = [];

    if (state.gameOver || state.levelComplete) return { events };

    state.tickCount++;
    runTickPipeline(state, this.activeContext, events);
    return { events };
  }

  elapseLevelSecond(state: GameState): void {
    if (state.gameOver || state.levelComplete || state.snakes.length <= 1) return;
    state.levelTimeLeft = Math.max(0, state.levelTimeLeft - 1);
  }

  private addWallsToExpandedArea(
    state: GameState,
    width: number,
    height: number,
    oldBounds: { x: number; y: number; width: number; height: number },
    clusterCount: number,
    wallLength: number
  ): void {
    if (clusterCount === 0) return;
    const occupiedPositions = [
      ...state.snakes.flatMap(snake => snake.segments),
      ...state.foods.map(food => food.pos),
      ...state.enemies.flatMap(enemy => getEnemyCells(enemy)),
    ];
    const isInExpandedArea = (position: { x: number; y: number }): boolean =>
      position.x < oldBounds.x
      || position.x >= oldBounds.x + oldBounds.width
      || position.y < oldBounds.y
      || position.y >= oldBounds.y + oldBounds.height;
    const candidates = generateWalls(
      width,
      height,
      clusterCount,
      wallLength,
      occupiedPositions,
      this.activeContext,
      50,
      { placementFilter: isInExpandedArea, allowEdgePlacement: true }
    );
    const wallKeys = new Set(state.walls.map(wall => `${wall.x},${wall.y}`));

    for (const candidate of candidates) {
      const key = `${candidate.x},${candidate.y}`;
      if (wallKeys.has(key)) continue;
      const proposedWalls = [...state.walls, candidate];
      if (!validateWalls(proposedWalls, width, height)) continue;
      state.walls.push(candidate);
      wallKeys.add(key);
    }
  }

  private shiftPosition(position: { x: number; y: number }, offsetX: number, offsetY: number): void {
    position.x += offsetX;
    position.y += offsetY;
  }

  createSnake(
    id: number,
    name: string,
    startPos: { x: number; y: number },
    direction: Direction,
    isBot: boolean
  ): Snake {
    const settings = this.activeContext.settings;
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

  private activateLevelSettings(level: number): void {
    this.activeContext = {
      settings: resolveSettingsForLevel(level, this.context.settings),
      rng: this.context.rng,
    };
  }

}
