# PNC Journey Star — Backend: Session Summary

A handoff document capturing what has been built so far. Read this to understand
the current state of the backend before continuing work.

## Project

Backend API for the **PNC Students' Journey Star System** — students self-assess
across configurable dimensions, mentors review and agree on scores, and the
system tracks growth across cycles and flags coaching needs.

**Stack:** NestJS 11 · TypeScript · Prisma 7 · PostgreSQL 16, JWT auth, Swagger
at `/api/docs`. Built against the fixed frontend API contract in
`docs/journey-star-backend-prompt.md`.

## Three roles (wire keys — must not be renamed)

- `program_coordinator` — admin (users, cohorts, dimensions, periods, analytics)
- `facilitator` — mentor (assigned students, review/score, coaching)
- `self_assessor` — student (own assessments, goals, profile only)

RBAC is enforced by a role guard **and** service-level scoping (students see only
their own data; facilitators only assigned students; coordinators everything).

## What was built — full 9-phase build

- **Phase 0** — Aligned the foundation to the contract: role keys, env vars
  (`JWT_SECRET`, `CORS_ORIGIN`), Swagger `/api/docs`, response envelope,
  `passwordHash`/`isActive` field names.
- **Phase 1** — Full Prisma schema (14 models: User, RefreshToken, Cohort,
  CohortMember, MentorAssignment, Dimension, AssessmentPeriod, Assessment,
  AssessmentScore, CoachingSession + join tables, ActionItem, Goal,
  Notification, Achievement, AuditLog) + single clean init migration (squashed
  the old placeholder migrations).
- **Phase 2** — Auth: login, refresh (non-rotating, returns `{accessToken}` only
  per contract), forgot/reset-password, `/auth/me`, logout.
- **Phase 3** — Domain CRUD: users (bulk + filters), cohorts (`scoringScaleMax`
  5 or 10), dimensions, periods, mentor assignments.
- **Phase 4** — **The core: assessment lifecycle**
  `draft → self_submitted → mentor_review → completed`, with period-open
  auto-generation, notifications, score validation, and the
  coaching-recommendation flag.
- **Phase 5** — Analytics: `/analytics/student/:id`, `/cohort/:id`, `/overview`,
  `/gap/:assessmentId`.
- **Phase 6** — Coaching sessions (individual/group/class/batch scopes) + action
  items, goals, notifications endpoints, and `/audit-logs`.
- **Phase 7** — Rich seed: 1 coordinator, 6 facilitators, 30 students across 3
  mixed-scale cohorts, 8 dimensions each, multiple periods with
  improving/stagnant/regressing trajectories (coaching flags fire), plus
  coaching/goals/notifications/achievements.
- **Phase 8** — Tests (unit for pure logic + service scoping; full-lifecycle
  e2e).
- **Phase 9** — Rewrote README to match the delivered system.

## Two hardening passes (10 review findings, all fixed)

**Security (#1–5):** closed IDOR on `GET /users/:id`; block inactive users at
login + JWT validate; added `@nestjs/throttler` rate-limiting on public auth
routes (skipped in tests); removed open `/auth/register` (users are provisioned
by coordinator); reject placeholder JWT secrets in production.

**Robustness / spec (#6–10):** wrapped lifecycle writes
(`saveSelf`/`saveMentor`/`submitMentor`/`generateForPeriod`) and bulk user create
in **transactions**; **prune** expired/revoked refresh tokens on issue; replaced
ad-hoc audit calls with a **global `AuditInterceptor`** that logs *all*
coordinator mutations; pushed cohort analytics aggregation to **SQL `groupBy`**.

## Structure cleanups

Removed the empty `common/pipes/` folder, and removed the half-adopted
`BaseRepository` + `common/repositories/` folder (only 1 of 9 repos used it) — all
repositories are now consistent plain `@Injectable` classes.

## Key conventions

- **Feature-first structure**: everything for a domain lives in
  `src/modules/<feature>/` (controller, service, repository, dto, module).
  `common/` holds only cross-cutting code.
- **Response envelope**: single resources returned raw; lists as
  `{ data, meta: { page, pageSize, total } }`; errors as Nest-default
  `{ statusCode, message, error }`.
- **Pure logic isolated & unit-tested**: `assessment-logic.ts` (coaching flag)
  and `analytics-logic.ts` (zones/deltas/at-risk) are framework-free.

## Current state

- **All green:** typecheck · lint · **46 unit** · **26 e2e** · build
- Dev DB runs in Docker Postgres on `localhost:5433`; app on port **8000** under
  Docker (3000 local).
- Demo login (password `Password123!`):
  `coordinator@pnc.edu` · `facilitator@pnc.edu` · `student@pnc.edu`.

## ⚠️ Important: nothing is committed

All of the above is uncommitted on `main` (including `@nestjs/throttler` added to
`package.json`, the squashed migration, seed, tests, docs). **A checkpoint commit
is the top priority** for the next session.

## Suggested next steps

1. Commit the work (branch off `main`, logical Conventional-Commit chunks).
2. Optional future items (deferred, not blocking): analytics further
   SQL-optimization for huge datasets; scheduled refresh-token cleanup job;
   broader negative-path test coverage.
