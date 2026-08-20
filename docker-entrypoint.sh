#!/bin/sh
set -e

# Migrations run at boot by default, which is what docker-compose and any
# single-container deployment want. Set RUN_MIGRATIONS=false where the platform
# starts several containers from the same image — on Cloud Run every cold-started
# instance would otherwise run `migrate deploy`, serialise on Prisma's advisory
# lock, and spend its startup-probe budget waiting its turn. There, migrations
# are applied once as a separate step (see docs/cloud-run-deployment.md).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "→ Applying database migrations..."
  yarn prisma migrate deploy
else
  echo "→ Skipping migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)"
fi

if [ "$SEED_ON_START" = "true" ]; then
  echo "→ Seeding database..."
  yarn prisma db seed
fi

echo "→ Starting application..."
exec "$@"
