# OpenParking / ParkingUSA — QA/DevOps baseline runbook

Дата baseline-прогона: 2026-07-03
Рабочая папка на Mac mini: `/Users/vladimirgrebennikov/Code/OpenParking`
Репозиторий: `https://github.com/fontan4ik/OpenParking`

## Цель

Этот runbook фиксирует минимальный QA/DevOps baseline для локальной проверки проекта перед передачей app/shared TypeScript изменений дальше:

1. `npm install`
2. `npm run db:generate`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

Команды не требуют production/deploy/secrets и не запускают платные сервисы.

## Перед стартом

```bash
cd /Users/vladimirgrebennikov/Code/OpenParking
git status --short
node --version
npm --version
```

Зафиксированный локальный baseline environment на 2026-07-03:

```text
node v22.23.1
npm 10.9.8
```

## Baseline-команды

Запускать из корня репозитория:

```bash
npm install
npm run db:generate
npm run typecheck
npm test
npm run build
```

Ожидаемый результат текущего baseline-прогона:

| Команда | Ожидаемый статус | Примечание |
| --- | --- | --- |
| `npm install` | exit 0 | `up to date`, 174 packages audited; npm сообщает 1 low severity vulnerability. Не запускать `npm audit fix` автоматически, потому что это меняет dependency graph. |
| `npm run db:generate` | exit 0 | Prisma Client v6.19.3 генерируется из `apps/backend/prisma/schema.prisma`; подключение к PostGIS для generate не требуется. |
| `npm run typecheck` | exit 0 | `tsc --noEmit --pretty false`. |
| `npm test` | exit 0 | Vitest: 18 test files passed, 209 tests passed. |
| `npm run build` | exit 0 | `next build apps/frontend`, Next.js 15.5.19, production build compiled successfully. |

Локальные логи последнего прогона были сохранены в ignored-папку:

```text
logs/qa-devops/baseline-20260703T114909Z.summary.txt
```

`logs/` игнорируется Git и не должен попадать в коммит.

## Package-lock sync: blocker/history

На старте DEV-40 checkout уже был dirty только по `package-lock.json`:

```text
 M package-lock.json
```

Текущий diff lockfile — это sync результата `npm install` под локальным Node/npm baseline. Он добавляет/переставляет npm metadata для optional/peer dependency entries, включая `@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, и снимает лишние `peer` flags с части уже существующих записей.

Практический вывод:

- baseline-команды теперь проходят с синхронизированным `package-lock.json`;
- если этот lockfile sync не закоммитить, следующий чистый checkout/CI может снова получить dirty lockfile после `npm install`;
- если CI использует другую major-версию npm, lockfile metadata может снова отличаться. Для стабильности baseline желательно держать CI на npm 10.x или отдельно зафиксировать engine/toolchain policy;
- `npm ci` можно использовать в CI после коммита lockfile sync, но локальный baseline DEV-40 намеренно фиксирует именно требуемый `npm install`.

## PostGIS / Docker заметки

`npm run db:generate` не поднимает PostGIS и не требует `DATABASE_URL`.

Команды, которые могут требовать локальную БД, Docker или внешние данные, не входят в этот минимальный baseline и должны запускаться отдельно по задаче:

```bash
npm run db:migrate
npm run import:osm:pbf:florida:parking:docker
npm run connector:arcgis:import
npm run normalize:osm:pbf:miami-dade:boundary
```

Перед DB/Docker проверками отдельно подтвердить допустимый scope данных и убедиться, что production secrets/deploy не затрагиваются.

## Dev server / smoke check hygiene

Для обычного browser smoke:

```bash
npm run dev
# открыть http://localhost:3000
```

Для LAN/zrok:

```bash
npm run dev:public
npm run share:zrok
```

Правила QA/DevOps:

- запускать dev server только bounded attempt, если это действительно нужно для проверки;
- не оставлять `next dev`, `next start`, zrok share или Docker compose процессы запущенными после работы, если пользователь явно не попросил держать их живыми;
- если dev server/browser check зависает, остановить стартованные процессы и зафиксировать blocker;
- после завершения проверить, что временные процессы не остались.

Быстрая проверка процессов на Mac/Linux:

```bash
pgrep -fl "next dev|next start|zrok|docker compose" || true
```

## Rollback notes

- Если нужно откатить только документацию DEV-40: revert изменений в `docs/QA_DEVOPS_BASELINE_RUNBOOK.md`, `docs/README.md`, `docs/INTEGRATION_USAGE_GUIDE.md`.
- Если lockfile sync отклонён: `git checkout -- package-lock.json`, затем заново запускать baseline на согласованной версии Node/npm.
- В рамках DEV-40 production/deploy/secrets не менялись, сервисы не рестартовались, dev server не запускался.
