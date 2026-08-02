# Hungry Snakes 🐍

An arcade Snake game where snakes hunt food on a bounded grid with obstacles.
The key gameplay twist is food lifecycle and progressively increasing difficulty.

## Build

```bash
npm install
npm run build
```

Build output is generated in the `dist/` directory.

## Deployment

Current static deployment:
[https://aleksander-true.github.io/Snake-game/](https://aleksander-true.github.io/Snake-game/).

### Что должно быть установлено на сервере

Для рекомендуемой схемы нужны:

1. Linux-сервер или VPS с публичным IP.
2. Домен с `A`/`AAAA`-записью на этот сервер.
3. Node.js актуальной LTS-ветки. Для production следует использовать только Active LTS или Maintenance LTS;
   на момент написания рекомендуется Node.js 24 LTS.
4. npm, поставляемый вместе с Node.js.
5. Nginx для HTTPS, static-файлов и reverse proxy.
6. TLS-сертификат для домена, например от Let's Encrypt или hosting provider.
7. systemd или другой process manager, который перезапустит Node.js после сбоя и старта машины.
8. Git нужен только при развёртывании через `git clone`/`git pull`. При загрузке готового release-архива он
   не обязателен.

Официальные справочные материалы:

- [Node.js releases and LTS policy](https://nodejs.org/en/about/previous-releases)
- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- [Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)
- [Nginx beginner's guide](https://nginx.org/en/docs/beginners_guide.html)
- [systemd](https://systemd.io/)

Публично должны быть открыты порты `80` и `443`. Закройте порт Node.js `3000` для внешнего интернета через
firewall/security group: к нему должен обращаться только локальный Nginx.

### Что загружается на сервер

Есть два нормальных варианта.

#### Вариант A: собирать непосредственно на сервере

На сервер загружается или клонируется весь репозиторий, кроме локальных каталогов `node_modules`, `dist`
и `apps/*/dist`. Затем сервер устанавливает зависимости и выполняет сборку.

Минимально необходимые исходные файлы:

- корневые `package.json` и `package-lock.json`;
- `webpack.config.js`, `tsconfig.json` и остальные build-конфигурации;
- `src/`;
- `apps/server/`;
- `packages/contracts/`;
- ресурсы, используемые браузерной сборкой.

Команды из корня репозитория:

```bash
npm ci
npm run lint
npm test -- --runInBand
npm run build
```

`npm ci` использует зафиксированный `package-lock.json` и не изменяет версии зависимостей. После сборки
образуются три группы артефактов:

```text
dist/                         browser index.html, bundle and favicon
apps/server/dist/             compiled Node.js server
packages/contracts/dist/      compiled shared network contracts
```

Для повторяемого deployment сборку лучше выполнять в CI, а не вручную на production-машине.

#### Вариант B: собирать в CI и загружать release-артефакт

Это рекомендуемый итоговый вариант. CI выполняет `npm ci`, проверки и `npm run build`, после чего создаёт
release-архив. На сервер должны попасть:

```text
dist/
apps/server/dist/
apps/server/package.json
packages/contracts/dist/
packages/contracts/package.json
package.json
package-lock.json
```

Структуру каталогов workspace нужно сохранить. Затем на сервере устанавливаются только runtime-зависимости:

```bash
npm ci --omit=dev --ignore-scripts
```

`node_modules` не следует копировать с компьютера разработчика: зависимости могут содержать
платформозависимые файлы, а содержимое локального каталога не гарантирует соответствие lock-файлу.

Не публикуйте через Nginx файлы `*.map`, `*.d.ts` и `*.d.ts.map`. Они не нужны браузеру в production.

### Первый ручной запуск Node.js-сервера

После сборки:

```bash
NODE_ENV=production PORT=3000 node apps/server/dist/index.js
```

Проверка непосредственно на машине:

```bash
curl http://127.0.0.1:3000/health
```

Ожидаемый ответ:

```json
{"status":"ok","protocolVersion":1}
```

Этот ручной запуск подходит только для проверки. После закрытия SSH-подключения процесс может завершиться;
для постоянной работы нужен systemd, container runtime или process manager hosting-платформы.

### Пример systemd unit

Пример `/etc/systemd/system/snake-game.service`:

```ini
[Unit]
Description=Snake Game multiplayer server
After=network.target

[Service]
Type=simple
User=snakegame
Group=snakegame
WorkingDirectory=/opt/snake-game/current
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Путь к Node.js нужно проверить командой `command -v node` и при необходимости изменить `ExecStart`.
Каталог `/opt/snake-game/current` и файлы внутри него должны быть доступны пользователю `snakegame`.

После создания или изменения unit:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now snake-game
sudo systemctl status snake-game
sudo journalctl -u snake-game -f
```

### Пример Nginx-конфигурации одного сайта

TLS-сертификат и параметры `ssl_certificate` зависят от hosting provider/Let's Encrypt и должны быть добавлены
в HTTPS server block. Основная маршрутизация выглядит так:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name game.example.com;

    # После настройки сертификата HTTP обычно перенаправляется на HTTPS.
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name game.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    root /opt/snake-game/current/dist;
    index index.html;

    location ~* \.(?:map|d\.ts(?:\.map)?)$ {
        return 404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location = /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
}
```

Проверка и применение:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl https://game.example.com/health
```

Не удаляйте из location `/ws` заголовки `Upgrade` и `Connection`: они обязательны для WebSocket proxying.

### Обновление версии

Рекомендуемая последовательность deployment:

1. Собрать и проверить новую версию в CI.
2. Загрузить её в новый release-каталог, например `/opt/snake-game/releases/<version>`.
3. Установить runtime-зависимости внутри release.
4. Переключить ссылку `/opt/snake-game/current` на новый release.
5. Выполнить `sudo systemctl restart snake-game`.
6. Проверить `/health`, загрузку `/` и WebSocket handshake.
7. При ошибке вернуть `current` на предыдущий release и снова перезапустить сервис.

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
