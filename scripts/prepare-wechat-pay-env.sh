#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/aicake/shared/api.env"
PUBLIC_ORIGIN="https://example.com"
WECHAT_APP_ID_VALUE=""
WECHAT_APP_SECRET_VALUE=""
WECHAT_MCH_ID_VALUE=""
WECHAT_PAY_NOTIFY_URL_VALUE=""
WECHAT_PAY_MERCHANT_SERIAL_NO_VALUE=""
WECHAT_PAY_MERCHANT_CERTIFICATE_FILE_VALUE=""
WECHAT_PAY_PRIVATE_KEY_FILE_VALUE=""
WECHAT_PAY_PUBLIC_KEY_ID_VALUE=""
WECHAT_PAY_PUBLIC_KEY_FILE_VALUE=""
WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE=""
WECHAT_PAY_PLATFORM_CERTIFICATE_FILE_VALUE=""
WECHAT_PAY_API_V3_KEY_VALUE=""
PAY_PROVIDER_VALUE="wechat"
DRY_RUN="0"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/prepare-wechat-pay-env.sh \
    --env-file /opt/aicake/shared/api.env \
    --app-id wx0000000000000000 \
    --app-secret '<wechat-app-secret>' \
    --mch-id your_mch_id \
    --merchant-serial-no '<merchant-serial-no>' \
    --merchant-certificate-file /secure/path/apiclient_cert.pem \
    --merchant-private-key-file /secure/path/apiclient_key.pem \
    --public-key-id '<wechat-pay-public-key-id>' \
    --public-key-file /secure/path/wechatpay_public_key.pem \
    --platform-certificate-serial-no '<platform-certificate-serial-no>' \
    --platform-certificate-file /secure/path/wechatpay_certificate.pem \
    --api-v3-key '<32-char-api-v3-key>' \
    --notify-url 'https://example.com/payments/wechat/notify'

Notes:
  - This script updates an env file in place and does not print secret values.
  - PEM files are converted into single-line env-safe values with literal \n separators.
  - Use --dry-run to validate inputs and show which keys would be updated.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --public-origin)
      PUBLIC_ORIGIN="$2"
      shift 2
      ;;
    --app-id)
      WECHAT_APP_ID_VALUE="$2"
      shift 2
      ;;
    --app-secret)
      WECHAT_APP_SECRET_VALUE="$2"
      shift 2
      ;;
    --mch-id)
      WECHAT_MCH_ID_VALUE="$2"
      shift 2
      ;;
    --merchant-serial-no)
      WECHAT_PAY_MERCHANT_SERIAL_NO_VALUE="$2"
      shift 2
      ;;
    --merchant-certificate-file)
      WECHAT_PAY_MERCHANT_CERTIFICATE_FILE_VALUE="$2"
      shift 2
      ;;
    --merchant-private-key-file)
      WECHAT_PAY_PRIVATE_KEY_FILE_VALUE="$2"
      shift 2
      ;;
    --public-key-id)
      WECHAT_PAY_PUBLIC_KEY_ID_VALUE="$2"
      shift 2
      ;;
    --public-key-file)
      WECHAT_PAY_PUBLIC_KEY_FILE_VALUE="$2"
      shift 2
      ;;
    --platform-certificate-serial-no)
      WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE="$2"
      shift 2
      ;;
    --platform-certificate-file)
      WECHAT_PAY_PLATFORM_CERTIFICATE_FILE_VALUE="$2"
      shift 2
      ;;
    --api-v3-key)
      WECHAT_PAY_API_V3_KEY_VALUE="$2"
      shift 2
      ;;
    --notify-url)
      WECHAT_PAY_NOTIFY_URL_VALUE="$2"
      shift 2
      ;;
    --pay-provider)
      PAY_PROVIDER_VALUE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_nonempty() {
  local value="$1"
  local label="$2"
  if [ -z "$value" ]; then
    echo "${label} is required" >&2
    exit 1
  fi
}

require_file() {
  local path="$1"
  local label="$2"
  if [ ! -f "$path" ]; then
    echo "${label} not found: ${path}" >&2
    exit 1
  fi
}

pem_to_env_value() {
  local path="$1"
  python3 - "$path" <<'PY'
from pathlib import Path
import sys

text = Path(sys.argv[1]).read_text().replace('\r\n', '\n').replace('\r', '\n').strip('\n')
print(text.replace('\n', '\\n'), end='')
PY
}

quote_env_value() {
  local value="$1"
  python3 - "$value" <<'PY'
import sys

value = sys.argv[1]
print("'" + value.replace("'", "'\"'\"'") + "'", end='')
PY
}

upsert_env() {
  local key="$1"
  local value="$2"
  python3 - "${ENV_FILE}" "${key}" "${value}" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = env_path.read_text().splitlines() if env_path.exists() else []

updated = []
replaced = False
prefix = f"{key}="
for line in lines:
    if line.startswith(prefix):
        if not replaced:
            updated.append(f"{key}={value}")
            replaced = True
        continue
    updated.append(line)

if not replaced:
    updated.append(f"{key}={value}")

env_path.write_text("\n".join(updated) + "\n")
PY
}

require_nonempty "${WECHAT_APP_ID_VALUE}" "app id"
require_nonempty "${WECHAT_APP_SECRET_VALUE}" "app secret"
require_nonempty "${WECHAT_MCH_ID_VALUE}" "merchant id"
require_nonempty "${WECHAT_PAY_API_V3_KEY_VALUE}" "api v3 key"
require_file "${WECHAT_PAY_PRIVATE_KEY_FILE_VALUE}" "merchant private key file"

if [ -z "${WECHAT_PAY_MERCHANT_SERIAL_NO_VALUE}" ]; then
  require_file "${WECHAT_PAY_MERCHANT_CERTIFICATE_FILE_VALUE}" "merchant certificate file"
  WECHAT_PAY_MERCHANT_SERIAL_NO_VALUE="$(
    openssl x509 -in "${WECHAT_PAY_MERCHANT_CERTIFICATE_FILE_VALUE}" -serial -noout |
      sed 's/^serial=//'
  )"
fi

if [ -n "${WECHAT_PAY_PLATFORM_CERTIFICATE_FILE_VALUE}" ]; then
  require_file "${WECHAT_PAY_PLATFORM_CERTIFICATE_FILE_VALUE}" "platform certificate file"
  if [ -z "${WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE}" ]; then
    WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE="$(
      openssl x509 -in "${WECHAT_PAY_PLATFORM_CERTIFICATE_FILE_VALUE}" -serial -noout |
        sed 's/^serial=//'
    )"
  fi
fi

if [ -n "${WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE}" ] && [ -n "${WECHAT_PAY_PUBLIC_KEY_ID_VALUE}" ]; then
  echo "Choose either WeChat Pay public key mode or platform certificate mode, not both" >&2
  exit 1
fi

if [ -n "${WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE}" ]; then
  require_file "${WECHAT_PAY_PLATFORM_CERTIFICATE_FILE_VALUE}" "platform certificate file"
else
  require_nonempty "${WECHAT_PAY_PUBLIC_KEY_ID_VALUE}" "wechat pay public key id"
  require_file "${WECHAT_PAY_PUBLIC_KEY_FILE_VALUE}" "wechat pay public key file"
fi

if [ "${PAY_PROVIDER_VALUE}" != "wechat" ]; then
  echo "pay provider must be wechat" >&2
  exit 1
fi

if [ "${#WECHAT_PAY_API_V3_KEY_VALUE}" -ne 32 ]; then
  echo "api v3 key must be exactly 32 characters" >&2
  exit 1
fi

if [ -z "${WECHAT_PAY_NOTIFY_URL_VALUE}" ]; then
  WECHAT_PAY_NOTIFY_URL_VALUE="${PUBLIC_ORIGIN}/payments/wechat/notify"
fi

WECHAT_PAY_PRIVATE_KEY_PEM_VALUE="$(quote_env_value "$(pem_to_env_value "${WECHAT_PAY_PRIVATE_KEY_FILE_VALUE}")")"
if [ -z "${WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE}" ]; then
  WECHAT_PAY_PUBLIC_KEY_PEM_VALUE="$(quote_env_value "$(pem_to_env_value "${WECHAT_PAY_PUBLIC_KEY_FILE_VALUE}")")"
else
  WECHAT_PAY_PLATFORM_CERTIFICATE_PEM_VALUE="$(quote_env_value "$(pem_to_env_value "${WECHAT_PAY_PLATFORM_CERTIFICATE_FILE_VALUE}")")"
fi

keys=(
  "PAY_PROVIDER"
  "WECHAT_APP_ID"
  "WECHAT_APP_SECRET"
  "WECHAT_MCH_ID"
  "WECHAT_PAY_NOTIFY_URL"
  "WECHAT_PAY_MERCHANT_SERIAL_NO"
  "WECHAT_PAY_PRIVATE_KEY_PEM"
  "WECHAT_PAY_PUBLIC_KEY_ID"
  "WECHAT_PAY_PUBLIC_KEY_PEM"
  "WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO"
  "WECHAT_PAY_PLATFORM_CERTIFICATE_PEM"
  "WECHAT_PAY_API_V3_KEY"
)

if [ "${DRY_RUN}" = "1" ]; then
  printf 'WeChat Pay env dry run passed for %s\n' "${ENV_FILE}"
  printf 'Would update keys:\n'
  for key in "${keys[@]}"; do
    printf '  - %s\n' "${key}"
  done
  exit 0
fi

mkdir -p "$(dirname "${ENV_FILE}")"
touch "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

upsert_env "PAY_PROVIDER" "${PAY_PROVIDER_VALUE}"
upsert_env "WECHAT_APP_ID" "${WECHAT_APP_ID_VALUE}"
upsert_env "WECHAT_APP_SECRET" "${WECHAT_APP_SECRET_VALUE}"
upsert_env "WECHAT_MCH_ID" "${WECHAT_MCH_ID_VALUE}"
upsert_env "WECHAT_PAY_NOTIFY_URL" "${WECHAT_PAY_NOTIFY_URL_VALUE}"
upsert_env "WECHAT_PAY_MERCHANT_SERIAL_NO" "${WECHAT_PAY_MERCHANT_SERIAL_NO_VALUE}"
upsert_env "WECHAT_PAY_PRIVATE_KEY_PEM" "${WECHAT_PAY_PRIVATE_KEY_PEM_VALUE}"
if [ -n "${WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE}" ]; then
  upsert_env "WECHAT_PAY_PUBLIC_KEY_ID" ""
  upsert_env "WECHAT_PAY_PUBLIC_KEY_PEM" ""
  upsert_env "WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO" "${WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO_VALUE}"
  upsert_env "WECHAT_PAY_PLATFORM_CERTIFICATE_PEM" "${WECHAT_PAY_PLATFORM_CERTIFICATE_PEM_VALUE}"
else
  upsert_env "WECHAT_PAY_PUBLIC_KEY_ID" "${WECHAT_PAY_PUBLIC_KEY_ID_VALUE}"
  upsert_env "WECHAT_PAY_PUBLIC_KEY_PEM" "${WECHAT_PAY_PUBLIC_KEY_PEM_VALUE}"
  upsert_env "WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO" ""
  upsert_env "WECHAT_PAY_PLATFORM_CERTIFICATE_PEM" ""
fi
upsert_env "WECHAT_PAY_API_V3_KEY" "${WECHAT_PAY_API_V3_KEY_VALUE}"

chmod 600 "${ENV_FILE}"

printf 'Updated WeChat Pay env in %s\n' "${ENV_FILE}"
printf 'Updated keys:\n'
for key in "${keys[@]}"; do
  printf '  - %s\n' "${key}"
done
