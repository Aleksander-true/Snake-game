import { Position, GameState } from '../types';
import { inBounds, createEmptyBoard } from '../board';

/**
 * Generate wall clusters via random walk with branching.
 * Validates that all free cells remain reachable (BFS).
 */
export function generateWalls(
  width: number,
  height: number,
  clusterCount: number,
  wallLength: number,
  maxAttempts: number = 50
): Position[] {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const walls = generateWallClusters(width, height, clusterCount, wallLength);
    if (validateWalls(walls, width, height)) {
      return walls;
    }
  }
  // Fallback: return empty walls if we can't generate valid ones
  return [];
}

function generateWallClusters(
  width: number,
  height: number,
  clusterCount: number,
  wallLength: number
): Position[] {
  const walls: Position[] = [];
  const wallSet = new Set<string>();

  const addWall = (pos: Position) => {
    const key = `${pos.x},${pos.y}`;
    if (!wallSet.has(key) && pos.x > 0 && pos.x < width - 1 && pos.y > 0 && pos.y < height - 1) {
      walls.push(pos);
      wallSet.add(key);
    }
  };

  for (let c = 0; c < clusterCount; c++) {
    // Random starting position (not on edges)
    const startX = 2 + Math.floor(Math.random() * (width - 4));
    const startY = 2 + Math.floor(Math.random() * (height - 4));
    let current: Position = { x: startX, y: startY };
    addWall(current);

    for (let i = 1; i < wallLength; i++) {
      const dirs: Position[] = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      // Filter valid directions
      const validDirs = dirs.filter(d =>
        d.x > 0 && d.x < width - 1 && d.y > 0 && d.y < height - 1
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
