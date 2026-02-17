import { Position } from '../types';
import { EngineContext } from '../context';
import { RandomPort } from '../ports';

/**
 * Generate wall clusters via random walk with branching.
 * Validates that all free cells remain reachable (BFS).
 *
 * @param exclusionZones — positions (snake heads / body) that walls must stay away from.
 *   Walls cannot be placed within `1.5 × initialSnakeLength` cells (Chebyshev) of any zone centre.
 */
export function generateWalls(
  width: number,
  height: number,
  clusterCount: number,
  wallLength: number,
  exclusionZones: Position[] = [],
  ctx: EngineContext,
  maxAttempts: number = 50
): Position[] {
  const safeRadius = Math.ceil(1.5 * ctx.settings.initialSnakeLength);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const walls = generateWallClusters(width, height, clusterCount, wallLength, exclusionZones, safeRadius, ctx.rng);
    if (validateWalls(walls, width, height)) {
      return walls;
    }
  }
  // Fallback: return empty walls if we can't generate valid ones
  return [];
}

/** Check whether a position is inside any exclusion zone (Chebyshev distance). */
function insideExclusionZone(pos: Position, zones: Position[], radius: number): boolean {
  for (const zoneCenter of zones) {
    if (Math.max(Math.abs(pos.x - zoneCenter.x), Math.abs(pos.y - zoneCenter.y)) <= radius) {
      return true;
    }
  }
  return false;
}

function generateWallClusters(
  width: number,
  height: number,
  clusterCount: number,
  wallLength: number,
  exclusionZones: Position[],
  safeRadius: number,
  randomPort: RandomPort,
): Position[] {
  const walls: Position[] = [];
  const wallSet = new Set<string>();

  const addWall = (position: Position): boolean => {
    const positionKey = `${position.x},${position.y}`;
    if (wallSet.has(positionKey)) return false;
    if (position.x <= 0 || position.x >= width - 1 || position.y <= 0 || position.y >= height - 1) return false;
    if (insideExclusionZone(position, exclusionZones, safeRadius)) return false;
    walls.push(position);
    wallSet.add(positionKey);
    return true;
  };

  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
    // Random starting position (not on edges)
    const startX = 2 + randomPort.nextInt(width - 4);
    const startY = 2 + randomPort.nextInt(height - 4);
    let current: Position = { x: startX, y: startY };

    // If start falls in exclusion zone, skip this cluster
    if (!addWall(current)) continue;

    for (let wallSegmentIndex = 1; wallSegmentIndex < wallLength; wallSegmentIndex++) {
      const dirs: Position[] = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      // Filter valid directions (inside board AND outside exclusion zones)
      const validDirections = dirs.filter(directionCandidate =>
        directionCandidate.x > 0 && directionCandidate.x < width - 1 && directionCandidate.y > 0 && directionCandidate.y < height - 1
        && !insideExclusionZone(directionCandidate, exclusionZones, safeRadius)
      );

      if (validDirections.length === 0) break;

      // Random walk with occasional branching
      const nextPosition = validDirections[randomPort.nextInt(validDirections.length)];
      addWall(nextPosition);

      // Branch with 30% probability
      if (randomPort.next() < 0.3 && wallSegmentIndex < wallLength - 1) {
        const branchPosition = validDirections[randomPort.nextInt(validDirections.length)];
        addWall(branchPosition);
      }

      current = nextPosition;
    }
  }

  return walls;
}

/**
 * Validate walls using BFS — all free cells must be reachable from any free cell.
 */
export function validateWalls(walls: Position[], width: number, height: number): boolean {
  const wallSet = new Set<string>(walls.map(wall => `${wall.x},${wall.y}`));

  // Find first free cell
  let start: Position | null = null;
  for (let rowIndex = 0; rowIndex < height && !start; rowIndex++) {
    for (let colIndex = 0; colIndex < width && !start; colIndex++) {
      if (!wallSet.has(`${colIndex},${rowIndex}`)) {
        start = { x: colIndex, y: rowIndex };
      }
    }
  }

  if (!start) return false;

  // BFS
  const visited = new Set<string>();
  const queue: Position[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (neighbor.x >= 0 && neighbor.x < width && neighbor.y >= 0 && neighbor.y < height &&
          !wallSet.has(neighborKey) && !visited.has(neighborKey)) {
        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }
  }

  // Count total free cells
  const totalFree = width * height - walls.length;
  return visited.size === totalFree;
}
