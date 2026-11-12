#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if curl --fail --silent --max-time 2 http://127.0.0.1:8080/swagger/openapi.json >/dev/null; then
  printf '%s\n' 'The game server is already running on port 8080.'
  exit 0
fi

if [[ ! -f gradlew || ! -f docker/docker-compose.yaml ]]; then
  printf '%s\n' 'Run this helper from the backend repository mobile/ submodule, or start the backend separately and configure the app Connection address.' >&2
  exit 1
fi

docker compose --env-file /dev/null -f docker/docker-compose.yaml up -d --wait redis dynamodb
if [[ "$(uname -s)" == Darwin ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 11)"
fi
./gradlew :server:installDist
export JWT_SECRET="${JWT_SECRET:-$(python3 -c 'import secrets; print(secrets.token_hex(32))')}"
export DYNAMODB_MODE=local
export DYNAMODB_ENDPOINT=http://127.0.0.1:8000
export REDIS_HOST=127.0.0.1
export GAME_TABLE="${GAME_TABLE:-mini_mobile_demo}"
export HTTP_PORT=8080
exec server/build/install/mini-game-server/bin/mini-game-server
