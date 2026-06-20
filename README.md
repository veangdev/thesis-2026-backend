# PNC Journey Star — Backend API

Backend API for the **PNC Students' Journey Star System** — a multi-role platform
(STUDENT, MENTOR, ADMIN) for student assessments, mentor coaching, and progress
analytics.

Built with **NestJS 11**, **TypeScript**, **Prisma 7**, and **PostgreSQL**.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Architecture overview](#architecture-overview)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment setup](#environment-setup)
- [Running the app](#running-the-app)
- [Running with Docker](#running-with-docker)
- [Database & migrations](#database--migrations)
- [API documentation (Swagger)](#api-documentation-swagger)
- [Testing](#testing)
- [Available scripts](#available-scripts)
- [API conventions](#api-conventions)
- [Adding a new feature module](#adding-a-new-feature-module)
- [Contributing](#contributing)

---

## Tech stack

| Concern         | Choice                                              |
| --------------- | --------------------------------------------------- |
| Framework       | NestJS 11                                           |
| Language        | TypeScript (strict)                                 |
| ORM             | Prisma 7 (`prisma-client` generator + `adapter-pg`) |
| Database        | PostgreSQL 16                                        |
| Auth            | JWT access + rotating refresh tokens (`passport-jwt`) |
| Validation      | `class-validator` / `class-transformer`             |
| API docs        | Swagger / OpenAPI                                   |
| Package manager | **Yarn (classic)** — Yarn only                      |

## Architecture overview

The app follows a layered, modular NestJS architecture:

```
HTTP → Guards (JWT + Roles) → Controller → Service → Repository → Prisma → PostgreSQL
                                   ↑              ↑
                         Validation pipe    Business logic
```

- **Controllers** are thin — they only handle HTTP concerns and delegate to services.
- **Services** hold business logic and never expose password hashes.
- **Repositories** (`BaseRepository` + per-model repos) isolate Prisma from services.
- **Global pipeline** (configured in [`src/app.setup.ts`](src/app.setup.ts)):
  - `helmet` security headers + HTTP request logging
  - Global `JwtAuthGuard` (every route is protected unless marked `@Public()`)
  - Global `RolesGuard` (`@Roles(Role.ADMIN, ...)`)
  - `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
  - `TransformInterceptor` (success envelope) + `AllExceptionsFilter` (error envelope)
- **Config** is centralized and validated at boot ([`src/config`](src/config)).

## Project structure

```
src/
├── app.module.ts          # Root module
├── app.setup.ts           # Shared global HTTP pipeline (used by main + e2e)
├── main.ts                # Bootstrap (Swagger, CORS, listen)
├── common/                # Cross-cutting concerns
│   ├── decorators/        # @Public, @Roles, @CurrentUser
│   ├── enums/             # Role, Status (re-exported from Prisma)
│   ├── filters/           # AllExceptionsFilter
│   ├── guards/            # JwtAuthGuard, RolesGuard
│   ├── interceptors/      # TransformInterceptor
│   ├── interfaces/        # AuthenticatedUser
│   ├── middleware/        # HTTP logger
│   └── repositories/      # BaseRepository
├── config/                # configuration + env validation
├── prisma/                # PrismaService (global module)
└── modules/
    ├── auth/              # register, login, refresh, logout
    ├── users/             # user CRUD (repository-backed)
    └── health/            # GET /health
prisma/                    # schema, migrations, seed
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
| `JWT_ACCESS_SECRET`      | Access-token secret (min 16 chars)      | `change-me-...`         |
| `JWT_ACCESS_EXPIRES_IN`  | Access-token lifetime                   | `15m`                   |
| `JWT_REFRESH_SECRET`     | Refresh-token secret (min 16 chars)     | `change-me-...`         |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime                  | `7d`                    |
| `CORS_ORIGINS`           | Comma-separated allowed origins         | `http://localhost:5173` |

Invalid or missing variables cause the app to fail fast at startup.

## Running the app

```bash
# Start a local Postgres (or use Docker — see below)
docker compose up -d postgres

yarn prisma migrate deploy   # apply migrations
yarn db:seed                 # optional: demo admin/mentor/student

yarn dev                     # watch mode
# or
yarn build && yarn start     # production build
```

The API is served at `http://localhost:3000/api/v1`.

## Running with Docker

A new developer can run the whole stack (API + database + migrations + Swagger)
with three commands:

```bash
cp .env.example .env
yarn install
docker compose up --build
```

On startup the app container automatically applies migrations and (when
`SEED_ON_START=true`) seeds demo users, then serves the API on
`http://localhost:3000`.

**Seeded demo accounts** (password `Admin@1234`):

| Role    | Email                |
| ------- | -------------------- |
| ADMIN   | `admin@pnc.edu.kh`   |
| MENTOR  | `mentor@pnc.edu.kh`  |
| STUDENT | `student@pnc.edu.kh` |

## Database & migrations

```bash
yarn db:generate        # regenerate Prisma client
yarn db:migrate         # create + apply a migration (dev)
yarn db:migrate:prod    # apply migrations (prod / CI)
yarn db:seed            # seed demo data
yarn db:studio          # open Prisma Studio
```

> Prisma 7 note: the datasource URL lives in `prisma.config.ts` and the
> `PrismaClient` constructor — **never** add a `url` to `prisma/schema.prisma`.

## API documentation (Swagger)

Interactive OpenAPI docs are available at:

```
http://localhost:3000/docs
```

Protected endpoints can be tested directly: click **Authorize**, paste an access
token, and the `Bearer` header is sent with every request.

## Testing

```bash
yarn test         # unit tests
yarn test:e2e     # end-to-end tests (requires a reachable Postgres)
yarn test:cov     # unit tests with coverage report
```

E2E tests boot the full application against the database in `DATABASE_URL` and
exercise the auth flow, protected routes, RBAC, validation, and the error
envelope. In CI a disposable Postgres service container is provided.

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

## API conventions

**Versioning** — all routes are prefixed with `/api/v1`.

**Success envelope** (via `TransformInterceptor`):

```json
{ "success": true, "data": { }, "timestamp": "2026-06-20T11:00:00.000Z" }
```

**Error envelope** (via `AllExceptionsFilter`):

```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2026-06-20T11:00:00.000Z",
  "path": "/api/v1/auth/login",
  "message": ["email must be an email"]
}
```

**Authentication** — send `Authorization: Bearer <accessToken>`. Use
`POST /api/v1/auth/refresh` to rotate tokens and `POST /api/v1/auth/logout` to
revoke them. Password hashes are never returned in any response.

## Adding a new feature module

Generate a module that follows the existing convention, then back it with a
repository:

```bash
npx nest g resource modules/<name>
```

Wire its repository into the module's `providers`, keep business logic in the
service, and document endpoints with Swagger decorators.

## Contributing

### Branching strategy

- `main` — protected, always deployable.
- `feat/<scope>`, `fix/<scope>`, `chore/<scope>` — short-lived branches off `main`.

### Commit messages — Conventional Commits

Format: `<type>(<scope>): <subject>` — enforced by commitlint via a Git hook.

```
feat(auth): add refresh token rotation
fix(users): prevent duplicate email on update
chore(ci): cache yarn dependencies
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

### Pull request guidelines

1. Branch from `main` and keep PRs focused.
2. Ensure `yarn lint:check`, `yarn typecheck`, `yarn test`, `yarn test:e2e`, and
   `yarn build` all pass (CI enforces this).
3. Update docs/tests alongside code changes.
4. Use a descriptive, Conventional-Commit-style PR title.

### Pre-commit hooks

Husky runs `lint-staged` (ESLint + Prettier on staged files) before each commit,
and commitlint validates the commit message.

---

Licensed UNLICENSED — academic thesis project.
