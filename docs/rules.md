# Game Rules

## Overview

"Hungry Snakes" is a browser Snake game for 0–2 human players and 0–4 bots, with 1–6 snakes in a match. The canonical detailed specification is `docs/spec.md`; runtime defaults come from `packages/core/src/gameDefaults.json`.

## Board

- The base board is 40×40 cells.
- Each level adds 2 cells to width and height.
- Boundaries and generated walls are lethal.
- Walls are generated before food and validated with BFS so all free cells remain connected.
- Derived `board[][]` markers are: space for empty cells, `&xN` for food value, `*` for walls, and `1`–`6` for snake ids.

## Snakes

- Initial length: 5 cells.
- Snakes move one cell per tick.
- A 180-degree reversal is forbidden.
- Commands received between ticks are buffered; the last non-reversing command is applied.
- All snake moves are resolved simultaneously. A head-on collision kills every participating snake, while entering a tail cell vacated during the same tick is allowed.
- A snake dies after hitting a boundary, wall, its own body, another snake, or starving below length 2.
- Every 15 ticks without food removes one tail segment. Eating resets hunger.

## Food

The base mode uses apples with three lifecycle phases:

| Phase | Age | Score | Growth |
|---|---:|---:|---:|
| Young | 0–49 | 1 | 1 |
| Adult | 50–99 | 2 | 2 |
| Old | 100–149 | 1 | 1 |

Food is removed at age 150. `RabbitFood` remains an extension type, but is not the default gameplay food.

Initial food count is:

```text
Math.floor(1.5 × snakeCount + 5 − difficultyLevel)
```

One adult food item is created per snake; remaining initial food is young. Food cannot overlap walls or snakes and must be more than one Chebyshev cell from other food.

Adult food may reproduce after a five-tick cooldown. The base probability is `0.01 × clockNum`, reduced by 25% for each neighbor within radius 4 and blocked at four neighbors. Each item can reproduce at most five times.

If food count drops below the number of living snakes, the engine can add one adult item at the maximin-farthest free position, no more than once per hunger interval.

## Levels and Victory

- Classic single-player: 10 levels.
- Survival single-player: 100 levels with automatic, pause-free transitions.
- Multiplayer and mixed matches: 10 levels.
- Each new level rebuilds the board, walls, food, and snake starting positions while preserving cumulative score and level wins.
- Single-player target: `Math.floor(5 × level + 20)`, accumulated across levels.
- Multiplayer level ends when at most one snake remains or the 180-second timer expires.
- At the end of a round, every surviving snake receives a one-time score bonus equal to its current length. Dead snakes receive no survival bonus; all survivors receive it when the timer ends with several snakes alive.
- Overall winner: most level wins, then highest score; an exact tie is a draw.

## Controls

- One player: WASD and arrow keys both control player 1.
- Two players: player 1 uses WASD; player 2 uses arrow keys.
- Space pauses/resumes or continues the current modal action.
- Escape opens exit confirmation while playing, exits from pause/results, or cancels confirmation.
- Enter confirms exit.
- Touch controls are available on coarse-pointer devices.

## Results

Results and player names are stored in `localStorage`. A completed session is persisted once. The results screen shows current snake statistics and the top historical scores; user-controlled text is HTML-escaped before rendering.
