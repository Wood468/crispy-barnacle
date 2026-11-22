import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/validate-public-data.mjs', import.meta.url).pathname;
const image = '/infographics/g47ix/restored-week.webp';

function validate({ item = { kind: 'week', image }, restore } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gofn-weekly-validator-'));
  try {
    const publicDir = join(root, 'public');
    mkdirSync(publicDir);
    // The public validator imports repository-owned schemas but uses cwd for
    // generated data. Keep all R2/media fixtures isolated, never touching live
    // or checked-in media.
    writeFileSync(join(publicDir, 'data.json'), JSON.stringify({ events: [] }));
    writeFileSync(join(publicDir, 'weekly.json'), JSON.stringify({ items: [item] }));
    if (restore) restore(root, publicDir);
    const run = spawnSync(process.execPath, [script], {
      cwd: root, encoding: 'utf8', timeout: 20000,
    });
    return { status: run.status, output: (run.stdout || '') + (run.stderr || ''), signal: run.signal };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function mediaDir(root, publicDir) {
  const target = join(publicDir, 'infographics', 'g47ix');
  mkdirSync(target, { recursive: true });
  return target;
}
function expectHeld(run, why) {
  assert.equal(run.status, 1, why + ': ' + run.output);
  assert.match(run.output, /image file does not exist or is not a nonempty regular local file/, why);
  assert.match(run.output, /public\/weekly\.json items\[0\]/, why);
  assert.doesNotMatch(run.output, /restored-week\.webp|discord\.com|private-source|INTERNAL_ASSET_BYTES/i,
    'validation failures must not disclose source or raw artwork names/bytes');
}

test('no R2 restore directory: metadata-only checkout keeps legacy validation behaviour', () => {
  const run = validate();
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /Data validation passed/);
});

test('restored nonempty regular file passes the existing weekly feed contract', () => {
  const run = validate({ restore: (root, pub) => {
    writeFileSync(join(mediaDir(root, pub), 'restored-week.webp'), 'LOCAL_BYTES_ONLY');
  }});
  assert.equal(run.status, 0, run.output);
});

test('restored directory present but weekly artwork absent fails rather than publishing a dead URL', () => {
  expectHeld(validate({ restore: mediaDir }), 'missing restored image');
});

test('zero-byte staged artwork fails closed even though fs.access would pass', () => {
  expectHeld(validate({ restore: (root, pub) => {
    writeFileSync(join(mediaDir(root, pub), 'restored-week.webp'), '');
  }}), 'empty restored file');
});

test('directory named as an image fails closed even though fs.access would pass', () => {
  expectHeld(validate({ restore: (root, pub) => {
    mkdirSync(join(mediaDir(root, pub), 'restored-week.webp'));
  }}), 'directory masquerading as art');
});

test('symbolic-link image is not accepted as locally restored artwork', { skip: process.platform === 'win32' }, () => {
  expectHeld(validate({ restore: (root, pub) => {
    const dir = mediaDir(root, pub);
    writeFileSync(join(root, 'private-source.webp'), 'INTERNAL_ASSET_BYTES');
    symlinkSync(join(root, 'private-source.webp'), join(dir, 'restored-week.webp'));
  }}), 'linked image outside public');
});

test('symbolic-link parent folder is not accepted as a restored artwork directory', { skip: process.platform === 'win32' }, () => {
  expectHeld(validate({ restore: (root, pub) => {
    const external = join(root, 'external-media');
    mkdirSync(external);
    writeFileSync(join(external, 'restored-week.webp'), 'INTERNAL_ASSET_BYTES');
    mkdirSync(join(pub, 'infographics'));
    symlinkSync(external, join(pub, 'infographics', 'g47ix'), 'dir');
  }}), 'linked media directory');
});

test('symlinked infographics root must not make an R2 restore appear valid', { skip: process.platform === 'win32' }, () => {
  expectHeld(validate({ restore: (root, pub) => {
    const external = join(root, 'external-media', 'g47ix');
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, 'restored-week.webp'), 'INTERNAL_ASSET_BYTES');
    symlinkSync(join(root, 'external-media'), join(pub, 'infographics'), 'dir');
  }}), 'linked R2 restore root');
});

test('unsafe weekly path is always rejected even when media has not been restored', () => {
  const run = validate({ item: { kind: 'week', image: '/infographics/g47ix/../../private.webp' } });
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /image must be a safe local/);
});

test('malformed weekly row fails validation rather than crashing with a property exception', () => {
  const run = validate({ item: null });
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /image must be a safe local/);
  assert.doesNotMatch(run.output, /TypeError|Cannot read properties/);
});

test('external image URL cannot bypass strict local weekly artwork paths', () => {
  const run = validate({ item: { kind: 'week', image: 'https://private.example.test/not-public.webp' } });
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, /image must be a safe local/);
  assert.doesNotMatch(run.output, /private\.example\.test/);
});

test('an unrelated malformed restored file does not invalidate a valid selected weekly image', () => {
  const run = validate({ restore: (root, pub) => {
    const dir = mediaDir(root, pub);
    writeFileSync(join(dir, 'restored-week.webp'), 'VALID_LOCAL_BYTES');
    writeFileSync(join(dir, 'unselected.webp'), '');
  }});
  assert.equal(run.status, 0, run.output);
});
