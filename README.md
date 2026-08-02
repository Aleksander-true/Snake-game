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

The current GitHub Pages deployment runs only the static browser game:
[https://aleksander-true.github.io/Snake-game/](https://aleksander-true.github.io/Snake-game/).
GitHub Pages cannot run the Node.js WebSocket server, so the multiplayer version needs a VPS,
container platform, or another hosting service that can keep a Node.js process running.

### Текущее состояние multiplayer deployment

На данный момент реализованы:

- production-сборка браузерной игры в `dist/`;
- Express/Node.js entry point в `apps/server/dist/index.js`;
- HTTP `GET /health`;
- WebSocket transport на `/ws`, handshake, проверка версии протокола и heartbeat.

Пока не реализованы браузерный WebSocket-клиент, комнаты и авторитетный `MatchSession`.
Поэтому сервер уже можно запустить и проверить технически, но полноценный multiplayer на опубликованном сайте
появится после реализации этих частей.

### Почему в коде встречается `http://localhost`

В `createMultiplayerServer.ts` используется выражение:

```ts
const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
```

`request.url` от Node.js обычно является относительным путём, например `/ws?token=...`, а конструктору
`URL` для разбора относительной строки нужна абсолютная базовая ссылка. `http://localhost` здесь только
синтаксическая база для парсера. Сервер не подключается к localhost, не перенаправляет туда клиента и не
использует этот адрес как публичный hostname.

Например, запрос клиента к `wss://game.example.com/ws?token=abc` внутри Node.js может выглядеть как
`/ws?token=abc`. После разбора получится `pathname === '/ws'`. Реальный адрес определяется доменом,
DNS, reverse proxy и портом, на котором запущен сервер.

### Рекомендуемая production-схема: один домен и один VPS

```text
Browser
  |
  | https://game.example.com/
  | wss://game.example.com/ws
  v
Nginx :443
  |-- /              -> static files from dist/
  |-- /health        -> Node.js 127.0.0.1:3000
  `-- /ws            -> Node.js 127.0.0.1:3000 (WebSocket upgrade)

Node.js multiplayer server
  `-- rooms, MatchSession and Engine (after the remaining multiplayer stages)
```

Одиночная и multiplayer-игра могут находиться на одном сайте. Пользователь загружает один и тот же
`index.html` и JavaScript bundle. В одиночном режиме Engine работает локально в браузере. В сетевом режиме
интерфейс открывает WebSocket к `/ws`, отправляет только команды управления и отображает авторитетные
снимки сервера.

Преимущества одного домена:

- не требуется отдельный CORS для HTTP API;
- WebSocket использует тот же hostname;
- один TLS-сертификат;
- нет необходимости хранить production-адрес сервера в исходном коде клиента;
- одиночный режим остаётся доступным даже при временной недоступности multiplayer-процесса.

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

Публично должны быть открыты порты `80` и `443`. Порт Node.js `3000` не следует открывать во внешний
интернет: к нему должен обращаться только локальный Nginx. Текущий entry point запускает Node.js на
`0.0.0.0`, поэтому доступ к `3000` необходимо закрыть firewall/security group. Перед окончательным
production deployment планируется сделать bind-address настраиваемым и использовать `127.0.0.1` по умолчанию.

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
- позднее `packages/core/` и `apps/web/`;
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

Source map (`*.map`) и TypeScript declaration (`*.d.ts`) не нужны для работы браузера. Их можно оставить
в закрытом release-архиве для диагностики, но не обязательно публиковать через Nginx. В дальнейшем web-сборка
будет вынесена в отдельный `apps/web/dist`, чтобы production static-артефакты не смешивались с декларациями.

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

Nginx должен явно передавать заголовки `Upgrade` и `Connection`, потому что они не проксируются обычным
HTTP reverse proxy автоматически. Сервер отправляет WebSocket ping каждые две секунды, поэтому соединение
остаётся активным и одновременно обнаруживает потерянных клиентов.

### Как браузер получает игру

Во время `npm run build` Webpack:

1. начинает сборку с `src/index.ts`;
2. добавляет импортированные TypeScript- и CSS-модули в JavaScript bundle;
3. создаёт `dist/index.html`;
4. добавляет в HTML ссылку на bundle с content hash;
5. копирует favicon.

При открытии `https://game.example.com/` происходит следующее:

```text
Browser -> GET /                  -> Nginx returns dist/index.html
Browser -> GET /bundle.<hash>.js  -> Nginx returns compiled application
Browser                            -> executes the game locally
```

В одиночном режиме после загрузки страницы серверные тики не нужны: состояние игры, Engine и Canvas работают
в браузере. `localStorage` также остаётся на устройстве пользователя.

В будущем multiplayer-клиент будет выбирать WebSocket URL относительно текущей страницы:

```ts
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
```

Таким образом, development-страница по HTTP использует `ws://`, а production-страница по HTTPS — `wss://`.
Хардкодить `localhost`, IP сервера или отдельный production-домен в браузерном bundle не требуется. HTTPS-страница
не должна подключаться через обычный `ws://`, поскольку браузер заблокирует небезопасный mixed-content запрос.

### Обновление версии

Рекомендуемая последовательность deployment:

1. Собрать и проверить новую версию в CI.
2. Загрузить её в новый release-каталог, например `/opt/snake-game/releases/<version>`.
3. Установить runtime-зависимости внутри release.
4. Переключить ссылку `/opt/snake-game/current` на новый release.
5. Выполнить `sudo systemctl restart snake-game`.
6. Проверить `/health`, загрузку `/` и WebSocket handshake.
7. При ошибке вернуть `current` на предыдущий release и снова перезапустить сервис.

После добавления SQLite каталог базы данных следует хранить вне release, например `/var/lib/snake-game`, и
включить его в резервное копирование. Иначе переключение или удаление release может удалить историю матчей.

### Другие варианты размещения

1. **Один VPS, Nginx + Node.js — рекомендуемый MVP.** Самая простая схема для одного домена, одиночной игры
   и multiplayer.
2. **Static CDN/GitHub Pages + отдельный Node.js backend.** Возможен, но клиенту нужен отдельный адрес WSS,
   настройка разрешённых Origin и два deployment pipeline. GitHub Pages самостоятельно WebSocket-сервер не
   запускает.
3. **Express раздаёт и API, и static-файлы.** Технически возможно через `express.static`, но сейчас не
   реализовано. Для MVP Nginx удобнее завершает TLS и обслуживает неизменяемые файлы.
4. **Docker/container platform.** В контейнер включаются Node.js runtime, server build и runtime-зависимости;
   static-файлы можно раздавать отдельным Nginx-контейнером. Dockerfile и production compose пока в проекте
   отсутствуют.

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
