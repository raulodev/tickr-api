#!/bin/sh
set -e

echo "Running migrations..."
node_modules/.bin/prisma migrate deploy --config prisma7.config.ts

echo "Initializing the app..."
exec "$@"