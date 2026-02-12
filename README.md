# 🐍 Snake Eats Rabbits

A modern Snake game built with TypeScript and HTML5 Canvas where snakes hunt rabbits that breed and multiply.

## Features

- **Classic snake gameplay** with additional rabbit breeding mechanics
- **Multiplayer**: 0–3 human players + 0–4 AI bots
- **Progressive difficulty**: growing field size, more walls, smarter rabbits
- **AI bots** with configurable vision and heuristic decision-making
- **Score tracking** with localStorage persistence

## Tech Stack

- **Language**: TypeScript
- **Rendering**: HTML5 Canvas
- **Build**: Webpack (dev server + production)
- **Tests**: Jest

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Production build
npm run build
```

## Project Structure

```
src/
├── index.ts                    # Entry point
├── app/
│   ├── router.ts               # Screen navigation
│   └── ui/
│       ├── menuView.ts         # Main menu screen
│       ├── hudView.ts          # In-game HUD
│       ├── resultView.ts       # Results screen
│       └── styles.css          # Global styles
├── engine/
│   ├── types.ts                # Core type definitions
│   ├── constants.ts            # Game constants
│   ├── game.ts                 # Main game loop controller
│   ├── board.ts                # Board state management
│   ├── collision.ts            # Collision detection
│   ├── spawning/
│   │   ├── wallsGenerator.ts   # Wall generation (random walk + BFS)
│   │   └── rabbitsSpawner.ts   # Rabbit placement
│   └── systems/
│       ├── movementSystem.ts   # Snake movement
│       ├── hungerSystem.ts     # Hunger/shrinking logic
│       ├── rabbitsReproductionSystem.ts  # Rabbit breeding
│       ├── scoringSystem.ts    # Score tracking
│       └── levelSystem.ts      # Level progression
├── ai/
│   ├── vision.ts               # Vision matrix generation
│   └── botController.ts        # Bot decision-making
├── renderer/
│   └── canvasRenderer.ts       # Canvas rendering
└── storage/
    └── scoreStorage.ts         # localStorage persistence

tests/                          # Jest test files
docs/
├── rules.md                    # Game rules documentation
└── ai.md                       # AI system documentation
```

## Controls

| Player | Keys |
|--------|------|
| Player 1 | W A S D |
| Player 2 | Arrow keys |
| Player 3 | I J K L |

## Architecture

The project follows a clean separation between **engine** (game logic, pure calculations) and **renderer** (canvas drawing). The engine maintains entities (snakes, rabbits, walls) separately and assembles the `board[][]` grid from them each tick for collision checks and rendering.

### Game Loop (tick-based)

1. Gather input (players + bots)
2. Apply turns (block 180° reversal)
3. Move snakes & detect collisions
4. Eat rabbits / grow / score
5. Apply hunger / shrink / starvation death
6. Rabbit reproduction
7. Check level/game end conditions
8. Build `board[][]` from entities
9. Render

## License

MIT
