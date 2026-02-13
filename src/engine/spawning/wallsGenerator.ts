import { Position, GameState } from '../types';
import { inBounds, createEmptyBoard } from '../board';
import { gameSettings } from '../settings';

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
  maxAttempts: number = 50
): Position[] {
  const safeRadius = Math.ceil(1.5 * gameSettings.initialSnakeLength);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const walls = generateWallClusters(width, height, clusterCount, wallLength, exclusionZones, safeRadius);
    if (validateWalls(walls, width, height)) {
      return walls;
    }
  }
  // Fallback: return empty walls if we can't generate valid ones
  return [];
}

/** Check whether a position is inside any exclusion zone (Chebyshev distance). */
function insideExclusionZone(pos: Position, zones: Position[], radius: number): boolean {
  for (const z of zones) {
    if (Math.max(Math.abs(pos.x - z.x), Math.abs(pos.y - z.y)) <= radius) {
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
): Position[] {
  const walls: Position[] = [];
  const wallSet = new Set<string>();

  const addWall = (pos: Position): boolean => {
    const key = `${pos.x},${pos.y}`;
    if (wallSet.has(key)) return false;
    if (pos.x <= 0 || pos.x >= width - 1 || pos.y <= 0 || pos.y >= height - 1) return false;
    if (insideExclusionZone(pos, exclusionZones, safeRadius)) return false;
    walls.push(pos);
    wallSet.add(key);
    return true;
  };

  for (let c = 0; c < clusterCount; c++) {
    // Random starting position (not on edges)
    const startX = 2 + Math.floor(Math.random() * (width - 4));
    const startY = 2 + Math.floor(Math.random() * (height - 4));
    let current: Position = { x: startX, y: startY };

    // If start falls in exclusion zone, skip this cluster
    if (!addWall(current)) continue;

    for (let i = 1; i < wallLength; i++) {
      const dirs: Position[] = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      // Filter valid directions (inside board AND outside exclusion zones)
      const validDirs = dirs.filter(d =>
        d.x > 0 && d.x < width - 1 && d.y > 0 && d.y < height - 1
        && !insideExclusionZone(d, exclusionZones, safeRadius)
      );

      if (validDirs.length === 0) break;

      // Random walk with occasional branching
      const next = validDirs[Math.floor(Math.random() * validDirs.length)];
      addWall(next);

      // Branch with 30% probability
      if (Math.random() < 0.3 && i < wallLength - 1) {
        const branchDir = validDirs[Math.floor(Math.random() * validDirs.length)];
        addWall(branchDir);
      }

      current = next;
    }
  }

  return walls;
}

/**
 * Validate walls using BFS — all free cells must be reachable from any free cell.
 */
export function validateWalls(walls: Position[], width: number, height: number): boolean {
  const wallSet = new Set<string>(walls.map(w => `${w.x},${w.y}`));

  // Find first free cell
  let start: Position | null = null;
  for (let y = 0; y < height && !start; y++) {
    for (let x = 0; x < width && !start; x++) {
      if (!wallSet.has(`${x},${y}`)) {
        start = { x, y };
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

    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height &&
          !wallSet.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  // Count total free cells
  const totalFree = width * height - walls.length;
  return visited.size === totalFree;
}
