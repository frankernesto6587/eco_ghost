#!/bin/sh
set -e

# Migraciones versionadas en migrations/ (antes: db push --accept-data-loss).
# Una base que ya existia antes de las migraciones tiene que marcarse una vez:
#   npx prisma migrate resolve --schema=schema.prisma --applied 0_init
# Si no, migrate deploy falla con P3005 y el contenedor no arranca (a proposito:
# mejor no arrancar que tocar una base que no reconoce).
echo "Running Prisma migrate deploy..."
npx prisma migrate deploy --schema=schema.prisma

echo "Starting API..."
node dist/main.js
