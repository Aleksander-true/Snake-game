import { GameState, GameConfig, Direction, Snake, Rabbit } from './types';
import { buildBoard, createEmptyBoard } from './board';
import { gameSettings, getLevelOverride } from './settings';
import { generateWalls } from './spawning/wallsGenerator';
import { spawnRabbits } from './spawning/rabbitsSpawner';
import { getNextHeadPosition, moveSnake, applyDirection } from './systems/movementSystem';
import { collidesWithWall, collidesWithSnake, selfCollision } from './collision';
import { processHunger, resetHunger } from './systems/hungerSystem';
import { awardRabbitPoints } from './systems/scoringSystem';
import { processRabbitReproduction } from './systems/rabbitsReproductionSystem';
import { checkLevelComplete, getLevelWinner } from './systems/levelSystem';

/**
 * Create initial game state for a given config and level.
 */
export function createGameState(config: GameConfig, level: number): GameState {
  const width = gameSettings.baseWidth + (level - 1) * gameSettings.levelSizeIncrement;
  const height = gameSettings.baseHeight + (level - 1) * gameSettings.levelSizeIncrement;

  const state: GameState = {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    rabbits: [],
    walls: [],
    level,
    difficultyLevel: config.difficultyLevel,
    tickCount: 0,
    levelTimeLeft: gameSettings.levelTimeLimit,
    gameOver: false,
    levelComplete: false,
  };

  return state;
}

/**
 * Initialize a level: generate walls, spawn snakes, spawn rabbits.
 */
export function initLevel(state: GameState, config: GameConfig): void {
  const totalSnakes = config.playerCount + config.botCount;

  // Compute starting positions BEFORE wall generation so we can create exclusion zones
  const startPositions = getStartPositions(state.width, state.height, totalSnakes);

  // Build exclusion zones: all cells occupied by future snakes
  const exclusionZones = startPositions.flatMap(sp => {
    const zones: { x: number; y: number }[] = [];
    for (let i = 0; i < gameSettings.initialSnakeLength; i++) {
      switch (sp.direction) {
        case 'right': zones.push({ x: sp.position.x - i, y: sp.position.y }); break;
        case 'left':  zones.push({ x: sp.position.x + i, y: sp.position.y }); break;
        case 'down':  zones.push({ x: sp.position.x, y: sp.position.y - i }); break;
        case 'up':    zones.push({ x: sp.position.x, y: sp.position.y + i }); break;
      }
    }
    return zones;
  });

  // Generate walls (respect per-level overrides if present)
  const lvlOverride = getLevelOverride(state.level);
  const clusterCount = lvlOverride.wallClusters ?? getWallClusterCount(state.level);
  const wallLength = lvlOverride.wallLength ?? getWallLength(state.difficultyLevel);
  state.walls = generateWalls(state.width, state.height, clusterCount, wallLength, exclusionZones);

  // Spawn snakes
  state.snakes = [];

  let snakeId = 0;
  // Human players
  for (let i = 0; i < config.playerCount; i++) {
    const pos = startPositions[snakeId];
    const snake = createSnake(
      snakeId,
      config.playerNames[i] || `Игрок ${i + 1}`,
      pos.position,
      pos.direction,
      false
    );
    state.snakes.push(snake);
    snakeId++;
  }
  // Bots
  for (let i = 0; i < config.botCount; i++) {
    const pos = startPositions[snakeId];
    const snake = createSnake(
      snakeId,
      `Бот ${i + 1}`,
      pos.position,
      pos.direction,
      true
    );
    state.snakes.push(snake);
    snakeId++;
  }

  // Spawn rabbits (respect per-level override if present)
  const rabbitCount = lvlOverride.rabbitCount ?? getInitialRabbitCount(totalSnakes, state.difficultyLevel);
  state.rabbits = spawnRabbits(rabbitCount, state);

  // Build initial board
  state.board = buildBoard(state);
  state.tickCount = 0;
  state.levelTimeLeft = gameSettings.levelTimeLimit;
  state.levelComplete = false;
  state.gameOver = false;
}

/**
 * Get starting positions for snakes spread across the board.
 */
function getStartPositions(
  width: number,
  height: number,
  count: number
): Array<{ position: { x: number; y: number }; direction: Direction }> {
  const margin = gameSettings.initialSnakeLength + 2;
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

/**
 * Process one game tick.
 * Input directions should be set on snakes BEFORE calling this.
 */
export function processTick(state: GameState): void {
  if (state.gameOver || state.levelComplete) return;

  state.tickCount++;

  // 1. Move each snake
  for (const snake of state.snakes) {
    if (!snake.alive) continue;

    const newHead = getNextHeadPosition(snake.segments[0], snake.direction);

    // Check wall collision
    if (collidesWithWall(newHead, state)) {
      snake.alive = false;
      snake.deathReason = 'Врезалась в стену';
      continue;
    }

    // Check collision with other snakes (before moving)
    if (collidesWithSnake(newHead, state.snakes, snake.id, false)) {
      snake.alive = false;
      snake.deathReason = 'Столкнулась с другой змейкой';
      continue;
    }

    // Check if eating a rabbit
    const rabbitIndex = state.rabbits.findIndex(
      r => r.pos.x === newHead.x && r.pos.y === newHead.y
    );
    const eating = rabbitIndex !== -1;

    // Move
    moveSnake(snake, eating);

    // Self-collision (after moving)
    if (selfCollision(snake)) {
      snake.alive = false;
      snake.deathReason = 'Съела саму себя';
      continue;
    }

    // Eat rabbit
    if (eating) {
      state.rabbits.splice(rabbitIndex, 1);
      awardRabbitPoints(snake);
      resetHunger(snake);
    }
  }

  // 2. Process hunger
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    processHunger(snake);
  }

  // 3. Rabbit reproduction
  processRabbitReproduction(state);

  // 4. Rebuild board
  state.board = buildBoard(state);

  // 5. Check level completion
  if (checkLevelComplete(state)) {
    state.levelComplete = true;
    // Award level win in multiplayer
    if (state.snakes.length > 1) {
      const winnerId = getLevelWinner(state);
      if (winnerId !== null) {
        const winner = state.snakes.find(s => s.id === winnerId);
        if (winner) winner.levelsWon++;
      }
    }
  }
}

/**
 * Create a snake entity with a starting position.
 */
export function createSnake(
  id: number,
  name: string,
  startPos: { x: number; y: number },
  direction: Direction,
  isBot: boolean
): Snake {
  const segments = [];
  for (let i = 0; i < gameSettings.initialSnakeLength; i++) {
    switch (direction) {
      case 'up':
        segments.push({ x: startPos.x, y: startPos.y + i });
        break;
      case 'down':
        segments.push({ x: startPos.x, y: startPos.y - i });
        break;
      case 'left':
        segments.push({ x: startPos.x + i, y: startPos.y });
        break;
      case 'right':
        segments.push({ x: startPos.x - i, y: startPos.y });
        break;
    }
  }

  return {
    id,
    name,
    segments,
    direction,
    alive: true,
    score: 0,
    levelsWon: 0,
    ticksWithoutFood: 0,
    isBot,
  };
}

/**
 * Get the target score for a single level.
 * Formula: floor(targetScoreCoeff * level + targetScoreBase)
 */
export function getTargetScore(level: number): number {
  return Math.floor(gameSettings.targetScoreCoeff * level + gameSettings.targetScoreBase);
}

/**
 * Get the cumulative target score to complete a given level.
 * Level 1: 11, Level 2: 11+12=23, Level 3: 11+12+13=36, etc.
 */
export function getCumulativeTargetScore(level: number): number {
  let total = 0;
  for (let l = 1; l <= level; l++) {
    total += getTargetScore(l);
  }
  return total;
}

/**
 * Get the number of wall clusters for a level.
 * Formula: floor(wallClusterCoeff * level + wallClusterBase)
 */
export function getWallClusterCount(level: number): number {
  return Math.floor(gameSettings.wallClusterCoeff * level + gameSettings.wallClusterBase);
}

/**
 * Get wall segment length for difficulty.
 * Formula: floor(wallLengthCoeff * difficulty + wallLengthBase)
 */
export function getWallLength(difficultyLevel: number): number {
  return Math.floor(gameSettings.wallLengthCoeff * difficultyLevel + gameSettings.wallLengthBase);
}

/**
 * Get initial rabbit count.
 * Formula: floor(rabbitCountPerSnakeCoeff * snakeCount + rabbitCountBase - difficultyLevel)
 */
export function getInitialRabbitCount(snakeCount: number, difficultyLevel: number): number {
  return Math.floor(gameSettings.rabbitCountPerSnakeCoeff * snakeCount + (gameSettings.rabbitCountBase - difficultyLevel));
}
