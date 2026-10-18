# cyberGAU

Локальная платформа матчей CS2. Веб-лобби, вход через Steam и запуск уже установленных серверов через панель Pterodactyl. Свой интерфейс, без материалов Cybershoke.

По умолчанию сайт и серверы слушают IP основного интерфейса в LAN. Для удалённого теста можно включить WireGuard (`CYBERGAU_ACCESS=wireguard`).

## Что есть в интерфейсе

- Список матчей, фильтры, создание лобби: открытое, с паролем или скрытое.
- Старт матча занимает свободный слот пула и показывает `connect ip:port`. Если слота нет, интерфейс пишет «Нет свободного сервера».
- Постоянные режимы: Deathmatch, Retake, Duels, Wingman, Competitive.
- Профиль Steam, история лобби, чат и ссылка-приглашение.
- Фильтры входа: пароль, максимальный пинг, минимум часов CS2.

## Репозиторий

Код в публичном GitHub-репозитории. В git не попадают `.env`, ключи Steam, ключи Pterodactyl, пароли и файл клиента WireGuard — они создаются на сервере при установке.

## Установка на чистую Ubuntu 24.04

Одна публичная ссылка — клон, автонастройка и установка:

```bash
curl -fsSL https://raw.githubusercontent.com/LegoLite4/cyberGAU/main/deploy/get.sh | sudo bash
```

`get.sh` кладёт код в `/opt/cybergau`, пишет `/etc/cybergau/env` (пароли и IP с основного интерфейса: 192.168.x / 10.x / …), ставит Docker, сайт, API, PostgreSQL, `cybergau.service`, панель Pterodactyl и пул CS2. По умолчанию `CYBERGAU_ACCESS=lan`. Переопределения: `CYBERGAU_ACCESS=wireguard`, `STEAM_WEB_API_KEY=...`, `WG_ENDPOINT=ip:51820`, `POOL_SIZE=1`, `FORCE_ENV=1`.

Игра CS2 качается один раз в `/var/lib/cybergau/cs2-base` (~50–60 GB); слоты пула делают hardlink-копию и не гоняют SteamCMD заново. На диске для базы нужно ≥70 GB свободно; при готовой базе 4 слота укладываются примерно в ~100 GB суммарно (база + мелкие cfg/logs на слот). Обновить игру: `sudo FORCE_CS2_BASE=1 bash /opt/cybergau/deploy/build-cs2-base.sh`.

После увеличения диска в Proxmox или клона VM раздел Ubuntu часто остаётся старого размера — расширьте вручную: `sudo bash /opt/cybergau/deploy/grow-root-disk.sh`.

После перезагрузки сами стартуют Docker, `cybergau.service`, `pteroq`, `wings`; при wireguard ещё `wg-quick@wg0`.

Обновление на сервере: `sudo bash /opt/cybergau/deploy/update.sh`.

Перенос уже скачанных файлов CS2 на основной ПК:

```bash
SOURCE=root@test-host sudo bash deploy/migrate-volumes.sh
```

Секреты копируются отдельно файлом `/etc/cybergau/env`.

## Локальная проверка интерфейса

Скопируйте `deploy/env.example` в `.env` в корне репозитория. Для проверки без панели поставьте `PTERODACTYL_MOCK=1`, `CYBERGAU_ACCESS=lan`, `BIND_ADDR=127.0.0.1`, `PUBLIC_WEB_URL=http://127.0.0.1:3000`. Затем:

```bash
docker compose --env-file .env up -d --build
```

Сайт откроется на порту 3000. Вход Steam сработает после того, как в `.env` будет `STEAM_WEB_API_KEY`, а в настройках ключа Steam указан redirect на этот адрес. Без ключа OpenID всё равно создаёт сессию, но имя и часы CS2 не подтягиваются.

## Тестовая VM

Проверка Proxmox: свежая VM с Ubuntu — одна команда-установщик выше (`POOL_SIZE=1`). Адреса возьмутся с LAN машины. Для полного CS2 пула нужен диск под общую базу (`/var/lib/cybergau/cs2-base`); лимит диска слота (`CS2_DISK_MB`, по умолчанию 8192) — только cfg/logs/demos.
