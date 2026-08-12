#!/bin/sh
set -e

# Ensure SSL for Render Postgres if not already set
case "$DATABASE_URL" in
  *sslmode=*) ;;
  *render.com*)
    export DATABASE_URL="${DATABASE_URL}?sslmode=require"
    ;;
esac

echo "Prisma generate..."
npx prisma generate

echo "Applying database schema..."
npx prisma db push --accept-data-loss

echo "Seeding (idempotent)..."
npx tsx prisma/seed.ts || echo "Seed skipped/failed (non-fatal)"

echo "Starting API on PORT=${PORT:-4000}..."
exec node dist/main.js
