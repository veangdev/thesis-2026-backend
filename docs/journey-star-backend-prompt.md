# Claude Code Prompt — Journey Star BACKEND (Repo 1 of 2)

> **How to use:** Run this in your backend repository. A matching frontend prompt exists for the other repo — both follow the shared API contract in §6, so keep endpoint paths, payload shapes, and role keys exactly as specified.

---

## 1. Role & Objective

You are a senior backend engineer. Build the REST API for **PNC Students' Journey Star System** — a student growth-tracking platform where students self-assess across configurable dimensions, mentors review and record agreed scores, and the system analyzes growth across assessment cycles and recommends coaching.

## 2. Tech Stack (use exactly this)

- **Framework:** NestJS (latest stable) + TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma (schema-first, with migrations)
- **Auth:** JWT (access + refresh tokens), bcrypt password hashing, role-based guards
- **Validation:** class-validator DTOs on every endpoint
- **Docs:** Swagger/OpenAPI auto-generated at `/api/docs`
- **Config:** `.env` via `@nestjs/config` (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`, `CORS_ORIGIN`)
- **CORS:** enabled, origin from `CORS_ORIGIN` (the frontend dev server, default `http://localhost:5173`)
- **Seeding:** Prisma seed script with rich demo data (see §7)

## 3. Roles & Permissions

Three roles (system keys → UI labels):
- `program_coordinator` → Program Coordinator (manager): full admin — users, cohorts, dimensions, scales, periods, all analytics.
- `facilitator` → Facilitator (mentor): manage assigned students, review/score assessments, run coaching sessions, view own-student analytics.
- `self_assessor` → Self-Assessor (student): own self-assessments, own reports/goals/profile only.

Enforce with a `@Roles()` decorator + guard. Students must never read other students' data; mentors only their assigned students; coordinators everything.

## 4. Data Model (Prisma schema)

- **User** — id, name, email (unique), passwordHash, role, avatarUrl?, expertiseTags (string[], mentors), isActive, timestamps.
- **Cohort** — id, name, startDate, expectedEndDate (~2 years later), scoringScaleMax (**default 5, allow 5 or 10**).
- **CohortMember** — userId, cohortId (students belong to a cohort).
- **MentorAssignment** — facilitatorId, selfAssessorId, cohortId, active.
- **Dimension** — id, cohortId, name, description, order, isActive. **Configurable per cohort**: default set seeded, coordinators can add/rename/deactivate.
- **AssessmentPeriod** — id, cohortId, name (e.g., "Cycle 2 — Mid-Year"), startDate, endDate, status (`upcoming` | `open` | `closed`). **Not fixed** — coordinators create any number, any timing.
- **Assessment** — id, studentId, periodId, status (`draft` | `self_submitted` | `mentor_review` | `agreed` | `completed`), submittedAt?, mentorSubmittedAt?.
- **AssessmentScore** — assessmentId, dimensionId, selfScore?, selfReflection?, mentorScore?, mentorNote?, agreedScore?, coachingRecommended (bool). Scores validated against the cohort's scale (1..scoringScaleMax).
- **CoachingSession** — id, title, scope (`individual` | `group` | `class` | `batch`), facilitatorId, scheduledAt, durationMinutes, notes, status (`scheduled` | `completed` | `cancelled`); relations: participants (students), targetDimensions.
- **ActionItem** — sessionId, description, dueDate?, done.
- **Goal** — studentId, title, description, targetDimensionId?, dueDate?, progressPercent, milestones (JSON or child table).
- **Notification** — userId, type (`assessment_reminder` | `coaching_reminder` | `achievement` | `submission` | `system`), title, body, readAt?, createdAt.
- **Achievement** — studentId, key, title, earnedAt.
- **AuditLog** — actorId, action, entity, entityId, metadata JSON, createdAt (write on all admin mutations).

## 5. Business Logic (implement as services, not just CRUD)

1. **Period opening** — when a coordinator sets a period to `open`, generate draft assessments for every active student in the cohort and create `assessment_reminder` notifications for those students and their mentors.
2. **Self-submission** — student submits scores + reflections for all active dimensions → status `self_submitted`; notify the assigned mentor (`submission`).
3. **Mentor review** — mentor records mentorScore, notes, and the **final agreed score** per dimension → on submit, status `completed`.
4. **Growth analysis** (on completion) — compute per-dimension delta vs. the student's previous completed period and overall average. Expose via the analytics endpoints.
5. **Coaching recommendation** — flag a dimension when agreedScore ≤ 40% of scale max, OR delta ≤ 0 vs. previous period (stagnation/regression). Set `coachingRecommended = true` and create a `coaching_reminder` notification for the mentor.
6. **Coaching scopes** — sessions accept participants individually or in bulk by group/class/batch scope.

## 6. API Contract (the frontend is built against exactly this — do not rename)

Base path `/api/v1`. JSON everywhere. Auth via `Authorization: Bearer <token>`.

```
POST   /auth/login            { email, password } → { accessToken, refreshToken, user }
POST   /auth/refresh          { refreshToken } → { accessToken }
POST   /auth/forgot-password  { email } → 204 (log token in dev)
POST   /auth/reset-password   { token, newPassword } → 204
GET    /auth/me               → User

GET/POST        /users                 (coordinator; ?role=&cohortId=&search=&page=)
GET/PATCH/DELETE /users/:id
POST   /users/bulk                     (bulk create/assign)

GET/POST        /cohorts
GET/PATCH       /cohorts/:id           (PATCH includes scoringScaleMax)
GET/POST        /cohorts/:id/dimensions
PATCH/DELETE    /dimensions/:id
GET/POST        /cohorts/:id/periods
PATCH           /periods/:id           (open/close)

GET/POST        /assignments           (mentor↔student; coordinator)
GET             /facilitators/:id/students

GET    /assessments                    (?studentId=&periodId=&status=&mine=true)
GET    /assessments/:id                (includes scores[] with dimension info)
PATCH  /assessments/:id/self           (save draft scores/reflections)
POST   /assessments/:id/self/submit
PATCH  /assessments/:id/mentor         (mentor scores/notes/agreed)
POST   /assessments/:id/mentor/submit

GET    /analytics/student/:id          (radar data per period, trends, gaps, zone per dimension)
GET    /analytics/cohort/:id           (heatmap, weakest dimensions, completion rates, at-risk students)
GET    /analytics/overview             (coordinator KPIs, activity trends, mentor workload/effectiveness)
GET    /analytics/gap/:assessmentId    (self vs mentor per dimension)

GET/POST        /coaching-sessions     (?facilitatorId=&studentId=&from=&to=)
GET/PATCH/DELETE /coaching-sessions/:id
POST   /coaching-sessions/:id/action-items
PATCH  /action-items/:id

GET/POST        /goals                 (?studentId=)
PATCH/DELETE    /goals/:id

GET    /notifications                  (?type=&unread=true)
PATCH  /notifications/:id/read
PATCH  /notifications/read-all

GET    /audit-logs                     (coordinator only)
```

Response envelope for lists: `{ data: [...], meta: { page, pageSize, total } }`. Errors: `{ statusCode, message, error }` (Nest default).

## 7. Seed Data

Seed: 1 coordinator, 6 facilitators, 30 self-assessors across 3 cohorts (mixed 1–5 and 1–10 scales to prove configurability), 8 default dimensions per cohort, 3–4 periods per cohort with completed assessments showing improving, stagnant, and regressing students (so coaching flags trigger), a handful of coaching sessions, goals, notifications, achievements. Demo credentials (document in README): `coordinator@pnc.edu` / `facilitator@pnc.edu` / `student@pnc.edu`, password `Password123!`.

## 8. Quality & Delivery

- Unit tests for the growth-analysis and coaching-flag logic at minimum; e2e test for the full assessment lifecycle.
- Consistent module structure: `auth`, `users`, `cohorts`, `assessments`, `analytics`, `coaching`, `goals`, `notifications`.
- README: setup, env vars, migration + seed commands (`npm run db:migrate`, `npm run db:seed`), run instructions, Swagger URL, demo credentials.
- Build order: scaffold + Prisma schema + migrations → auth/roles → users/cohorts/dimensions/periods → assessment lifecycle → analytics → coaching/goals/notifications → seed → tests → docs. Verify each phase compiles and runs before continuing.
