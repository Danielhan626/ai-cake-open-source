#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-203.0.113.10}"
DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/aicake_aliyun_ed25519}"
APP_DIR="${APP_DIR:-/opt/aicake}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-example.com}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://${DEPLOY_DOMAIN}}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
COMMERCIAL_RUNTIME_REQUIRED="${COMMERCIAL_RUNTIME_REQUIRED:-0}"
ARCHIVE="/tmp/aicake-${RELEASE_ID}.tgz"

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  echo "scp is required" >&2
  exit 1
fi

echo "Preparing deploy for release ${RELEASE_ID}..."
echo "Archive: ${ARCHIVE}"
echo "Public origin: ${PUBLIC_ORIGIN}"

echo "Packing release ${RELEASE_ID}..."
tar \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./apps/api/dist' \
  --exclude='./apps/api/data' \
  --exclude='./apps/web-preview/dist' \
  --exclude='./apps/miniprogram/miniprogram_npm' \
  --exclude='./apps/miniprogram/dist' \
  --exclude='./materials' \
  --exclude='./.env' \
  --exclude='./.env.local' \
  --exclude='./.logs' \
  --exclude='./.DS_Store' \
  -czf "${ARCHIVE}" .

echo "Uploading release to ${DEPLOY_USER}@${DEPLOY_HOST}:${APP_DIR}..."
ssh -i "${SSH_KEY}" -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p '${APP_DIR}/incoming'"
scp -i "${SSH_KEY}" -P "${SSH_PORT}" "${ARCHIVE}" "${DEPLOY_USER}@${DEPLOY_HOST}:${APP_DIR}/incoming/aicake-${RELEASE_ID}.tgz"

echo "Installing release on server..."
ssh -i "${SSH_KEY}" -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "APP_DIR='${APP_DIR}' RELEASE_ID='${RELEASE_ID}' DEPLOY_HOST='${DEPLOY_HOST}' DEPLOY_DOMAIN='${DEPLOY_DOMAIN}' PUBLIC_ORIGIN='${PUBLIC_ORIGIN}' COMMERCIAL_RUNTIME_REQUIRED='${COMMERCIAL_RUNTIME_REQUIRED}' bash -s" <<'REMOTE'
set -euo pipefail

apt-get update
apt-get install -y ca-certificates curl build-essential openssl nginx

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -Eq '^v2[024]\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "${APP_DIR}/releases/${RELEASE_ID}" "${APP_DIR}/shared/api-data" "${APP_DIR}/shared/logs"
tar -xzf "${APP_DIR}/incoming/aicake-${RELEASE_ID}.tgz" -C "${APP_DIR}/releases/${RELEASE_ID}"

ln -sfn "${APP_DIR}/shared/api-data" "${APP_DIR}/releases/${RELEASE_ID}/data"
rm -rf "${APP_DIR}/releases/${RELEASE_ID}/apps/api/data"
ln -sfn "${APP_DIR}/shared/api-data" "${APP_DIR}/releases/${RELEASE_ID}/apps/api/data"

ENV_FILE="${APP_DIR}/shared/api.env"
if [ ! -f "${ENV_FILE}" ]; then
  ADMIN_PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
APP_ENV=production
PORT=4000
APP_ORIGIN=${PUBLIC_ORIGIN}
APP_RELEASE_ID=${RELEASE_ID}
LOCATION_MODE=optional_auto_city
AI_PROVIDER=mock
PAY_PROVIDER=mock
WECHAT_APP_ID=wx0000000000000000
WECHAT_APP_SECRET=
WECHAT_MCH_ID=mock_mch_id
WECHAT_PAY_NOTIFY_URL=${PUBLIC_ORIGIN}/payments/wechat/notify
WECHAT_PAY_MERCHANT_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY_PEM=
WECHAT_PAY_PUBLIC_KEY_ID=
WECHAT_PAY_PUBLIC_KEY_PEM=
WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO=
WECHAT_PAY_PLATFORM_CERTIFICATE_PEM=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_BASE_URL=https://api.mch.weixin.qq.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
INCLUDE_SEED_BAKERS_IN_PUBLIC=0
EOF
  chmod 600 "${ENV_FILE}"
fi

upsert_env() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    awk -v k="${key}" -v v="${value}" '
      index($0, k "=") == 1 { print k "=" v; next }
      { print }
    ' "${ENV_FILE}" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

ensure_env_default() {
  key="$1"
  value="$2"
  if ! grep -q "^${key}=" "${ENV_FILE}" || grep -q "^${key}=$" "${ENV_FILE}"; then
    upsert_env "${key}" "${value}"
  fi
}

upsert_env "APP_ORIGIN" "${PUBLIC_ORIGIN}"
upsert_env "APP_RELEASE_ID" "${RELEASE_ID}"
upsert_env "LOCATION_MODE" "optional_auto_city"
upsert_env "WECHAT_PAY_NOTIFY_URL" "${PUBLIC_ORIGIN}/payments/wechat/notify"
upsert_env "INCLUDE_SEED_BAKERS_IN_PUBLIC" "0"
ensure_env_default "ADMIN_USERNAME" "admin"
ensure_env_default "WECHAT_PAY_MERCHANT_SERIAL_NO" ""
ensure_env_default "WECHAT_PAY_PRIVATE_KEY_PEM" ""
ensure_env_default "WECHAT_PAY_PUBLIC_KEY_ID" ""
ensure_env_default "WECHAT_PAY_PUBLIC_KEY_PEM" ""
ensure_env_default "WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO" ""
ensure_env_default "WECHAT_PAY_PLATFORM_CERTIFICATE_PEM" ""
ensure_env_default "WECHAT_PAY_API_V3_KEY" ""
ensure_env_default "WECHAT_PAY_BASE_URL" "https://api.mch.weixin.qq.com"
chmod 600 "${ENV_FILE}"

get_env_value() {
  key="$1"
  awk -v k="${key}" '
    index($0, k "=") == 1 {
      print substr($0, length(k) + 2)
      found = 1
      exit
    }
    END {
      if (!found) print ""
    }
  ' "${ENV_FILE}"
}

fail_commercial_runtime() {
  message="$1"
  echo "Commercial deploy blocked: ${message}" >&2
  echo "Update ${ENV_FILE} with real production values and rerun with COMMERCIAL_RUNTIME_REQUIRED=1." >&2
  exit 1
}

require_nonempty_env() {
  key="$1"
  value="$(get_env_value "${key}")"
  if [ -z "${value}" ]; then
    fail_commercial_runtime "${key} is empty"
  fi
}

require_exact_env() {
  key="$1"
  expected="$2"
  value="$(get_env_value "${key}")"
  if [ "${value}" != "${expected}" ]; then
    fail_commercial_runtime "${key} must equal ${expected}, observed ${value:-<empty>}"
  fi
}

require_not_value() {
  key="$1"
  blocked="$2"
  value="$(get_env_value "${key}")"
  if [ -z "${value}" ] || [ "${value}" = "${blocked}" ]; then
    fail_commercial_runtime "${key} must not be ${blocked}"
  fi
}

has_env_pair() {
  key_a="$1"
  key_b="$2"
  value_a="$(get_env_value "${key_a}")"
  value_b="$(get_env_value "${key_b}")"
  if [ -n "${value_a}" ] && [ -n "${value_b}" ]; then
    return 0
  fi
  return 1
}

if [ "${COMMERCIAL_RUNTIME_REQUIRED}" = "1" ]; then
  require_nonempty_env "WECHAT_APP_SECRET"
  require_exact_env "PAY_PROVIDER" "wechat"
  require_not_value "WECHAT_MCH_ID" "mock_mch_id"
  require_nonempty_env "WECHAT_PAY_MERCHANT_SERIAL_NO"
  require_nonempty_env "WECHAT_PAY_PRIVATE_KEY_PEM"
  require_nonempty_env "WECHAT_PAY_API_V3_KEY"
  if ! has_env_pair "WECHAT_PAY_PUBLIC_KEY_ID" "WECHAT_PAY_PUBLIC_KEY_PEM" && ! has_env_pair "WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO" "WECHAT_PAY_PLATFORM_CERTIFICATE_PEM"; then
    fail_commercial_runtime "either WeChat Pay public key mode or platform certificate mode must be configured"
  fi
fi

cd "${APP_DIR}/releases/${RELEASE_ID}"
npm ci
npm run build

ln -sfn "${APP_DIR}/releases/${RELEASE_ID}" "${APP_DIR}/current"

NPM_BIN="$(command -v npm)"
cat > /etc/systemd/system/aicake-api.service <<EOF
[Unit]
Description=Ruyi Fruit Cake API
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/current
EnvironmentFile=${ENV_FILE}
ExecStart=${NPM_BIN} --workspace apps/api run start
Restart=always
RestartSec=5
StandardOutput=append:${APP_DIR}/shared/logs/api.log
StandardError=append:${APP_DIR}/shared/logs/api.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable aicake-api
systemctl restart aicake-api

CERT_FULLCHAIN="/etc/letsencrypt/live/${DEPLOY_DOMAIN}/fullchain.pem"
CERT_PRIVKEY="/etc/letsencrypt/live/${DEPLOY_DOMAIN}/privkey.pem"

if [ -f "${CERT_FULLCHAIN}" ] && [ -f "${CERT_PRIVKEY}" ]; then
cat > /etc/nginx/sites-available/aicake-api <<EOF
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name ${DEPLOY_DOMAIN} www.${DEPLOY_DOMAIN} _;

  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl http2 default_server;
  listen [::]:443 ssl http2 default_server;
  server_name ${DEPLOY_DOMAIN} www.${DEPLOY_DOMAIN};

  ssl_certificate ${CERT_FULLCHAIN};
  ssl_certificate_key ${CERT_PRIVKEY};

  client_max_body_size 20m;

  location = /ops {
    return 301 /ops/;
  }

  location /ops/ {
    alias ${APP_DIR}/current/apps/web-preview/dist/;
    index index.html;
    try_files \$uri \$uri/ /ops/index.html;
  }

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
else
cat > /etc/nginx/sites-available/aicake-api <<EOF
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name ${DEPLOY_DOMAIN} www.${DEPLOY_DOMAIN} _;

  client_max_body_size 20m;

  location = /ops {
    return 301 /ops/;
  }

  location /ops/ {
    alias ${APP_DIR}/current/apps/web-preview/dist/;
    index index.html;
    try_files \$uri \$uri/ /ops/index.html;
  }

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
fi
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/aicake-api /etc/nginx/sites-enabled/aicake-api
nginx -t
systemctl enable nginx
systemctl restart nginx

sleep 2
systemctl --no-pager --full status aicake-api
REMOTE

rm -f "${ARCHIVE}"

echo "Deployment finished for release ${RELEASE_ID}."
echo "Post-deploy verify:"
echo "  EXPECTED_RELEASE_ID=${RELEASE_ID} npm run live:commercial-readiness"
echo "  curl -fsSL ${PUBLIC_ORIGIN}/health"
