# ParkingUSA — быстрый локальный запуск и zrok

Дата: 2026-06-13

Короткий путь для локальной проверки ParkingUSA, обновления Miami fallback-данных и публикации сайта через zrok. Все команды выполняются из корня репозитория.

```powershell
cd C:\AI\ParkingUSA
```

## Самый частый сценарий

```powershell
npm install
npm run dev
```

Откройте:

```text
http://localhost:3000
```

Приложение работает без PostGIS: если база не настроена или недоступна, API автоматически читает GeoJSON-фикстуры из `data/`.

## Если нужно обновить Miami fallback

Одна команда обновляет официальные Miami Beach WP Go Maps и ArcGIS fixtures:

```powershell
npm run data:refresh:miami
```

После обновления ожидаемые значения для Miami:

```text
totalFacilities: 621
curbSegments: 0
zones: 532
```

Проверить API при запущенном сайте:

```powershell
Invoke-RestMethod "http://localhost:3000/api/stats?city=miami"
```

Основные GeoJSON-слои карты:

```text
http://localhost:3000/api/geojson/facilities?city=miami
http://localhost:3000/api/geojson/segments?city=miami
http://localhost:3000/api/geojson/zones?city=miami
```

## Если нужно показать сайт снаружи через zrok

Сначала убедитесь, что zrok CLI доступен. ParkingUSA сам ищет `ZROK_PATH`, затем `C:\zrok\zrok2.exe`, затем `C:\zrok\zrok.exe`, затем `zrok` из `PATH`. На этой машине уже используется путь `C:\zrok\zrok2.exe`, как в проекте `C:\AI\disayner`.

Ручная проверка:

```powershell
C:\zrok\zrok2.exe version
```

Если zrok лежит в другом месте, добавьте в `.env.local`:

```env
ZROK_PATH=C:\path\to\zrok.exe
```

Если бинарника нет вообще, установите zrok по инструкции https://docs.zrok.io/docs/getting-started/.

Нужны два терминала.

Терминал 1 — запустить Next.js так, чтобы zrok/LAN могли достучаться до сайта:

```powershell
npm run dev:public
```

Терминал 2 — открыть публичный zrok URL:

```powershell
npm run share:zrok
```

`zrok` напечатает публичную ссылку. Её можно отправлять тестировщикам.

Приватный вариант:

```powershell
npm run share:zrok:private
```

Для приватного режима zrok не выдает публичную ссылку. Команда печатает строку вида:

```text
Private zrok access command: zrok2 access private <share-token>
```

Ее нужно передать тому, кто будет подключаться через свой zrok CLI.

Если zrok отвечает `shareInternalServerError` при создании нового private share, проверьте уже существующие shares:

```powershell
C:\zrok\zrok2.exe overview
```

Для повторного запуска существующего ParkingUSA private share можно задать его token только в текущей PowerShell-сессии:

```powershell
$env:ZROK_SHARE_TOKEN="sw3w7pqchimb"
npm run share:zrok:private
```

На этой машине `sw3w7pqchimb` уже был создан для `http://localhost:3000`.

## Первый запуск zrok

Токен нельзя коммитить. Если zrok уже был включён раньше, `npm run zrok:enable` использует сохранённый `~\.zrok2\environment.json`. Если нужен новый токен, самый безопасный вариант — положить его только в текущую PowerShell-сессию:

```powershell
$env:ZROK_ENABLE_TOKEN="<вставьте-токен-сюда>"
npm run zrok:enable
```

Можно хранить токен локально в `.env.local` — этот файл не должен попадать в репозиторий:

```env
ZROK_ENABLE_TOKEN=<вставьте-токен-сюда>
```

Затем:

```powershell
npm run zrok:enable
```

## Проверка перед публикацией

Быстрый общий прогон:

```powershell
npm run check:local
```

Он выполняет:

```powershell
npm run research:validate
npm test
npm run build
```

Для ручной проверки карты убедитесь, что:

- MapLibre canvas отрисовался;
- счётчики слоёв Miami показывают ожидаемые количества;
- клик по точке или полигону открывает popup/detail с источником, свежестью и confidence;
- `/api/stats?city=miami` возвращает ожидаемые fallback-значения.

## Что делают короткие команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Обычный локальный запуск на `localhost:3000`. |
| `npm run dev:public` | Запуск на `0.0.0.0:3000` для LAN/zrok. |
| `npm run data:refresh:miami` | Обновить Miami Beach WP Go Maps и ArcGIS fixtures. |
| `npm run zrok:enable` | Включить zrok environment: берёт `ZROK_ENABLE_TOKEN` или сохранённый `~\.zrok2\environment.json`. |
| `npm run share:zrok` | Публичный zrok-туннель к `localhost:3000`; автоматически ищет `C:\zrok\zrok2.exe`. |
| `npm run share:zrok:private` | Приватный zrok-туннель к `localhost:3000`; автоматически ищет `C:\zrok\zrok2.exe`. |
| `npm run check:local` | Validate research manifests, tests, build. |

Старые явные команды (`npm run frontend:dev:public`, `npm run tunnel:zrok`, `npm run tunnel:zrok:private`, `npm run fetch:miami-beach`, `npm run fetch:miami-beach:arcgis`) оставлены для совместимости.

## Частые проблемы

Если `npm run share:zrok` пишет, что zrok CLI недоступен, проверьте путь к бинарнику:

```powershell
C:\zrok\zrok2.exe version
```

Если zrok лежит в другом месте, задайте `ZROK_PATH` в `.env.local`.

Если zrok открыл ссылку, но сайт недоступен, проверьте, что сайт запущен через:

```powershell
npm run dev:public
```

Если счётчики Miami устарели, обновите данные и перезапустите сайт:

```powershell
npm run data:refresh:miami
npm run dev:public
```
