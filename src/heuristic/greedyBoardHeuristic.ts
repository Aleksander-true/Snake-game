import { BotProfileId, GameSettings } from '../engine/settings';
import { Direction, Food, GameState, Position, Snake } from '../engine/types';
import { getNextHeadPosition } from '../engine/systems/movementSystem';
import { getFoodReward } from '../engine/systems/foodSystem';
import { isReverseDirection } from '../engine/collision';
import { HeuristicAlgorithm } from './types';

interface DirectionEvaluation {
  direction: Direction;
  score: number;
}

export interface SkillProfile {
  id: string;
  trapPenalty: number;
  areaWeight: number;
  escapeWeight: number;
  foodWeight: number;
  immediateEatWeight: number;
  fearWeight: number;
  longSnakeThreshold: number;
  longSnakeFoodPenalty: number;
  mistakePeriod: number;
  badMoveBias: number;
}

export const wiseHeuristic: HeuristicAlgorithm = {
  id: 'wise',
  chooseDirection: (state, snake, settings) => chooseWiseDirection(state, snake, settings),
};

export function chooseDirectionByDifficulty(
  state: GameState,
  snake: Snake,
  settings: GameSettings
): Direction {
  const profile = resolveProfileByDifficulty(state.difficultyLevel, settings);
  return chooseDirectionByProfile(state, snake, settings, profile);
}

export function chooseWiseDirection(
  state: GameState,
  snake: Snake,
  settings: GameSettings
): Direction {
  return chooseDirectionByProfile(state, snake, settings, getSkillProfileById(settings, 'wise'));
}

export function chooseDirectionByProfile(
  state: GameState,
  snake: Snake,
  settings: GameSettings,
  profile: SkillProfile
): Direction {
  const candidates = getCandidateDirections(snake.direction);
  const ranked = candidates.map(direction => ({
    direction,
    score: evaluateDirection(state, snake, settings, direction, profile),
  }));
  ranked.sort((left, right) => right.score - left.score);
  const maybeBad = pickMistakeDirection(ranked, state, snake, profile);
  return maybeBad?.direction ?? ranked[0]?.direction ?? snake.direction;
}

function getCandidateDirections(current: Direction): Direction[] {
  const all: Direction[] = ['up', 'right', 'down', 'left'];
  return all.filter(candidate => !isReverseDirection(current, candidate));
}

function evaluateDirection(
  state: GameState,
  snake: Snake,
  settings: GameSettings,
  direction: Direction,
  profile: SkillProfile
): number {
  const nextHead = getNextHeadPosition(snake.head, direction);
  if (!isInBounds(nextHead, state)) return Number.NEGATIVE_INFINITY;
  if (isWall(nextHead, state)) return Number.NEGATIVE_INFINITY;

  const food = getFoodAt(nextHead, state.foods);
  const growth = food ? getFoodReward(food, settings).growth : 0;
  if (isSnakeCollision(nextHead, state, snake, growth > 0)) return Number.NEGATIVE_INFINITY;

  const blocked = buildBlockedCells(state, snake, growth > 0);
  blocked.delete(cellKey(nextHead));

  const reachableArea = floodFillArea(nextHead, state, blocked);
  if (reachableArea <= 0) return Number.NEGATIVE_INFINITY;

  const localEscapeRoutes = countFreeNeighbors(nextHead, state, blocked);
  const minSafeArea = snake.segments.length + 2;
  const trapPenalty = reachableArea < minSafeArea ? (minSafeArea - reachableArea) * profile.trapPenalty : 0;

  const nearestFoodDistance = getNearestFoodDistance(nextHead, state.foods);
  const nearestFoodReward = getNearestFoodReward(nextHead, state.foods, settings);
  const nearestSnakeDistance = getNearestOtherSnakeDistance(nextHead, state, snake.id);
  const foodSuppression = snake.segments.length >= profile.longSnakeThreshold
    ? profile.longSnakeFoodPenalty
    : 0;
  const foodScore = nearestFoodDistance === Number.POSITIVE_INFINITY
    ? 0
    : (nearestFoodReward * profile.foodWeight) / (nearestFoodDistance + 1);
  const fearPenalty = nearestSnakeDistance === Number.POSITIVE_INFINITY
    ? 0
    : profile.fearWeight / (nearestSnakeDistance + 1);

  const areaScore = reachableArea * profile.areaWeight;
  const escapeScore = localEscapeRoutes * profile.escapeWeight;
  const immediateEatBonus = food ? getFoodReward(food, settings).points * profile.immediateEatWeight : 0;

  return areaScore + escapeScore + (foodScore * (1 - foodSuppression)) + immediateEatBonus - trapPenalty - fearPenalty;
}

function isInBounds(pos: Position, state: GameState): boolean {
  return pos.x >= 0 && pos.x < state.width && pos.y >= 0 && pos.y < state.height;
}

function isWall(pos: Position, state: GameState): boolean {
  return state.walls.some(wall => wall.x === pos.x && wall.y === pos.y);
}

function isSnakeCollision(pos: Position, state: GameState, currentSnake: Snake, growing: boolean): boolean {
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    for (let segmentIndex = 0; segmentIndex < snake.segments.length; segmentIndex++) {
      const segment = snake.segments[segmentIndex];
      const isOwnTail = snake.id === currentSnake.id && segmentIndex === snake.segments.length - 1;
      if (!growing && isOwnTail) continue;
      if (segment.x === pos.x && segment.y === pos.y) return true;
    }
  }
  return false;
}

function buildBlockedCells(state: GameState, currentSnake: Snake, growing: boolean): Set<string> {
  const blocked = new Set<string>();
  for (const wall of state.walls) blocked.add(cellKey(wall));

  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    for (let segmentIndex = 0; segmentIndex < snake.segments.length; segmentIndex++) {
      const segment = snake.segments[segmentIndex];
      const isOwnTail = snake.id === currentSnake.id && segmentIndex === snake.segments.length - 1;
      if (!growing && isOwnTail) continue;
      blocked.add(cellKey(segment));
    }
  }

  return blocked;
}

function floodFillArea(start: Position, state: GameState, blocked: Set<string>): number {
  const visited = new Set<string>();
  const queue: Position[] = [start];
  let size = 0;

  while (queue.length > 0) {
    const pos = queue.shift() as Position;
    if (!isInBounds(pos, state)) continue;

    const key = cellKey(pos);
    if (visited.has(key) || blocked.has(key)) continue;

    visited.add(key);
    size++;

    queue.push({ x: pos.x + 1, y: pos.y });
    queue.push({ x: pos.x - 1, y: pos.y });
    queue.push({ x: pos.x, y: pos.y + 1 });
    queue.push({ x: pos.x, y: pos.y - 1 });
  }

  return size;
}

function countFreeNeighbors(pos: Position, state: GameState, blocked: Set<string>): number {
  const neighbors: Position[] = [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];

  let count = 0;
  for (const neighbor of neighbors) {
    if (!isInBounds(neighbor, state)) continue;
    if (blocked.has(cellKey(neighbor))) continue;
    count++;
  }
  return count;
}

function getFoodAt(pos: Position, foods: Food[]): Food | null {
  for (const food of foods) {
    if (food.pos.x === pos.x && food.pos.y === pos.y) return food;
  }
  return null;
}

function getNearestFoodDistance(origin: Position, foods: Food[]): number {
  if (foods.length === 0) return Number.POSITIVE_INFINITY;
  let nearest = Number.POSITIVE_INFINITY;
  for (const food of foods) {
    const distance = Math.max(Math.abs(food.pos.x - origin.x), Math.abs(food.pos.y - origin.y));
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

function getNearestFoodReward(origin: Position, foods: Food[], settings: GameSettings): number {
  let bestReward = 1;
  let nearest = Number.POSITIVE_INFINITY;
  for (const food of foods) {
    const distance = Math.max(Math.abs(food.pos.x - origin.x), Math.abs(food.pos.y - origin.y));
    if (distance < nearest) {
      nearest = distance;
      bestReward = getFoodReward(food, settings).points;
    }
  }
  return bestReward;
}

function cellKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

function resolveProfileByDifficulty(difficulty: number, settings: GameSettings): SkillProfile {
  if (difficulty <= 3) return getSkillProfileById(settings, 'rookie');
  if (difficulty <= 6) return getSkillProfileById(settings, 'basic');
  if (difficulty <= 8) return getSkillProfileById(settings, 'solid');
  return getSkillProfileById(settings, 'wise');
}

function pickMistakeDirection(
  ranked: DirectionEvaluation[],
  state: GameState,
  snake: Snake,
  profile: SkillProfile
): DirectionEvaluation | null {
  if (profile.mistakePeriod <= 0 || ranked.length < 2) return null;
  const shouldMakeMistake = (state.tickCount + snake.id * 3) % profile.mistakePeriod === 0;
  if (!shouldMakeMistake) return null;

  const safeDescending = [...ranked].sort((left, right) => right.score - left.score);
  const nonFatal = safeDescending.filter(candidate => candidate.score > Number.NEGATIVE_INFINITY / 2);
  if (nonFatal.length < 2) return null;

  // Mistake model: pick a direction from the lower half, causing misses or wider turns.
  const mistakeIndex = Math.min(nonFatal.length - 1, Math.floor((nonFatal.length - 1) * profile.badMoveBias / 2));
  return nonFatal[mistakeIndex];
}

function getNearestOtherSnakeDistance(origin: Position, state: GameState, currentSnakeId: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const snake of state.snakes) {
    if (!snake.alive || snake.id === currentSnakeId) continue;
    for (const segment of snake.segments) {
      const distance = Math.max(Math.abs(segment.x - origin.x), Math.abs(segment.y - origin.y));
      if (distance < nearest) nearest = distance;
    }
  }
  return nearest;
}

export function rankDirectionsForDebug(
  state: GameState,
  snake: Snake,
  settings: GameSettings,
  profile: SkillProfile = getSkillProfileById(settings, 'wise')
): DirectionEvaluation[] {
  const candidates = getCandidateDirections(snake.direction);
  return candidates
    .map(direction => ({ direction, score: evaluateDirection(state, snake, settings, direction, profile) }))
    .sort((left, right) => right.score - left.score);
}

export function getSkillProfileById(settings: GameSettings, profileId: BotProfileId): SkillProfile {
  const source = settings.botProfiles[profileId];
  return {
    id: profileId,
    trapPenalty: source.trapPenalty,
    areaWeight: source.areaWeight,
    escapeWeight: source.escapeWeight,
    foodWeight: source.foodWeight,
    immediateEatWeight: source.immediateEatWeight,
    fearWeight: source.fearWeight,
    longSnakeThreshold: source.longSnakeThreshold,
    longSnakeFoodPenalty: source.longSnakeFoodPenalty,
    mistakePeriod: source.mistakePeriod,
    badMoveBias: source.badMoveBias,
  };
}

// Backward-compat alias kept for existing tests and imports.
export const greedyBoardHeuristic = wiseHeuristic;
export const chooseGreedyBoardDirection = chooseWiseDirection;

