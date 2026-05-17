#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

docker compose -f docker-compose.prod.yml --env-file .env.prod config
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
