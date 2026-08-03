# AI System Documentation

## Overview

The production bot uses a full-board greedy heuristic with flood-fill safety checks. The rotated vision matrix remains a supported observation format and is used by neural-policy experiments in the training lab.

## Bot Interfaces

Production and Arena algorithms use the same world-space interface:

```typescript
interface HeuristicAlgorithm {
  id: string;
  name: string;
  chooseDirection(state, snake, settings, rng?): Direction;
}
```

The observation-based neural policies use a relative decision as an intermediate representation:

```typescript
type BotDecision = "left" | "right" | "front";

interface BotInput {
  vision: number[][];     // 20×20 grid, rotated to snake's heading
  snakeLength: number;
  ticksWithoutFood: number;
}
```

`getBotDirection` converts this relative neural action to a world-space `Direction`. Arena injects its seeded RNG into algorithms that need randomness.

## Vision System

### Grid Size
- Default: **20×20** cells centered on the snake's head
- The vision grid is **rotated** so that the snake's current direction always points "up" (toward row 0)

### Signal Values

#### Obstacles (walls, snake bodies) — Negative values
| Distance | Signal |
|----------|--------|
| 1 cell | -100 |
| 2 cells | -80 |
| 3 cells | -60 |
| ... | Decaying |
| Beyond vision (dist d) | `-max(500/d, 5)` |

- Signals from multiple obstacles **sum** at each cell

#### Food — Positive values
| Distance | Signal |
|----------|--------|
| 1 cell | +100 |
| 2 cells | +80 |
| 3 cells | +60 |
| ... | Decaying |
| Very far (any distance) | minimum **+5** |

### Vision Rotation

The vision matrix is always oriented relative to the snake's heading direction:
- **UP heading**: no rotation needed
- **RIGHT heading**: rotate 90° counter-clockwise
- **DOWN heading**: rotate 180°
- **LEFT heading**: rotate 90° clockwise

This is implemented via a `rotateMatrix` utility so the bot always "sees" forward as up.

## Production Full-Board Heuristic

### Step 1: Evaluate 3 Possible Moves
For each of `["left", "front", "right"]`:

1. **Death check**: Is the target cell a wall, snake body, or out of bounds?
   - If yes → score = `-Infinity` (forbidden move)

2. **Flood-fill (anti-deadend)**:
   - From the target cell, count reachable empty cells
   - If reachable area < snake length → heavy penalty (potential trap)
   - Score contribution: `floodFillSize * weight`

3. **Food attraction**:
   - Find the nearest food from the candidate head position
   - Include food phase value and an immediate-eating bonus
   - Reduce food interest for long snakes according to the active skill profile

4. **Snake avoidance**:
   - Reject immediate wall/body collisions
   - Penalize proximity to other living snakes
   - Penalize cells that another snake can also enter on its next move, reducing head-on collisions

5. **Difficulty profile**:
   - Difficulty 1–3 uses `rookie`, 4–6 `basic`, 7–8 `solid`, and 9–10 `wise`
   - Profiles configure trap, area, escape, food, fear, long-snake, and intentional-mistake weights

### Intentional Input Errors

After calculating the optimal action, a production bot performs a seeded error roll on every decision. The probability is `1 / mistakePeriod`: `rookie = 1/7`, `basic = 1/11`, `solid = 1/19`, and `wise = 1/100`.

On an error, the bot equally chooses one of two outcomes. It either replaces the calculated absolute direction with a random one of the other three directions (including an unsafe or forbidden reversal), or delays the correct command by exactly one tick. A delayed command is applied on the next tick without calculating another decision or rolling another error, and is cleared after application or death. Erroneous actions are not filtered for safety and may cause a collision. Fast-forward and server matches keep the same RNG stream. Training runs must explicitly record whether errors are enabled so pure algorithm quality and robustness can be evaluated separately.

The current heuristic only has a partial deterministic mistake mechanism. It must be replaced with the seeded probabilistic behavior described above.

### Step 2: Select Best Move
- Choose the move with the highest combined score
- Tie-breaking: prefer `"front"` > `"left"` > `"right"`

### Step 3: Fallback
- If every candidate is lethal, retain the current direction; the engine resolves the resulting collision.

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `visionSize` | 20 | Vision grid width/height |
| `obstacleSignalClose` | -100 | Obstacle signal at distance 1 |
| `obstacleSignalDecay` | 20 | Obstacle signal decay per cell |
| `foodSignalClose` | +100 | Food signal at distance 1 |
| `foodSignalDecay` | 20 | Food signal decay per cell |
| `foodSignalMin` | +5 | Minimum food signal |
| `botProfiles.*` | See `packages/core/src/gameDefaults.json` | Full-board heuristic weights by skill tier |

## Training lab (dev build)

In **`npm run dev:debug`** (or any build with `__DEV_MODE__`), the main menu has a **«Лаборатория обучения»** button that opens the lab screen directly (defaults from `getDefaultTrainingLaunchConfig()` in `MenuScreenService.ts`).

- The lab runs **headless** simulations: no live game loop on the canvas; results are shown as text (ticks, score, death reason). Parameters are edited on the lab screen, not in the menu.
- The policy selector offers the deterministic `random-turns` baseline and `neural-simple-v1`, a small neural network with deterministic random weights. The neural policy is intentionally untrained at this stage.
- Both policies implement `ArenaAlgorithm` and use `runArenaSimulation` from `packages/core/src/arena/runBatch.ts`; the UI does not depend on their internal implementation.
- Arena injects a seeded RNG into participant algorithms. Random decisions and neural-network initialization must use that RNG, so the same configuration and seed produce the same metrics.
- UI copy and layout live in `SnakeGameApplication.mountTrainingLabPanel` (Russian strings).

## Future Improvements

- Train the current neural policy via imitation and later reinforcement learning.
- Multi-step lookahead (minimax or MCTS)
- Opponent modeling (predict other snakes' moves)
- Pathfinding integration (A* to nearest food)
