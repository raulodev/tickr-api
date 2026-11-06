#!/bin/sh
set -e

echo "Running migrations..."
pnpm exec prisma migrate deploy --config prisma7.config.ts

echo "Initializing the app..."
exec "$@"