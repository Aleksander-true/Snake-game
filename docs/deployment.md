# Публикация Hungry Snakes на виртуальной машине

Документ описывает production-развёртывание одиночной и сетевой игры на одной
Linux VM. Браузер получает одну production-сборку: одиночный режим выполняется
локально в браузере, а сетевой режим этой же страницы использует HTTP API и
WebSocket авторитетного Node.js-сервера.

## 1. Схема развёртывания

```text
браузер пользователя
  └─ HTTPS / WSS, порт 443
       └─ Nginx
            └─ HTTP / WebSocket, 127.0.0.1:3000
                 └─ Node.js + Express + ws
                      ├─ dist/ — браузерная сборка
                      ├─ @snake-game/core — авторитетный Engine
                      └─ SQLite — постоянная история матчей
```

Nginx завершает TLS и передаёт все запросы одному Express-процессу. Express
раздаёт `dist/index.html` и JS/CSS, обслуживает `/api/*`, `/health` и upgrade на
`/ws`. Поэтому клиенту не нужны отдельные адреса API: HTTP и WebSocket используют
тот же домен, с которого открыта игра. На HTTPS-странице WebSocket автоматически
подключается через `wss://`.

Строка `http://localhost` внутри обработчика WebSocket upgrade используется
только как синтаксическая база для разбора относительного пути запроса. Сервер не
подключается к localhost и не сообщает этот адрес браузеру.

## 2. Ресурсы и программное обеспечение

Для одной копии сервера и не более 10 одновременно подключённых пользователей
достаточно 1 vCPU и 1 GB RAM. Для запаса под сборку, Nginx и обновления
рекомендуются 2 vCPU и 2 GB RAM. Нужны:

- Ubuntu Server 24.04 LTS или совместимый актуальный Linux;
- 2 GB свободного диска, плюс место для истории и резервных копий;
- публичный IP и домен с `A`/`AAAA`-записью на VM;
- Node.js 24 LTS и npm;
- Git, Nginx, Certbot и `sqlite3` для резервного копирования;
- открытые наружу TCP-порты 80 и 443;
- закрытый от внешней сети порт 3000.

Первая версия рассчитана на один Node.js-процесс. Не запускайте несколько
экземпляров за балансировщиком: комнаты находятся в памяти конкретного процесса,
а sticky sessions и распределённое владение комнатами пока не реализованы.

## 3. Подготовка VM

Подключитесь к серверу пользователем с `sudo` и установите системные пакеты:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx sqlite3 ufw
```

Установите Node.js 24 из доверенного репозитория вашего дистрибутива или с
официальной страницы Node.js. После установки проверьте версии:

```bash
node --version
npm --version
```

Версия Node должна начинаться с `v24.`. Создайте отдельного системного
пользователя и каталоги приложения:

```bash
sudo useradd --system --create-home --home-dir /opt/hungry-snakes --shell /usr/sbin/nologin snakegame
sudo install -d -o snakegame -g snakegame /opt/hungry-snakes/app
sudo install -d -o snakegame -g snakegame /var/lib/hungry-snakes
sudo install -d -o snakegame -g snakegame /var/backups/hungry-snakes
```

## 4. Получение и сборка приложения

Клонируйте репозиторий от имени сервисного пользователя:

```bash
sudo -u snakegame git clone https://github.com/Aleksander-true/Snake-game.git /opt/hungry-snakes/app
cd /opt/hungry-snakes/app
sudo -u snakegame npm ci
sudo -u snakegame npm run build
```

Команда `npm run build` создаёт:

- `dist/` — файлы, которые загружаются в браузер;
- `apps/server/dist/` — Node.js-сервер;
- `packages/contracts/dist/` и `packages/core/dist/` — общие DTO и Engine.

Для первоначальной диагностики можно запустить сервер вручную:

```bash
sudo -u snakegame env \
  NODE_ENV=production \
  PORT=3000 \
  STATIC_DIR=/opt/hungry-snakes/app/dist \
  MATCH_HISTORY_DB=/var/lib/hungry-snakes/matches.sqlite \
  node apps/server/dist/index.js
```

В другом SSH-сеансе проверьте `curl http://127.0.0.1:3000/health`, затем
остановите пробный процесс сочетанием `Ctrl+C`.

## 5. Переменные окружения

Создайте `/etc/hungry-snakes.env`:

```bash
sudo tee /etc/hungry-snakes.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=3000
STATIC_DIR=/opt/hungry-snakes/app/dist
MATCH_HISTORY_DB=/var/lib/hungry-snakes/matches.sqlite
EOF
sudo chmod 640 /etc/hungry-snakes.env
sudo chown root:snakegame /etc/hungry-snakes.env
```

- `PORT` — внутренний HTTP/WebSocket-порт Express.
- `STATIC_DIR` — абсолютный путь к production-сборке браузера.
- `MATCH_HISTORY_DB` — абсолютный путь к постоянной SQLite-базе. Если переменная
  отсутствует, история хранится только в памяти и исчезает после рестарта.

В этот файл не требуется помещать приватные коды комнат или reconnect tokens:
они генерируются во время работы. В SQLite сохраняются только хэши токенов
доступа к истории.

## 6. Служба systemd

Создайте `/etc/systemd/system/hungry-snakes.service`:

```ini
[Unit]
Description=Hungry Snakes multiplayer server
After=network.target

[Service]
Type=simple
User=snakegame
Group=snakegame
WorkingDirectory=/opt/hungry-snakes/app
EnvironmentFile=/etc/hungry-snakes.env
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/hungry-snakes

[Install]
WantedBy=multi-user.target
```

Если `command -v node` возвращает не `/usr/bin/node`, укажите фактический
абсолютный путь в `ExecStart`. Включите и запустите службу:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hungry-snakes
sudo systemctl status hungry-snakes
curl http://127.0.0.1:3000/health
```

Логи сервера доступны командой:

```bash
sudo journalctl -u hungry-snakes -f
```

При `SIGTERM` сервер прекращает игровые циклы, дожидается начатых записей
истории и закрывает SQLite перед завершением процесса.

## 7. Nginx и WebSocket

Создайте `/etc/nginx/conf.d/websocket-map.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
```

Создайте `/etc/nginx/sites-available/hungry-snakes`, заменив
`game.example.com` своим доменом:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name game.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;
    }
}
```

Включите сайт и проверьте конфигурацию:

```bash
sudo ln -s /etc/nginx/sites-available/hungry-snakes /etc/nginx/sites-enabled/hungry-snakes
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Получите TLS-сертификат и включите перенаправление HTTP → HTTPS:

```bash
sudo certbot --nginx -d game.example.com --redirect
sudo certbot renew --dry-run
```

После этого одиночная и мультиплеерная игра доступны по одному адресу
`https://game.example.com/`; WebSocket работает по
`wss://game.example.com/ws`.

## 8. Firewall

Перед включением UFW убедитесь, что SSH разрешён:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Не открывайте порт 3000 в cloud firewall/security group или UFW. Доступ к нему
нужен только Nginx через loopback.

## 9. Проверка после публикации

Выполните последовательно:

```bash
curl -fsS https://game.example.com/health
curl -fsS https://game.example.com/api/rooms
curl -I https://game.example.com/
```

Затем проверьте в двух независимых браузерах или приватных окнах:

1. Одиночная игра запускается без обращения к комнате.
2. Первый браузер создаёт публичную комнату.
3. Второй видит её в списке и входит.
4. После ready обоих начинается один и тот же матч.
5. Перезагрузка вкладки в пределах 10 секунд восстанавливает управление.
6. Намеренный выход немедленно передаёт змейку боту.
7. После завершения серии история появляется в `/api/matches`.

В DevTools браузера запрос `/ws` должен иметь статус `101 Switching Protocols`.
Ошибки mixed content означают, что страница открыта по HTTPS, а WebSocket был
настроен как `ws://`; штатный клиент выбирает `wss://` автоматически.

## 10. Обновление версии

Перед обновлением сохраните идентификатор работающего коммита и сделайте backup:

```bash
cd /opt/hungry-snakes/app
git rev-parse HEAD
sudo systemctl stop hungry-snakes
sudo -u snakegame sqlite3 /var/lib/hungry-snakes/matches.sqlite \
  ".backup '/var/backups/hungry-snakes/matches-$(date +%F-%H%M%S).sqlite'"
sudo -u snakegame git fetch --prune origin
sudo -u snakegame git pull --ff-only
sudo -u snakegame npm ci
sudo -u snakegame npm run build
sudo systemctl start hungry-snakes
curl -fsS http://127.0.0.1:3000/health
```

Остановка процесса прерывает активные матчи, поэтому обновляйте сервер в
период низкой активности. До внедрения нескольких серверных экземпляров
обновление без разрыва существующих WebSocket-соединений невозможно.

## 11. Откат и резервное копирование

Для отката остановите службу, переключите репозиторий на заранее записанный
commit, повторите `npm ci` и `npm run build`, затем запустите службу. Не удаляйте
SQLite-файл при откате. Если новая версия изменила схему несовместимо, сначала
восстановите соответствующую резервную копию.

SQLite работает в WAL-режиме, поэтому не копируйте живой `.sqlite` обычной
командой `cp`: используйте `.backup` из примера выше или предварительно
останавливайте службу. Периодически проверяйте свободное место:

```bash
df -h
du -h /var/lib/hungry-snakes/matches.sqlite
```

## 12. Типичные неисправности

- `502 Bad Gateway`: Node.js-служба не запущена, слушает другой порт или Nginx
  не может обратиться к `127.0.0.1:3000`.
- Страница открывается, но комнаты не работают: проверьте upgrade-заголовки
  Nginx, `/ws` и журнал systemd.
- История исчезает после рестарта: проверьте `MATCH_HISTORY_DB`, права каталога
  `/var/lib/hungry-snakes` и наличие файла базы.
- `ERR_MODULE_NOT_FOUND`/ошибка workspace-пакета: выполните `npm ci` в корне и
  пересоберите все пакеты через `npm run build`.
- Сертификат не выдан: DNS ещё не указывает на VM или порт 80 закрыт внешним
  firewall провайдера.
