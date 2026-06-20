#!/bin/sh
set -e

echo "→ Applying database migrations..."
yarn prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "→ Seeding database..."
  yarn prisma db seed
fi

echo "→ Starting application..."
exec "$@"
