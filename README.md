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

## Quick Game Rules

### Game modes

- **Classic single-player:** complete 10 levels by reaching each cumulative score target. Dying ends the game.
- **Survival:** complete 100 levels without resetting the current board. The active field expands through level 10 and then remains at its maximum size. Reaching the level 100 target wins the game; dying loses it.
- **Multiplayer or mixed match:** two to six human- or bot-controlled snakes play 10 rounds. A round ends when no more than one snake remains alive or when the three-minute timer expires.
- **Spectator mode:** start a bots-only match and watch the AI opponents play.

### Movement, collisions, and hunger

- A snake moves one cell every tick and cannot reverse direction by 180 degrees in a single move.
- A snake dies when its head hits a wall, the board boundary, a living snake, its own body, or a hedgehog.
- A dead snake remains visible in grey until the round ends, but its body is no longer solid.
- Snakes start with five segments. After 15 ticks without food, a snake loses one tail segment. Eating any food resets the hunger counter. A snake dies from hunger when its length falls below two segments.

### Food and score

Eating food awards the listed points, grows the snake by the listed number of segments, and resets hunger.

| Food | Lifetime stage | Points | Growth | Behaviour |
|---|---:|---:|---:|---|
| Green apple 🍏 | ticks 0–49 | +1 | +1 | Does not move |
| Red apple 🍎 | ticks 50–99 | +2 | +2 | Does not move |
| Old apple | ticks 100–149 | +1 | +1 | Does not move |
| Egg 🥚 | ticks 0–49 | +1 | +1 | Does not move |
| Chick 🐤 | ticks 50–99 | +2 | +2 | Moves once every three ticks near its egg position |
| Chicken 🐔 | ticks 100–149 | +3 | +3 | Moves once every two ticks, seeks apples, and avoids snakes |
| Meat 🍖 | ticks 0–49 | +1 | +1 | Does not move |

- Level 1 normally spawns apples only. Eggs can spawn from level 2 onward.
- Apples can reproduce, while adult chickens can lay up to three eggs. Food disappears after its lifetime expires; an expired chicken becomes meat.
- A snake killed by a wall or snake collision creates one piece of meat per three body segments, rounded up, when enough free cells exist. A snake that dies from hunger leaves no meat.
- One new food item is added every 100 ticks when a free cell is available, even when the normal food population limit has been reached.
- Legacy rabbit food remains supported by the engine for experiments, but it is not part of normal level spawning.

### Enemies and difficulty

- Hedgehogs 🦔 can appear from level 4. A hedgehog occupies a 2×2-cell area, hunts visible snakes, apples, and meat, and kills a snake on contact.
- Higher difficulty produces harder maps, less initial food, more dangerous hedgehogs, and stronger AI behaviour.

### Winning

- In single-player modes, reach the current cumulative score target to advance to the next level.
- The default target added by level `N` is `5 × N + 20` points; score carries over, so the displayed target is cumulative.
- In multiplayer, the only surviving snake wins the round. If every snake dies, or the timer expires with multiple survivors, the round is a draw.
- After round 10, the participant with the most round victories wins the match. Total score breaks a victory tie; equal victories and equal score result in a draw.

## Controls

- Single-player: Player 1 supports both `W`, `A`, `S`, `D` and arrow keys `↑`, `←`, `↓`, `→`
- Two players: Player 1 uses `W`, `A`, `S`, `D`, Player 2 uses arrow keys
