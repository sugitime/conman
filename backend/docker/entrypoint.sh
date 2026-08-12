#!/bin/sh
set -e
echo "Applying database schema..."
npx prisma db push --skip-generate --accept-data-loss
echo "Seeding (idempotent)..."
npx tsx prisma/seed.ts || true
echo "Starting API on PORT=${PORT:-4000}..."
exec node dist/main.js
