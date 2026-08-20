# Deploying to Google Cloud Run

Runbook for the PNC Journey Star backend. **Nothing here has been run** — these
are the steps to execute when you are ready to deploy.

The Docker setup is unchanged: the same multi-stage `Dockerfile` and the same
`docker-entrypoint.sh` serve local docker-compose and Cloud Run. Only
configuration differs.

| | Local (docker-compose) | Cloud Run |
|---|---|---|
| Database | Postgres container / Auth Proxy on `5433` | Cloud SQL over a Unix socket |
| Port | `PORT=8000` from compose | `PORT` injected by Cloud Run (8080) |
| Migrations | at boot (`RUN_MIGRATIONS` defaults to `true`) | separate step (`RUN_MIGRATIONS=false`) |
| Secrets | `.env` file | Secret Manager |
| Uploads | bind-mounted `uploads/` | in-memory, or a mounted GCS bucket |

---

## 0. Settings used below

```
PROJECT=student-journey-star
REGION=asia-southeast1
INSTANCE=student-journey-star:asia-southeast1:thesis-postgres   # the value your Auth Proxy already uses
SERVICE=pnc-journey-api
REPO=containers
DB=student_journey_star_db     # the database that exists on the instance
DB_USER=thesis_user
```

## 1. Enable APIs (once)

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT"
```

## 2. Runtime service account (once)

Give the service its own identity rather than the default compute account, so
its permissions are exactly "connect to Cloud SQL" and "read these secrets".

```bash
gcloud iam service-accounts create pnc-journey-run \
  --display-name="PNC Journey Star Cloud Run runtime" --project="$PROJECT"

SA="pnc-journey-run@${PROJECT}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

## 3. Secrets

Four values are secret: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`SMTP_PASS`. Everything else is plain configuration.

**Do not** pipe them with `echo "value" | gcloud ...` — that writes the secret
into your shell history. Read them into a variable with `read -rs` (no echo)
and use `printf '%s'` so no trailing newline is stored; a stray `\n` inside a
JWT secret or a connection string produces confusing failures later.

```bash
create_secret() {   # usage: create_secret NAME   (then type/paste the value, Enter)
  local name="$1" value
  read -rs -p "Value for $name: " value; echo
  printf '%s' "$value" | gcloud secrets create "$name" \
    --data-file=- --replication-policy=automatic --project="$PROJECT"
  unset value
}

create_secret pnc-database-url
create_secret pnc-jwt-secret
create_secret pnc-jwt-refresh-secret
create_secret pnc-smtp-pass
```

Generate strong JWT secrets if you do not already have production ones — the
app refuses to start in production if either still contains `change-me`, and
each must be at least 16 characters (`src/config/env.validation.ts`):

```bash
openssl rand -base64 48
```

To rotate later: `gcloud secrets versions add pnc-jwt-secret --data-file=-`.

### The `DATABASE_URL` value

Cloud Run does not expose Cloud SQL over TCP. With
`--add-cloudsql-instances`, it mounts a Unix socket at
`/cloudsql/<INSTANCE_CONNECTION_NAME>`. Pass that path as the `host` query
parameter — `node-postgres` (which backs `@prisma/adapter-pg`) treats a `host`
beginning with `/` as a socket directory and ignores the `@localhost` in the
authority:

```
postgresql://thesis_user:URL_ENCODED_PASSWORD@localhost/student_journey_star_db?host=/cloudsql/student-journey-star:asia-southeast1:thesis-postgres&schema=public
```

- **URL-encode the password.** `@`, `/`, `:`, `?`, `#` and `%` must be
  percent-encoded or the URL parses into the wrong fields. The password in your
  local `.env` is already encoded correctly — copy that exact string rather than
  re-typing the raw password.
- No `sslmode` is needed — the socket is already inside Google's network.
- This is the *only* difference from the proxy URL you use locally
  (`...@localhost:5433/...`); no code change is involved.

## 4. Non-secret configuration

```bash
cp deploy/cloudrun/env.example.yaml deploy/cloudrun/env.production.yaml
# edit CORS_ORIGIN, SMTP_USER, MAIL_FROM
```

`deploy/cloudrun/env.production.yaml` is gitignored. It must not contain any of
the four secrets above.

Do not add `PORT` to it — Cloud Run injects `PORT` and **rejects a deploy that
sets it explicitly**. The app already reads `process.env.PORT`.

## 5. Build and push the image

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION" --project="$PROJECT"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"

gcloud builds submit --tag "$IMAGE" --project="$PROJECT"
```

Tagging with the commit SHA (rather than `:latest`) means the migration job and
the service provably run the same code, and rollbacks are unambiguous.

`.gcloudignore` controls what is uploaded to Cloud Build; `.dockerignore`
controls what enters the image. Neither lets an env file through.

## 6. Apply migrations — before the first deploy, and before every deploy that adds one

`RUN_MIGRATIONS=false` in the Cloud Run config, so the service will **not**
migrate on boot. That is deliberate: a scaled service starts several containers
from one image, each would run `prisma migrate deploy`, they would serialise on
Prisma's advisory lock, and the ones waiting would eat their startup-probe
budget. Run migrations once, explicitly.

**Option A — from your machine through the Auth Proxy you already have.**
Simplest, and it is the path you have already proven works:

```bash
# with cloud-sql-proxy --port 5433 ... running
DATABASE_URL="postgresql://${DB_USER}:URL_ENCODED_PASSWORD@localhost:5433/${DB}?schema=public" \
  yarn prisma migrate deploy
```

**Option B — as a Cloud Run Job**, so migrations run from the same image and
never depend on a developer laptop:

```bash
gcloud run jobs deploy pnc-journey-migrate \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$SA" \
  --set-cloudsql-instances="$INSTANCE" \
  --set-secrets="DATABASE_URL=pnc-database-url:latest" \
  --command=yarn --args=prisma,migrate,deploy \
  --max-retries=0 \
  --project="$PROJECT"

gcloud run jobs execute pnc-journey-migrate --region="$REGION" --wait --project="$PROJECT"
```

`--command` overrides the image's `ENTRYPOINT`, so `docker-entrypoint.sh` is
bypassed entirely and the job does exactly one thing.

### Seeding

`SEED_ON_START=false` in production. The seed creates demo users with known
passwords — run it only if this deployment is a demo, and only deliberately:
add `--args=prisma,db,seed` as a separate job execution. Note the seed also
needs `src/` at runtime, which the image already ships.

## 7. Deploy the service

```bash
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$SA" \
  --add-cloudsql-instances="$INSTANCE" \
  --env-vars-file=deploy/cloudrun/env.production.yaml \
  --set-secrets="DATABASE_URL=pnc-database-url:latest,JWT_SECRET=pnc-jwt-secret:latest,JWT_REFRESH_SECRET=pnc-jwt-refresh-secret:latest,SMTP_PASS=pnc-smtp-pass:latest" \
  --allow-unauthenticated \
  --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=4 \
  --timeout=60 \
  --project="$PROJECT"
```

- `--allow-unauthenticated` makes it a public API; authentication is the app's
  own JWT layer. Drop this flag only if you intend to put IAM in front.
- `--max-instances=4` is a cost and connection-count guard — see below.
- Bump to `--memory=1Gi` if you see the container killed during boot.

Verify:

```bash
URL=$(gcloud run services describe "$SERVICE" --region="$REGION" \
        --format='value(status.url)' --project="$PROJECT")
curl -fsS "$URL/api/v1/health"
```

A healthy response is `{"status":"ok","database":"up",...}`. A 503 means the
app is up but cannot reach Cloud SQL — check the socket path in
`DATABASE_URL`, `--add-cloudsql-instances`, and `roles/cloudsql.client`.

### Startup probe (optional)

Cloud Run's default startup probe is a TCP check on `$PORT`, which passes as
soon as the app is listening. To have a bad database block a rollout, switch it
to an HTTP probe on `/api/v1/health` (Console → the service → Edit → Container
→ Health checks, or `gcloud run services replace` with a YAML spec). Give it a
generous failure threshold; the probe pings the database on every call.

---

## Things to know about this app on Cloud Run

### Uploads are ephemeral

`POST /api/v1/users/me/avatar` writes to disk via multer
(`src/modules/users/users.controller.ts`) and `main.ts` serves that directory
statically. Cloud Run's filesystem is **in-memory and per-instance**: uploaded
avatars disappear on scale-down and are invisible to other instances. They also
count against the container's memory.

For a short demo, `UPLOAD_DIR=/tmp/uploads` is fine. To make uploads survive,
mount a GCS bucket — no code change, the app just reads `UPLOAD_DIR`:

```bash
gcloud storage buckets create "gs://${PROJECT}-uploads" --location="$REGION"
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT}-uploads" \
  --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"

# add to the deploy command:
#   --add-volume=name=uploads,type=cloud-storage,bucket=${PROJECT}-uploads \
#   --add-volume-mount=volume=uploads,mount-path=/mnt/uploads
# and set UPLOAD_DIR: '/mnt/uploads' in env.production.yaml
```

### Connection-pool arithmetic

Each instance opens its own `pg` pool, default max **10** connections. With
`--max-instances=4` that is up to 40 connections; a `db-f1-micro` Cloud SQL
instance allows roughly 25 — and `thesis-postgres` *is* a `db-f1-micro` with no
`max_connections` flag set, so that is your real ceiling. Exceeding it produces
`FATAL: sorry, too many clients already` under load.

Either keep `--max-instances` low (2–4 for a thesis demo), or cap the pool
explicitly — `PrismaPg` accepts a full `pg.PoolConfig`, so this is a two-line
change in `src/prisma/prisma.service.ts`:

```ts
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 5),
});
```

This is **not applied** — it changes local behaviour too, so it is your call.

### Swagger is public

`GET /` redirects to `/api/docs`, and `main.ts` mounts Swagger unconditionally.
Deploying as-is publishes the full API surface. Fine for a thesis demo;
gate it on `NODE_ENV` if you would rather it were not.

### Cold starts

With `--min-instances=0` the first request after idle pays a full Node + Nest
boot plus a database connect. Hit `/api/v1/health` a few minutes before a live
demo, or set `--min-instances=1` (which bills continuously).

### Redeploying

```bash
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"
gcloud builds submit --tag "$IMAGE" --project="$PROJECT"
# if the change includes a new migration, run step 6 first
gcloud run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" --project="$PROJECT"
```

Existing env vars, secrets and the Cloud SQL attachment are retained across a
deploy that only changes `--image`.
