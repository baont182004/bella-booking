#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

docker compose -f docker-compose.prod.yml --env-file .env.prod restart "$@"
