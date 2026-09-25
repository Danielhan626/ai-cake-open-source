#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-example.com}"
EXPECTED_IP="${EXPECTED_IP:-203.0.113.10}"
MINIPROGRAM_DIR="${MINIPROGRAM_DIR:-apps/miniprogram}"
WECHAT_DEVTOOLS_CLI="${WECHAT_DEVTOOLS_CLI:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"
DNS_CHECK_SERVERS="${DNS_CHECK_SERVERS:-8.8.8.8 1.1.1.1 223.5.5.5}"

if ! command -v dig >/dev/null 2>&1; then
  echo "dig is required to verify DNS" >&2
  exit 1
fi

if [ ! -x "${WECHAT_DEVTOOLS_CLI}" ]; then
  echo "WeChat DevTools CLI not found or not executable: ${WECHAT_DEVTOOLS_CLI}" >&2
  exit 1
fi

echo "Checking mini-program launch-domain config..."
npm run miniprogram:launch-domain-regression

resolved="$({
  dig +short "${DEPLOY_DOMAIN}" A || true
  for server in ${DNS_CHECK_SERVERS}; do
    dig @"${server}" +short "${DEPLOY_DOMAIN}" A || true
  done
} | sort -u | tr '\n' ' ')"
if ! printf '%s\n' "${resolved}" | grep -qw "${EXPECTED_IP}"; then
  echo "DNS not ready: ${DEPLOY_DOMAIN} A resolved to '${resolved:-<empty>}', expected ${EXPECTED_IP}" >&2
  exit 2
fi

echo "Checking HTTPS health..."
curl -fsS --max-time 20 --resolve "${DEPLOY_DOMAIN}:443:${EXPECTED_IP}" "https://${DEPLOY_DOMAIN}/health" >/dev/null

echo "Checking WeChat DevTools login state..."
login_output="$("${WECHAT_DEVTOOLS_CLI}" islogin 2>&1)"
login_json="$(printf '%s\n' "${login_output}" | awk '/^\{.*"login"/ { line=$0 } END { print line }')"
if [ -z "${login_json}" ]; then
  printf '%s\n' "${login_output}" >&2
  echo "Unable to parse WeChat DevTools login state" >&2
  exit 3
fi

node -e '
const data = JSON.parse(process.argv[1]);
if (!data.login) {
  console.error("WeChat DevTools CLI is not logged in");
  process.exit(4);
}
' "${login_json}"

node -e '
const path = require("node:path");
const project = require(path.resolve(process.argv[1], "project.config.json"));
if (project.appid !== "wx0000000000000000") {
  throw new Error(`Unexpected appid: ${project.appid}`);
}
if (project.setting?.urlCheck !== true) {
  throw new Error("project.config.json must keep urlCheck=true before upload");
}
' "${MINIPROGRAM_DIR}"

echo "WeChat upload preflight passed for ${MINIPROGRAM_DIR}"
