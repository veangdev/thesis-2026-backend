# PNC Journey Star — Backend API

Backend API for the **PNC Students' Journey Star System** — a student
growth-tracking platform where **self-assessors** (students) rate themselves
across configurable dimensions, **facilitators** (mentors) review and agree on
scores, and **program coordinators** (managers) configure the program and read
analytics. The system tracks growth across assessment cycles and flags
dimensions that need coaching.

Built with **NestJS 11**, **TypeScript**, **Prisma 7**, and **PostgreSQL 16**.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Architecture overview](#architecture-overview)
- [Roles & permissions](#roles--permissions)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment setup](#environment-setup)
- [Running the app](#running-the-app)
- [Running with Docker](#running-with-docker)
- [Database, migrations & seed](#database-migrations--seed)
- [API documentation (Swagger)](#api-documentation-swagger)
- [API overview](#api-overview)
- [Response conventions](#response-conventions)
- [Business logic](#business-logic)
- [Testing](#testing)
- [Available scripts](#available-scripts)
- [Contributing](#contributing)

---

## Tech stack

| Concern         | Choice                                                |
| --------------- | ----------------------------------------------------- |
| Framework       | NestJS 11                                             |
| Language        | TypeScript (strict)                                   |
| ORM             | Prisma 7 (`prisma-client` generator + `adapter-pg`)   |
| Database        | PostgreSQL 16                                          |
| Auth            | JWT access + refresh tokens (`passport-jwt`), bcrypt  |
| Validation      | `class-validator` / `class-transformer`               |
| API docs        | Swagger / OpenAPI at `/api/docs`                      |
| Package manager | **Yarn (classic)** — Yarn only                        |

## Architecture overview

A layered, modular NestJS architecture:

```
HTTP → Guards (JWT + Roles) → Controller → Service → Repository → Prisma → PostgreSQL
                                   ↑             ↑
                          Validation pipe   Business logic
```

- **Controllers** are thin — HTTP concerns only; they delegate to services.
- **Services** hold business logic and role scoping, and never expose password hashes.
- **Repositories** isolate Prisma from services.
- **Global pipeline** ([`src/app.setup.ts`](src/app.setup.ts)): `helmet`, request
  logging, global `JwtAuthGuard` (everything protected unless `@Public()`),
  global `RolesGuard` (`@Roles(...)`), `ValidationPipe`
  (`whitelist` + `forbidNonWhitelisted` + `transform`), and a global
  `AllExceptionsFilter` (consistent error envelope + Prisma error mapping).
- **Config** is centralized and validated at boot ([`src/config`](src/config));
  invalid/missing env vars fail fast.

## Roles & permissions

Three system roles (the wire keys the frontend is built against):

| Key                   | Label               | Capabilities                                                              |
| --------------------- | ------------------- | ------------------------------------------------------------------------- |
| `program_coordinator` | Program Coordinator | Full admin: users, cohorts, dimensions, periods, assignments, analytics.  |
| `facilitator`         | Facilitator         | Manage assigned students, review/score assessments, run coaching.         |
| `self_assessor`       | Self-Assessor       | Own self-assessments, own goals, own reports and profile only.            |

Students never read other students' data; facilitators are scoped to their
assigned students; coordinators see everything. Scoping is enforced in the
services (ownership / assignment checks) on top of the role guard.

## Project structure

```
src/
├── app.module.ts          # Root module
├── app.setup.ts           # Shared global HTTP pipeline (used by main + e2e)
├── main.ts                # Bootstrap (Swagger, CORS, listen)
├── common/                # Decorators, guards, filters, enums, interfaces, pagination
├── config/                # configuration + env validation
├── prisma/                # PrismaService (global module)
└── modules/
    ├── auth/              # login, refresh, forgot/reset password, me, logout
    ├── users/             # user CRUD, bulk create, filters
    ├── cohorts/           # cohorts (scoringScaleMax 5 or 10)
    ├── dimensions/        # configurable dimensions per cohort
    ├── periods/           # assessment periods (open/close)
    ├── assignments/       # mentor ↔ student assignments
    ├── assessments/       # the assessment lifecycle state machine
    ├── analytics/         # student / cohort / overview / gap analytics
    ├── coaching/          # coaching sessions + action items
    ├── goals/             # student goals + milestones
    ├── notifications/     # in-app notifications
    ├── audit/             # admin audit log
    └── health/            # GET /health
prisma/                    # schema, migrations, rich seed
test/                      # e2e tests
```

## Prerequisites

- **Node.js** ≥ 20
- **Yarn** (classic, v1) — `npm install -g yarn`
- **Docker** + **Docker Compose** (for the containerized workflow)
- **PostgreSQL 16** (only if running outside Docker)

## Installation

```bash
yarn install
```

## Environment setup

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

| Variable                 | Description                             | Example                 |
| ------------------------ | --------------------------------------- | ----------------------- |
| `NODE_ENV`               | `development` \| `production` \| `test` | `development`           |
| `PORT`                   | HTTP port                               | `3000`                  |
| `APP_PREFIX`             | Global route prefix                     | `api/v1`                |
| `DATABASE_URL`           | PostgreSQL connection string            | `postgresql://...`      |
| `JWT_SECRET`             | Access-token secret (min 16 chars)      | `change-me-...`         |
| `JWT_ACCESS_EXPIRES_IN`  | Access-token lifetime                   | `15m`                   |
| `JWT_REFRESH_SECRET`     | Refresh-token secret (min 16 chars)     | `change-me-...`         |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime                  | `7d`                    |
| `CORS_ORIGIN`            | Allowed origin(s), comma-separated      | `http://localhost:5173` |

Invalid or missing variables cause the app to fail fast at startup.

## Running the app

```bash
docker compose up -d postgres     # start a local Postgres

yarn prisma migrate deploy        # apply migrations
yarn db:seed                      # optional: rich demo data

yarn dev                          # watch mode
# or
yarn build && yarn start          # production build
```

The API is served at `http://localhost:3000/api/v1` (or whichever `PORT` you set).

## Running with Docker

Run the whole stack (API + database + migrations + seed):

```bash
cp .env.example .env
yarn install
docker compose up --build
```

The app container applies migrations on start and (when `SEED_ON_START=true`)
seeds demo data, then serves the API on **`http://localhost:8000`**
(Swagger at `http://localhost:8000/api/docs`).

## Database, migrations & seed

```bash
yarn db:generate        # regenerate Prisma client
yarn db:migrate         # create + apply a migration (dev)
yarn db:migrate:prod    # apply migrations (prod / CI)
yarn db:seed            # seed rich demo data (idempotent)
yarn db:studio          # open Prisma Studio
```

> Prisma 7 note: the datasource URL lives in `prisma.config.ts` and the
> `PrismaClient` constructor — **never** add a `url` to `prisma/schema.prisma`.

The seed is **idempotent** (it skips if `coordinator@pnc.edu` already exists) and
creates: 1 coordinator, 6 facilitators, and 30 self-assessors across **3 cohorts**
(mixed 1–5 and 1–10 scales), 8 dimensions per cohort, multiple periods with
completed assessments showing improving / stagnant / regressing students (so
coaching flags trigger), plus coaching sessions, goals, notifications, and
achievements.

**Seeded demo accounts** (password `Password123!`):

| Role                | Email                  |
| ------------------- | ---------------------- |
| Program Coordinator | `coordinator@pnc.edu`  |
| Facilitator         | `facilitator@pnc.edu`  |
| Self-Assessor       | `student@pnc.edu`      |

## API documentation (Swagger)

Interactive OpenAPI docs live at:

```
http://localhost:3000/api/docs      # (port 8000 under Docker)
```

Click **Authorize**, paste an access token, and the `Bearer` header is sent with
every request. The bare root path `/` redirects to the docs.

## API overview

Base path `/api/v1`. `Authorization: Bearer <accessToken>` unless marked public.

```
# Auth
POST   /auth/login             (public)  → { accessToken, refreshToken, user }
POST   /auth/refresh           (public)  → { accessToken }
POST   /auth/forgot-password   (public)  → 204 (reset token logged in dev)
POST   /auth/reset-password    (public)  → 204
POST   /auth/register          (public)  → self-assessor signup
GET    /auth/me                          → current user
POST   /auth/logout                      → revoke refresh tokens

# Users (coordinator; list also facilitator)
GET/POST         /users        (?role=&cohortId=&search=&page=)
POST             /users/bulk
GET/PATCH/DELETE /users/:id

# Cohorts / dimensions / periods / assignments (coordinator config)
GET/POST         /cohorts          GET/PATCH /cohorts/:id
GET/POST         /cohorts/:id/dimensions     PATCH/DELETE /dimensions/:id
GET/POST         /cohorts/:id/periods        PATCH /periods/:id   (open/close)
GET/POST         /assignments      GET /facilitators/:id/students

# Assessment lifecycle
GET    /assessments               (?studentId=&periodId=&status=&mine=true)
GET    /assessments/:id
PATCH  /assessments/:id/self       POST /assessments/:id/self/submit
PATCH  /assessments/:id/mentor     POST /assessments/:id/mentor/submit

# Analytics
GET    /analytics/student/:id      GET /analytics/cohort/:id
GET    /analytics/overview         GET /analytics/gap/:assessmentId

# Coaching / goals / notifications / audit
GET/POST         /coaching-sessions   (?facilitatorId=&studentId=&from=&to=)
GET/PATCH/DELETE /coaching-sessions/:id
POST   /coaching-sessions/:id/action-items   PATCH /action-items/:id
GET/POST         /goals               (?studentId=)     PATCH/DELETE /goals/:id
GET    /notifications  (?type=&unread=true)  PATCH /notifications/:id/read  PATCH /notifications/read-all
GET    /audit-logs                 (coordinator only)
```

## Response conventions

**Versioning** — all routes are prefixed with `/api/v1`.

**Single resources** are returned directly. **List endpoints** use a paginated
envelope:

```json
{ "data": [ ], "meta": { "page": 1, "pageSize": 20, "total": 0 } }
```

**Errors** use the standard Nest shape (via `AllExceptionsFilter`, which also maps
known Prisma errors):

```json
{ "statusCode": 400, "message": ["email must be an email"], "error": "Bad Request" }
```

Password hashes are never returned in any response.

## Business logic

- **Period opening** — setting a period to `open` generates a draft assessment
  (one score row per active dimension) for every active student in the cohort and
  sends `assessment_reminder` notifications to the students and their mentors.
- **Self-submission** — a student submits scores + reflections for all active
  dimensions → status `self_submitted`; the assigned mentor is notified.
- **Mentor review** — the mentor records scores, notes, and the **final agreed
  score** per dimension → on submit, status `completed`.
- **Growth analysis** — per-dimension deltas vs. the previous completed period,
  plus overall averages, exposed via the analytics endpoints.
- **Coaching recommendation** — a dimension is flagged when the agreed score is
  ≤ 40% of the cohort scale max, **or** it stagnated/regressed (delta ≤ 0) vs. the
  previous period; the mentor gets a `coaching_reminder`.
- **Coaching scopes** — sessions accept participants individually or in bulk by
  group / class / batch scope (enrolling a whole cohort).
- **Audit** — coordinator mutations are recorded to the audit log.

## Testing

```bash
yarn test         # unit tests (incl. growth-analysis & coaching-flag logic)
yarn test:e2e     # end-to-end (auth/RBAC + full assessment lifecycle + analytics)
yarn test:cov     # unit tests with coverage
```

E2E tests boot the full application against `DATABASE_URL`, bootstrap a
coordinator, and drive the complete flow: cohort/dimension/user setup → period
open → self-submit → mentor complete → coaching flag → analytics → coaching,
goals, notifications, and audit. CI provides a disposable Postgres.

## Available scripts

| Script            | Purpose                     |
| ----------------- | --------------------------- |
| `yarn dev`        | Start in watch mode         |
| `yarn build`      | Compile to `dist/`          |
| `yarn start`      | Run the compiled app        |
| `yarn lint`       | ESLint with autofix         |
| `yarn lint:check` | ESLint without autofix (CI) |
| `yarn format`     | Prettier write              |
| `yarn typecheck`  | `tsc --noEmit`              |
| `yarn test`       | Unit tests                  |
| `yarn test:e2e`   | End-to-end tests            |

## Contributing

### Branching

- `main` — protected, always deployable.
- `feat/<scope>`, `fix/<scope>`, `chore/<scope>` — short-lived branches off `main`.

### Commits — Conventional Commits

Format: `<type>(<scope>): <subject>` — enforced by commitlint via a Git hook.
Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

### Pull requests

1. Branch from `main` and keep PRs focused.
2. Ensure `yarn lint:check`, `yarn typecheck`, `yarn test`, `yarn test:e2e`, and
   `yarn build` all pass (CI enforces this).
3. Update docs/tests alongside code changes.

### Pre-commit hooks

Husky runs `lint-staged` (ESLint + Prettier on staged files) before each commit,
and commitlint validates the commit message.

---

Licensed UNLICENSED — academic thesis project.
