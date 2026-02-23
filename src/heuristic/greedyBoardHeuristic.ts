import { GameSettings } from '../engine/settings';
import { Direction, Food, GameState, Position, Snake } from '../engine/types';
import { getNextHeadPosition } from '../engine/systems/movementSystem';
import { getFoodReward } from '../engine/systems/foodSystem';
import { isReverseDirection } from '../engine/collision';
import { HeuristicAlgorithm } from './types';

interface DirectionEvaluation {
  direction: Direction;
  score: number;
}

export const greedyBoardHeuristic: HeuristicAlgorithm = {
  id: 'greedy-board-v1',
  chooseDirection: (state, snake, settings) => chooseGreedyBoardDirection(state, snake, settings),
};

export function chooseGreedyBoardDirection(
  state: GameState,
  snake: Snake,
  settings: GameSettings
): Direction {
  const candidates = getCandidateDirections(snake.direction);
  const ranked = candidates.map(direction => ({
    direction,
    score: evaluateDirection(state, snake, settings, direction),
  }));
  ranked.sort((left, right) => right.score - left.score);
  const best = ranked[0];
  return best ? best.direction : snake.direction;
}

function getCandidateDirections(current: Direction): Direction[] {
  const all: Direction[] = ['up', 'right', 'down', 'left'];
  return all.filter(candidate => !isReverseDirection(current, candidate));
}

function evaluateDirection(
  state: GameState,
  snake: Snake,
  settings: GameSettings,
  direction: Direction
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
  const trapPenalty = reachableArea < minSafeArea ? (minSafeArea - reachableArea) * 150 : 0;

  const nearestFoodDistance = getNearestFoodDistance(nextHead, state.foods);
  const nearestFoodReward = getNearestFoodReward(nextHead, state.foods, settings);
  const foodScore = nearestFoodDistance === Number.POSITIVE_INFINITY
    ? 0
    : (nearestFoodReward * 220) / (nearestFoodDistance + 1);

  const areaScore = reachableArea * 2.5;
  const escapeScore = localEscapeRoutes * 25;
  const immediateEatBonus = food ? getFoodReward(food, settings).points * 200 : 0;

  return areaScore + escapeScore + foodScore + immediateEatBonus - trapPenalty;
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

export function rankDirectionsForDebug(
  state: GameState,
  snake: Snake,
  settings: GameSettings
): DirectionEvaluation[] {
  const candidates = getCandidateDirections(snake.direction);
  return candidates
    .map(direction => ({ direction, score: evaluateDirection(state, snake, settings, direction) }))
    .sort((left, right) => right.score - left.score);
}

