import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/validate-public-data.mjs', import.meta.url));
function validate(start, end = '2026-12-31T23:59') {
  const root = mkdtempSync(join(tmpdir(), 'gofn-rotation-calendar-'));
  try {
    const dir = join(root, 'public');
    mkdirSync(dir);
    writeFileSync(join(dir, 'data.json'), JSON.stringify({
      events: [], rotation: [{ s: start, e: end }],
    }));
    const run = spawnSync(process.execPath, [script], {
      cwd: root, encoding: 'utf8', timeout: 20000,
      env: { ...process.env, TZ: 'Pacific/Auckland' },
    });
    assert.equal(run.signal, null, 'validator must not time out');
    return { status: run.status, output: run.stdout + run.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const start of [
  '2026-00-01T12:00', '2026-13-01T12:00',
  '2026-02-30T12:00', '2025-02-29T12:00',
  '2026-04-31T12:00', '2026-11-00T12:00',
  '2026-11-32T12:00', '2026-11-17T24:00',
  '2026-11-17T23:60', '2026-11-17T12:00Z',
]) {
  test('rejects impossible local rotation start ' + start, () => {
    const run = validate(start);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /start must be a local YYYY-MM-DDTHH:mm value/);
  });
}

for (const end of [
  '2026-02-30T12:00', '2026-11-31T12:00',
  '2026-12-31T24:00', '2026-12-31T23:60',
]) {
  test('rejects impossible local rotation end ' + end, () => {
    const run = validate('2026-01-01T00:00', end);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /end must be a local YYYY-MM-DDTHH:mm value/);
  });
}

for (const [start, end] of [
  ['2024-02-29T00:00', '2024-03-01T00:00'],
  ['2000-02-29T23:59', '2000-03-01T00:00'],
  ['2026-11-17T00:00', '2026-11-17T23:59'],
]) {
  test('accepts real local calendar window ' + start, () => {
    const run = validate(start, end);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /Data validation passed/);
  });
}

test('rejects non-leap century Feb 29', () => {
  const run = validate('1900-02-29T12:00', '1900-03-01T00:00');
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /start must be a local YYYY-MM-DDTHH:mm value/);
});

test('rejects valid dates in reverse chronological order', () => {
  const run = validate('2026-11-18T12:00', '2026-11-17T12:00');
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /rotation end must be after start/);
});
