import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const tempDir = mkdtempSync(join(tmpdir(), 'aicake-wechat-env-'));

try {
  const envFile = join(tempDir, 'api.env');
  const privateKeyFile = join(tempDir, 'apiclient_key.pem');
  const publicKeyFile = join(tempDir, 'pub_key.pem');

  execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', privateKeyFile], {
    stdio: 'ignore',
  });
  execFileSync('openssl', ['pkey', '-in', privateKeyFile, '-pubout', '-out', publicKeyFile], {
    stdio: 'ignore',
  });

  writeFileSync(
    envFile,
    [
      'NODE_ENV=production',
      'PAY_PROVIDER=mock',
      'WECHAT_APP_ID=old-app-id',
      'WECHAT_PAY_PRIVATE_KEY_PEM=stale-private-key',
      '',
    ].join('\n'),
    'utf8',
  );

  execFileSync(
    'bash',
    [
      resolve(repoRoot, 'scripts/prepare-wechat-pay-env.sh'),
      '--env-file',
      envFile,
      '--app-id',
      'wx0000000000000000',
      '--app-secret',
      'wechat-app-secret-demo',
      '--mch-id',
      'your_mch_id',
      '--merchant-serial-no',
      '148777EB7C98AD4F895072CB895CD71DB75F455F',
      '--merchant-private-key-file',
      privateKeyFile,
      '--public-key-id',
      'PUB_KEY_ID_20260731',
      '--public-key-file',
      publicKeyFile,
      '--api-v3-key',
      '12345678901234567890123456789012',
      '--notify-url',
      'https://example.com/payments/wechat/notify',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  const content = readFileSync(envFile, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  assert(lines.every((line) => /^[A-Z0-9_]+=/.test(line)), 'env file must contain only single-line KEY=value entries');

  const privateLine = lines.find((line) => line.startsWith('WECHAT_PAY_PRIVATE_KEY_PEM='));
  const publicLine = lines.find((line) => line.startsWith('WECHAT_PAY_PUBLIC_KEY_PEM='));
  const privateHeader = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  const publicHeader = ['-----BEGIN', 'PUBLIC KEY-----'].join(' ');

  assert(privateLine, 'env file must include WECHAT_PAY_PRIVATE_KEY_PEM');
  assert(publicLine, 'env file must include WECHAT_PAY_PUBLIC_KEY_PEM');
  assert(privateLine.startsWith(`WECHAT_PAY_PRIVATE_KEY_PEM='${privateHeader}\\n`), 'private key env value must be shell-quoted with escaped newlines');
  assert(publicLine.startsWith(`WECHAT_PAY_PUBLIC_KEY_PEM='${publicHeader}\\n`), 'public key env value must be shell-quoted with escaped newlines');
  assert(privateLine.endsWith("-----END PRIVATE KEY-----'"), 'private key env value must stay on one line');
  assert(publicLine.endsWith("-----END PUBLIC KEY-----'"), 'public key env value must stay on one line');
  assert.equal(lines.filter((line) => line.startsWith('WECHAT_PAY_PRIVATE_KEY_PEM=')).length, 1, 'private key entry must not be duplicated');
  assert.equal(lines.filter((line) => line.startsWith('WECHAT_PAY_PUBLIC_KEY_PEM=')).length, 1, 'public key entry must not be duplicated');

  const sourced = execFileSync(
    'bash',
    [
      '-lc',
      `
set -a
. "${envFile}"
set +a
python3 - <<'PY'
import json
import os
import subprocess
import tempfile
from pathlib import Path

private_pem = os.environ['WECHAT_PAY_PRIVATE_KEY_PEM']
public_pem = os.environ['WECHAT_PAY_PUBLIC_KEY_PEM']

with tempfile.TemporaryDirectory() as temp_dir:
    private_path = Path(temp_dir) / 'private.pem'
    public_path = Path(temp_dir) / 'public.pem'
    private_path.write_text(private_pem.replace('\\\\n', '\\n'))
    public_path.write_text(public_pem.replace('\\\\n', '\\n'))
    subprocess.run(['openssl', 'pkey', '-in', str(private_path), '-noout'], check=True, capture_output=True)
    subprocess.run(['openssl', 'pkey', '-pubin', '-in', str(public_path), '-noout'], check=True, capture_output=True)

print(json.dumps({
    'privateLen': len(private_pem),
    'publicLen': len(public_pem),
    'privateHasEscapedNewlines': '\\\\n' in private_pem,
    'publicHasEscapedNewlines': '\\\\n' in public_pem,
}))
PY
      `.trim(),
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  const sourcedSummary = JSON.parse(sourced.trim());
  assert(sourcedSummary.privateLen > 200, 'sourced private key env must contain the full PEM');
  assert(sourcedSummary.publicLen > 100, 'sourced public key env must contain the full PEM');
  assert.equal(sourcedSummary.privateHasEscapedNewlines, true, 'sourced private key env must preserve escaped newlines');
  assert.equal(sourcedSummary.publicHasEscapedNewlines, true, 'sourced public key env must preserve escaped newlines');

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        gate: 'wechat-pay-env-prep',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
