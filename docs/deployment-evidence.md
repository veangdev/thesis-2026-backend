# Deployment evidence — links for thesis documentation

Direct links to the deployed system. Bookmark this instead of navigating the
Google Cloud console menus.

**Project:** `student-journey-star`  **Region:** `asia-southeast1`
**Service:** `pnc-journey-api`  **Database:** `thesis-postgres` / `student_journey_star_db`

---

## 1. The live API (best screenshots — clean UI)

| What | Link |
|---|---|
| **Swagger API docs** — every endpoint, grouped by module | https://pnc-journey-api-mzqbbfhf5q-as.a.run.app/api/docs |
| Health check — proves the app reached Cloud SQL | https://pnc-journey-api-mzqbbfhf5q-as.a.run.app/api/v1/health |
| Base URL (redirects to the docs) | https://pnc-journey-api-mzqbbfhf5q-as.a.run.app |

The Swagger page is the strongest single screenshot: it shows the API is
deployed, publicly reachable, and documents the whole interface at once.

## 2. Cloud Run — the hosting

| What | Link |
|---|---|
| Service overview + traffic/latency charts | https://console.cloud.google.com/run/detail/asia-southeast1/pnc-journey-api/metrics?project=student-journey-star |
| Revisions (deployment history) | https://console.cloud.google.com/run/detail/asia-southeast1/pnc-journey-api/revisions?project=student-journey-star |
| Logs (startup + request logs) | https://console.cloud.google.com/run/detail/asia-southeast1/pnc-journey-api/logs?project=student-journey-star |
| Full YAML config — good as a thesis appendix | https://console.cloud.google.com/run/detail/asia-southeast1/pnc-journey-api/yaml?project=student-journey-star |

## 3. Cloud SQL — the database

| What | Link |
|---|---|
| Instance overview (version, tier, region) | https://console.cloud.google.com/sql/instances/thesis-postgres/overview?project=student-journey-star |
| **SQL Studio** — run queries, browse tables in the browser | https://console.cloud.google.com/sql/instances/thesis-postgres/studio?project=student-journey-star |
| Databases list | https://console.cloud.google.com/sql/instances/thesis-postgres/databases?project=student-journey-star |
| Users | https://console.cloud.google.com/sql/instances/thesis-postgres/users?project=student-journey-star |

### Nicer database screenshots — Prisma Studio

The console has no good table browser. Prisma Studio gives a clean table view
of the **same** Cloud SQL data, and looks much better in a document:

```bash
cloud-sql-proxy --port 5433 student-journey-star:asia-southeast1:thesis-postgres &
cd ~/Desktop/PNC-Journey-Star/thesis-2026-backend
yarn db:studio          # opens http://localhost:5555
```

For a schema diagram rather than data, screenshot `prisma/schema.prisma`, or
run this in SQL Studio to list every table:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

## 4. Supporting infrastructure

| What | Link |
|---|---|
| Artifact Registry — the container image | https://console.cloud.google.com/artifacts/docker/student-journey-star/asia-southeast1/containers?project=student-journey-star |
| Cloud Build history — build logs | https://console.cloud.google.com/cloud-build/builds?project=student-journey-star |
| Secret Manager — names only, no values | https://console.cloud.google.com/security/secret-manager?project=student-journey-star |
| IAM — service accounts and roles | https://console.cloud.google.com/iam-admin/iam?project=student-journey-star |

---

## Before you screenshot — two cautions

**Never capture a secret value.** The Secret Manager *list* page shows only
names and is safe. Do not click "View secret value" while capturing. The Cloud
Run YAML page shows secret *references* (`pnc-jwt-secret:latest`), not the
values — also safe.

**Watch for personal data.** Prisma Studio and SQL Studio show real rows,
including user email addresses and password hashes. Blur or redact them, or
screenshot an empty/demo table instead. A thesis is a public document.
