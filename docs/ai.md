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
| 2 cells | -95 |
| 3 cells | -90 |
| d cells | `min(obstacleSignalClose + obstacleSignalDecay * (d - 1), -5)` |
| Minimum magnitude | -5 |

- Signals from multiple obstacles **sum** at each cell
- The observing snake's own body keeps the regular 1x signal
- Another living snake's body has a **2x danger multiplier**: -200 at distance 1, decaying to a minimum of -10
- A hedgehog cell has a **3x danger multiplier**: -300 at distance 1, decaying to a minimum of -15

#### Food — Positive values
| Distance | Signal |
|----------|--------|
| 1 cell | +100 |
| 2 cells | +95 |
| 3 cells | +90 |
| d cells | `max(foodSignalClose - foodSignalDecay * (d - 1), foodSignalMin)` |
| Very far (any distance) | minimum **+5** |

The distance signal is multiplied by the food's current score value. Food worth
1 point has 100% intensity, food worth 2 points has 200%, and food worth 3
points has 300%. Projected off-screen food keeps the same value multiplier.

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
| `obstacleSignalDecay` | 5 | Obstacle signal decay per cell (5% of the close signal) |
| `foodSignalClose` | +100 | Food signal at distance 1 |
| `foodSignalDecay` | 5 | Food signal decay per cell (5% of the close signal) |
| `foodSignalMin` | +5 | Minimum food signal |
| `botProfiles.*` | See `packages/core/src/gameDefaults.json` | Full-board heuristic weights by skill tier |

## Training lab (dev build)

In **`npm run dev:debug`** (or any build with `__DEV_MODE__`), the main menu has a **«Лаборатория обучения»** button that opens the lab screen directly (defaults from `getDefaultTrainingLaunchConfig()` in `MenuScreenService.ts`).

- A coordinator Web Worker owns the genetic session and dispatches deterministic Arena evaluations to a persistent worker pool. Automatic selection leaves two reported CPU cores free; manual selection is also available.
- `GeneticTrainingSession` in the shared core defines generation boundaries, canonical evaluation tasks, RNG state, checkpoints, and model fine-tuning. The browser worker only schedules those tasks.
- Pausing completes the current generation and stores a full checkpoint in IndexedDB. Checkpoint frequency is configurable; resumptions may use a different worker count without changing the genetic result.
- The best validation champion is saved under a stable run id after each checkpoint. Completed and imported models use `LocalModelRepository` (`snake.geneticModels.v1`) and can seed a new compatible fine-tuning run.
- Visual mode independently replays the newest generation champion on Canvas. Background mode disables replay, requests a Screen Wake Lock, and places the chart and report table in the Canvas area.
- Fitness weights, per-scenario game counts, network topology, Arena rules, validation cadence, worker count, and checkpoint cadence are configured in the lab. Four built-in staged presets cover initial feeding and fine-tuning against food, heuristic bots, or current-generation networks. Custom presets are stored in `localStorage` under `snake.trainingPresets.v1`. The default dense food-approach reward only counts new distance progress toward a tracked target, so oscillation cannot farm fitness. All controls expose Russian help text.
- Reaching the Arena tick limit alive is treated as successful survival: the policy receives the full survival and alive-at-end rewards without an anti-cycle penalty.
- Every generation derives a new deterministic training-seed batch from the configured base seeds. All candidates in that generation share the batch. Validation keeps separate fixed seeds, evaluates the current generation best, and selects the model artifact without changing reproduction selection.
- Seeded Arena and genetic RNG remain independent. Evaluation results are applied in task order rather than worker completion order, so parallel scheduling does not change the result.

## Future Improvements

- Train the current neural policy via imitation and later reinforcement learning.
- Multi-step lookahead (minimax or MCTS)
- Opponent modeling (predict other snakes' moves)
- Pathfinding integration (A* to nearest food)
