import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Offline restore-contract tests. Both network-capable commands are replaced on PATH.
// A successful stubbed sync never proves a specific R2 image exists.
const script = fileURLToPath(new URL('../scripts/r2-sync.sh', import.meta.url));
function sandbox(check) {
  const root = mkdtempSync(join(tmpdir(), 'gofn-r2-offline-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const stub = (name, contents) => writeFileSync(join(bin, name), '#!/bin/sh\n' + contents + '\n', { mode: 0o755 });
    stub('curl', [
      'if [ "$MOCK_TOKEN_INVALID" = "1" ]; then',
      "  printf '%s' 'sensitive-diagnostic-sentinel'",
      'else',
      "  printf '%s' '{\"result\":{\"id\":\"fake-test-id\"}}'",
      'fi',
    ].join('\n'));
    stub('aws', [
      'if [ -n "$MOCK_AWS_LOG" ]; then printf "%s\\n" "$3" >> "$MOCK_AWS_LOG"; fi',
      'if [ -n "$MOCK_FAIL_PREFIX" ]; then',
      '  case "$3" in *"/$MOCK_FAIL_PREFIX") exit 17;; esac',
      'fi',
      'exit 0',
    ].join('\n'));
    const log = join(root, 'sync-calls.log');
    const basic = {
      ...process.env, PATH: bin + ':' + process.env.PATH,
      CLOUDFLARE_API_TOKEN: 'FAKE_PRIVATE_TOKEN_NEVER_ECHO',
      CLOUDFLARE_ACCOUNT_ID: 'offline-fixture',
      R2_BUCKET: 'fake-bucket',
      R2_ONLY: 'infographics',
      MOCK_AWS_LOG: log,
      MOCK_FAIL_PREFIX: '',
      MOCK_TOKEN_INVALID: '0',
    };
    const run = (extra = {}, mode = 'restore') => spawnSync('bash', [script, mode], {
      cwd: root, env: { ...basic, ...extra }, encoding: 'utf8', timeout: 10000,
    });
    const calls = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    check({ run, calls, root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('R2 sync shell parses without invoking network clients', () => {
  const parsed = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test('strict G47IX restore succeeds only after configured prefix sync succeeds', () => sandbox(({ run, calls }) => {
  const result = run({ R2_SYNC_STRICT_RESTORE: '1' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(calls(), ['s3://fake-bucket/infographics']);
  assert.match(result.stdout, /R2 restore done/);
  assert.doesNotMatch(result.stdout + result.stderr, /FAKE_PRIVATE_TOKEN_NEVER_ECHO/);
}));

test('strict restore fails closed if an AWS prefix sync fails', () => sandbox(({ run, calls }) => {
  const result = run({ R2_SYNC_STRICT_RESTORE: '1', MOCK_FAIL_PREFIX: 'infographics' });
  assert.equal(result.status, 1);
  assert.deepEqual(calls(), ['s3://fake-bucket/infographics']);
  assert.match(result.stdout, /strict restore failed/);
  assert.doesNotMatch(result.stdout, /R2 restore done/);
  assert.doesNotMatch(result.stdout + result.stderr, /FAKE_PRIVATE_TOKEN_NEVER_ECHO/);
}));

test('non-strict historical consumers warn rather than claim full restoration', () => sandbox(({ run }) => {
  const result = run({ MOCK_FAIL_PREFIX: 'infographics' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /restore of infographics failed/);
  assert.match(result.stdout, /restore incomplete/);
  assert.doesNotMatch(result.stdout, /R2 restore done/);
}));

test('strict restore fails without credentials and never attempts transfer', () => sandbox(({ run, calls }) => {
  const result = run({ R2_SYNC_STRICT_RESTORE: '1', CLOUDFLARE_API_TOKEN: '' });
  assert.equal(result.status, 1);
  assert.deepEqual(calls(), []);
  assert.match(result.stdout, /strict restore requires configured credentials/);
}));

test('non-strict local runs still skip if credentials are absent', () => sandbox(({ run, calls }) => {
  const result = run({ CLOUDFLARE_API_TOKEN: '' });
  assert.equal(result.status, 0);
  assert.deepEqual(calls(), []);
  assert.match(result.stdout, /sync skipped/);
}));

test('token verification failure redacts diagnostics, strict fails, non-strict skips', () => sandbox(({ run, calls }) => {
  const strict = run({ R2_SYNC_STRICT_RESTORE: '1', MOCK_TOKEN_INVALID: '1' });
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /token verification failed/);
  assert.doesNotMatch(strict.stdout + strict.stderr, /sensitive-diagnostic-sentinel|FAKE_PRIVATE_TOKEN_NEVER_ECHO/);
  assert.deepEqual(calls(), []);
  const legacy = run({ MOCK_TOKEN_INVALID: '1' });
  assert.equal(legacy.status, 0);
  assert.match(legacy.stdout, /token verification failed/);
  assert.deepEqual(calls(), []);
}));

test('strict multi-prefix restore halts on failure, no false complete log', () => sandbox(({ run, calls }) => {
  const result = run({ R2_SYNC_STRICT_RESTORE: '1', R2_ONLY: '', MOCK_FAIL_PREFIX: 'img/ext' });
  assert.equal(result.status, 1);
  assert.deepEqual(calls(), ['s3://fake-bucket/infographics', 's3://fake-bucket/img/ext']);
  assert.doesNotMatch(result.stdout, /R2 restore done/);
}));

test('save mode semantics are unchanged by the restore-only opt-in', () => sandbox(({ run, calls }) => {
  const result = run({ R2_SYNC_STRICT_RESTORE: '1' }, 'save');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(calls(), []);
  assert.match(result.stdout, /R2 save done/);
}));
