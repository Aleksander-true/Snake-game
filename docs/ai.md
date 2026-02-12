# AI System Documentation

## Overview

The AI module provides autonomous snake control through a vision-based heuristic system. Each bot receives a rotated view of the world relative to its head direction and returns a simple turn command.

## Bot Interface

```typescript
type BotDecision = "left" | "right" | "front";

interface BotInput {
  vision: number[][];     // 20×20 grid, rotated to snake's heading
  snakeLength: number;
  ticksWithoutFood: number;
}

function botDecide(input: BotInput): BotDecision;
```

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

#### Rabbits — Positive values
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

## Heuristic Algorithm

### Step 1: Evaluate 3 Possible Moves
For each of `["left", "front", "right"]`:

1. **Death check**: Is the target cell a wall, snake body, or out of bounds?
   - If yes → score = `-Infinity` (forbidden move)

2. **Flood-fill (anti-deadend)**:
   - From the target cell, count reachable empty cells
   - If reachable area < snake length → heavy penalty (potential trap)
   - Score contribution: `floodFillSize * weight`

3. **Rabbit attraction**:
   - Sum positive vision signals in the forward cone of the move direction
   - Closer rabbits weighted more heavily
   - Score contribution: `rabbitSignalSum * weight`

4. **Wall/body repulsion**:
   - Sum negative vision signals near the move direction
   - Score contribution: `obstacleSignalSum * weight`

5. **Length-based aggression**:
   - Shorter snakes → higher weight on rabbit attraction (more aggressive)
   - Longer snakes → higher weight on safety/flood-fill

### Step 2: Select Best Move
- Choose the move with the highest combined score
- Tie-breaking: prefer `"front"` > `"left"` > `"right"`

### Step 3: Fallback
- If all moves are lethal, pick the one with the best flood-fill (survive longest)

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `VISION_SIZE` | 20 | Vision grid width/height |
| `OBSTACLE_DECAY_BASE` | -100 | Signal at distance 1 |
| `OBSTACLE_DECAY_RATE` | 20 | Reduction per cell distance |
| `RABBIT_DECAY_BASE` | +100 | Signal at distance 1 |
| `RABBIT_DECAY_RATE` | 20 | Reduction per cell distance |
| `RABBIT_MIN_SIGNAL` | +5 | Minimum rabbit signal at any distance |
| `FLOOD_FILL_WEIGHT` | 1.0 | Weight for accessible area score |
| `RABBIT_WEIGHT` | 2.0 | Weight for rabbit attraction |
| `OBSTACLE_WEIGHT` | 1.5 | Weight for obstacle avoidance |
| `AGGRESSION_LENGTH_THRESHOLD` | 8 | Below this length, increase rabbit weight |

## Future Improvements

- Neural network–based decision making (trained via self-play)
- Multi-step lookahead (minimax or MCTS)
- Opponent modeling (predict other snakes' moves)
- Pathfinding integration (A* to nearest rabbit)
