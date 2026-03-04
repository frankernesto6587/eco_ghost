#!/bin/sh
set -e

echo "Running Prisma db push..."
npx prisma db push --schema=schema.prisma --skip-generate --accept-data-loss

echo "Starting API..."
node dist/main.js
