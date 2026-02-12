# Game Rules

## Overview

"Snake Eats Rabbits" is a snake game where snakes hunt rabbits that can breed and multiply on the field. Supports 0–2 human players and 0–4 AI bots simultaneously.

## Board

- **Cell types** (engine representation):
  - `" "` — empty
  - `"&"` — rabbit
  - `"*"` — wall/obstacle
  - `"#"` — snake segment
- **Base size**: 40×40
- **Each new level**: +5 to width and height (level 2 = 45×45, level 3 = 50×50, etc.)

## Visual Style

| Element | Color |
|---------|-------|
| Background | Black |
| Grid | White |
| Snake | Green |
| Rabbits | Red |
| Walls | White |

## Snake Rules

### Movement
- Snakes move one cell per tick
- **180° reversal is forbidden** — a snake cannot turn back on itself
- Each player controls direction via keyboard; bots decide via AI

### Death Conditions
- Collision with a wall/obstacle
- Collision with another snake's body
- Collision with own body (self-collision)
- Starvation (length drops below 2 due to hunger)

### Initial State
- Snake spawns with **length 5**

## Hunger System

- If a snake hasn't eaten a rabbit in **15 ticks**, it loses **1 segment**
- The hunger counter resets each time the snake eats
- If snake length drops **below 2** → death ("Starved to death")

## Rabbits

### Initial Spawn
- At level start, rabbits spawn in random empty cells (not on walls, not on snakes)
- Count: `Math.floor((snakeCount * 1.5) + (10 - difficultyLevel))`

### Reproduction
Each rabbit tracks:
- `clockNum` — ticks since spawn or last reproduction
- `reproductionCount` — times this rabbit has reproduced (max 5)

**Reproduction window**: ticks 5–15 (inclusive)

**Probability per tick**: `0.05 * clockNum` (modified by neighbors)

**Neighbor penalty**:
- For each rabbit within Chebyshev distance ≤ 2: probability reduced by 25%
- If 4+ rabbits nearby: probability = 0

**Offspring placement**:
- New rabbit spawns 1–2 cells away from parent in a random direction
- Cannot spawn on walls, snakes, or within Chebyshev distance 1 of another rabbit

**After reproduction**: `clockNum` resets to 0

**Limit**: max 5 reproductions per rabbit lifetime

## Scoring
- **+1 point** per rabbit eaten, tracked per snake

## Level Progression

### Single Player
- **Target score**: `Math.floor(level * 1.2 + 10)` rabbits to complete the level

### Multiplayer (>1 snake)
- Level ends when:
  - Only 1 snake remains alive, **OR**
  - Level timer expires (3 minutes)
- **Level winner**: the surviving snake. If both alive after 3 min → draw (no winner).
- Track "levels won" per snake across the game.
- **Overall winner**: most levels won. Tiebreak: most rabbits eaten (total score). If still tied → draw.

## Walls / Obstacles

### Generation
- Short branching continuous wall segments via random walk
- **Cluster count**: `Math.floor(level * 1.2 + 2)`
- **Wall segment length**: `Math.floor(difficultyLevel * 1.2 + 3)`
- Walls are generated **before** rabbits
- Rabbits never spawn on walls

### Constraints
- Walls must **not** form enclosed areas
- All free cells must remain reachable (verified by BFS)
- At least **2 passages** (no single-cell bottlenecks that would trap snakes)
- If generation fails validation → regenerate

## Difficulty Level

- Range: 1–10 (configurable in menu)
- Affects: rabbit count, wall length, and AI behavior

## Game Modes

| Players | Bots | Description |
|---------|------|-------------|
| 0 | 1–4 | Spectator mode — watch bots play |
| 1 | 0 | Classic single-player |
| 1 | 1–3 | Player vs bots |
| 2 | 0–2 | Local multiplayer |
| 2 | 1–2 | 2 players + bots |
| * | * | Total snakes = players + bots (max practical: ~4–6) |

## Results

- After game ends, results are saved to `localStorage`
- Results screen shows:
  - Per-snake: name, score, levels won, cause of death
  - Historical high scores table from localStorage
