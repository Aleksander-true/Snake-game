# Hungry Snakes 🐍

An arcade Snake game where snakes hunt food on a bounded grid with obstacles.
The key gameplay twist is food lifecycle and progressively increasing difficulty.

## Build

```bash
npm install
npm run build
```

Build output is generated in the `dist/` directory.

## Server requirements

Preliminary requirements for a small multiplayer instance before load testing:

- Linux VPS with an x86-64 or ARM64 architecture;
- at least 1 vCPU, 1 GB of RAM, and 2 GB of free disk space;
- 2 vCPUs and 2 GB of RAM recommended;
- a public IPv4/IPv6 address and a domain with configured DNS records;
- Node.js 24 LTS and npm;
- Nginx with HTTPS and WebSocket reverse proxy support;
- a TLS certificate for HTTPS/WSS;
- systemd or another process manager for Node.js;
- public ports `80` and `443`;
- internal Node.js port `3000`, closed to external traffic;
- a dedicated persistent directory for the future SQLite database and backups.

Current static deployment:
[https://aleksander-true.github.io/Snake-game/](https://aleksander-true.github.io/Snake-game/).

## Game Description

The game supports multiple snakes at once: human players and AI bots.
Each snake moves on a cell-based board, eats food, gains score, and tries to survive longer than opponents.
The map includes walls and hard boundaries, and collisions can eliminate a snake.
As the match progresses, difficulty rises: the environment gets denser and decisions become more tactical.

To play effectively, you need to balance aggression and survival:

- hunt food for growth and points;
- avoid collisions with walls and snakes;
- plan routes ahead to avoid dead ends.

## Game Rules

1. **Match objective** - score as many points as possible and outlast opponents.
2. **Movement** - snakes move cell by cell; a 180-degree turn in one tick is not allowed.
3. **Collisions**:
   - with walls or map boundaries - defeat;
   - with a snake body (your own or another snake) - defeat.
4. **Food**:
   - spawn on free cells;
   - grant points when eaten and help snake growth;
   - can reproduce, making the board state dynamic.
5. **Difficulty progression** - match conditions become more intense over time.
6. **Victory** - determined by the active mode rules: survival, score, or a combination.

## Controls

- Single-player: Player 1 supports both `W`, `A`, `S`, `D` and arrow keys `↑`, `←`, `↓`, `→`
- Two players: Player 1 uses `W`, `A`, `S`, `D`, Player 2 uses arrow keys
