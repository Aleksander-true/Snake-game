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
- Bots can make seeded input mistakes after calculating an optimal move. The error chance decreases from about 14.3% for `rookie` to 1% for `wise`; an error either selects a random different direction (including a forbidden reversal) or delays the correct command by exactly one tick.

## Food

The base mode uses apples with three lifecycle phases:

| Phase | Age | Score | Growth |
|---|---:|---:|---:|
| Young | 0–49 | 1 | 1 |
| Adult | 50–99 | 2 | 2 |
| Old | 100–149 | 1 | 1 |

The standard food lifecycle ends at age 150. An adult chicken becomes meat at that boundary instead of disappearing, while meat has its own age limit of 50. `RabbitFood` remains an extension type, but is not the default gameplay food.

Level 1 contains only apples. Starting at level 2, each regular initial or automatic food spawn has a seeded 30% chance to be chicken food. Newly spawned chicken food always starts as an egg at age 0. Its common lifecycle is rendered as egg (age 0–49, value 1), chick (50–99, value 2), and chicken (100–149, value 3).

Eggs do not move. A chick makes one random neighboring step every three ticks and stays within five Chebyshev cells of its egg origin. An adult chicken is not range-limited and can move every two ticks. It approaches the nearest apple while trying to remain at least 10 cells from living snakes, actively flees when a head is within 5 cells, and chooses the lowest snake density when no apples exist.

An adult chicken lays at most three eggs without food-density restrictions. Eating an apple removes that apple, resets the chicken to age 100 and reproduction count 0, and guarantees an egg-laying attempt on the next tick; that egg is the first in a new three-egg limit.

Meat is a stationary 🍖 food worth 1 point and 1 growth segment. It exists only at age 0–49 and is never part of regular spawning. A chicken reaching age 150 becomes one meat item. A snake killed by a wall, another snake, or self-collision produces `ceil(length / 3)` meat items along its body; a snake that starves produces none. Meat is rendered over the non-colliding gray corpse and can be eaten normally.

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
