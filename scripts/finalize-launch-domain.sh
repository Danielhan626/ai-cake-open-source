#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-203.0.113.10}"
DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/aicake_aliyun_ed25519}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-example.com}"
INCLUDE_WWW="${INCLUDE_WWW:-0}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
DNS_CHECK_SERVERS="${DNS_CHECK_SERVERS:-8.8.8.8 1.1.1.1 223.5.5.5}"

if ! command -v dig >/dev/null 2>&1; then
  echo "dig is required to verify DNS before certificate issuance" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

resolve_a() {
  local host="$1"
  {
    dig +short "${host}" A || true
    for server in ${DNS_CHECK_SERVERS}; do
      dig @"${server}" +short "${host}" A || true
    done
  } | awk 'NF { print }'
}

require_dns_target() {
  local host="$1"
  local expected="$2"
  local resolved
  resolved="$(resolve_a "${host}" | sort -u | tr '\n' ' ')"
  if ! printf '%s\n' "${resolved}" | grep -qw "${expected}"; then
    echo "DNS not ready: ${host} A resolved to '${resolved:-<empty>}', expected ${expected}" >&2
    exit 2
  fi
}

echo "Checking DNS for ${DEPLOY_DOMAIN}..."
require_dns_target "${DEPLOY_DOMAIN}" "${DEPLOY_HOST}"

DOMAIN_ARGS=(-d "${DEPLOY_DOMAIN}")
if [ "${INCLUDE_WWW}" = "1" ]; then
  echo "Checking DNS for www.${DEPLOY_DOMAIN}..."
  require_dns_target "www.${DEPLOY_DOMAIN}" "${DEPLOY_HOST}"
  DOMAIN_ARGS+=(-d "www.${DEPLOY_DOMAIN}")
fi

REMOTE_DOMAIN_ARGS=""
for arg in "${DOMAIN_ARGS[@]}"; do
  REMOTE_DOMAIN_ARGS+=" $(printf '%q' "${arg}")"
done

if [ -n "${CERTBOT_EMAIL}" ]; then
  REMOTE_EMAIL_ARGS="--email $(printf '%q' "${CERTBOT_EMAIL}")"
else
  REMOTE_EMAIL_ARGS="--register-unsafely-without-email"
fi

echo "Issuing or renewing Let's Encrypt certificate for ${DEPLOY_DOMAIN} on ${DEPLOY_HOST}..."
ssh -i "${SSH_KEY}" -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "REMOTE_DOMAIN_ARGS='${REMOTE_DOMAIN_ARGS}' REMOTE_EMAIL_ARGS='${REMOTE_EMAIL_ARGS}' bash -s" <<'REMOTE'
set -euo pipefail

apt-get update
apt-get install -y certbot python3-certbot-nginx

# shellcheck disable=SC2086
certbot certonly --nginx --non-interactive --agree-tos ${REMOTE_EMAIL_ARGS} ${REMOTE_DOMAIN_ARGS}
REMOTE

echo "Refreshing deployment so Nginx uses the issued certificate..."
DEPLOY_HOST="${DEPLOY_HOST}" \
DEPLOY_USER="${DEPLOY_USER}" \
SSH_PORT="${SSH_PORT}" \
SSH_KEY="${SSH_KEY}" \
DEPLOY_DOMAIN="${DEPLOY_DOMAIN}" \
./scripts/deploy-aliyun-ecs.sh

echo "Verifying HTTPS health..."
curl -fsS --max-time 20 --resolve "${DEPLOY_DOMAIN}:443:${DEPLOY_HOST}" "https://${DEPLOY_DOMAIN}/health"
echo
echo "Launch domain finalized: https://${DEPLOY_DOMAIN}/health"
