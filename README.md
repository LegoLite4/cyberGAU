# cyberGAU

Локальная платформа матчей CS2. Веб-лобби, вход через Steam и запуск уже установленных серверов через панель Pterodactyl. Свой интерфейс, без материалов Cybershoke.

На тестовой машине игроки заходят через WireGuard. На основном ПК VPN не ставится: сайт и серверы слушают физический адрес локальной сети.

## Что есть в интерфейсе

- Список матчей, фильтры, создание лобби: открытое, с паролем или скрытое.
- Старт матча занимает свободный слот пула и показывает `connect ip:port`. Если слота нет, интерфейс пишет «Нет свободного сервера».
- Постоянные режимы: Deathmatch, Retake, Duels, Wingman, Competitive.
- Профиль Steam, история лобби, чат и ссылка-приглашение.
- Фильтры входа: пароль, максимальный пинг, минимум часов CS2.

## Репозиторий

Код хранится в приватном GitHub-репозитории владельца. В git не попадают `.env`, ключи Steam, ключи Pterodactyl, пароли и файл клиента WireGuard.

На сервер репозиторий клонируется SSH-ключом только на чтение. Приватная половина ключа остаётся в `/root/.ssh`.

## Установка на чистую Ubuntu 24.04

```bash
git clone git@github.com:LegoLite4/cyberGAU.git /opt/cybergau
sudo mkdir -p /etc/cybergau
sudo cp /opt/cybergau/deploy/env.example /etc/cybergau/env
sudo nano /etc/cybergau/env
sudo bash /opt/cybergau/deploy/install.sh
```

`install.sh` ставит Docker, поднимает сайт, API и PostgreSQL, включает автозапуск `cybergau.service`. При `CYBERGAU_ACCESS=wireguard` дополнительно ставится WireGuard и пишется `/etc/cybergau/wg-client.conf` для Windows. При `CYBERGAU_ACCESS=lan` WireGuard не ставится.

Если `INSTALL_PTERODACTYL=1`, тот же запуск ставит панель, Wings и пытается создать пул CS2 размером `POOL_SIZE`.

После перезагрузки сами стартуют Docker, `cybergau.service`, `pteroq`, `wings` и, только на тесте, `wg-quick@wg0`.

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

Проверка Proxmox: VM 112 называется CyberGAU, она запущена, 10 ядер, 8 ГБ RAM, диск 100 ГБ. Хост панели в сети `192.168.0.13/24`, этот Windows-ПК в другой сети, поэтому гость отсюда напрямую не открывается. QEMU Guest Agent внутри не запущен. В консоли Ubuntu поставьте `qemu-guest-agent` и включите службу. Дальше: `sudo bash deploy/install.sh` с `CYBERGAU_ACCESS=wireguard` и `POOL_SIZE=1`. На 8 ГБ держите один слот CS2.
