#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-deployment-config/strato-vps.env}"
COMPOSE_FILE="${2:-docker-compose.prod.yml}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

PREVIOUS_TAG_FILE=".last_successful_image_tag"
CURRENT_TAG="$(grep -E '^IMAGE_TAG=' "${ENV_FILE}" | cut -d'=' -f2- || true)"
CURRENT_TAG="${CURRENT_TAG:-latest}"
PREVIOUS_TAG="$(cat "${PREVIOUS_TAG_FILE}" 2>/dev/null || echo latest)"

echo "Deploying IMAGE_TAG=${CURRENT_TAG} using ${COMPOSE_FILE}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" pull

# nginx resolves backend/web only at startup — recreated containers get new IPs → 502 without a restart
restart_nginx() {
  docker compose --env-file "$1" -f "${COMPOSE_FILE}" restart nginx
}

if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans; then
  restart_nginx "${ENV_FILE}"
  echo "${CURRENT_TAG}" > "${PREVIOUS_TAG_FILE}"
  echo "Deployment successful"
  exit 0
fi

echo "Deployment failed. Rolling back to IMAGE_TAG=${PREVIOUS_TAG}"
tmp_env="$(mktemp)"
cp "${ENV_FILE}" "${tmp_env}"
sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=${PREVIOUS_TAG}/" "${tmp_env}" || true
docker compose --env-file "${tmp_env}" -f "${COMPOSE_FILE}" pull
docker compose --env-file "${tmp_env}" -f "${COMPOSE_FILE}" up -d --remove-orphans
restart_nginx "${tmp_env}"
rm -f "${tmp_env}" "${tmp_env}.bak"
echo "Rollback finished"
