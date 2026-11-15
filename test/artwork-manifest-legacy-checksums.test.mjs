import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { legacyEntries, hashMirrored, buildManifest } from '../scripts/artwork-manifest.mjs';

const dex = [[849, 'Toxtricity']];
const costumes = { pictures: { 'toxtricity|low key form': '/img/ext/849-l-aaaa1111.png' }, shiny: { 'toxtricity|low key form': '/img/ext/849-l-bbbb2222.png' } };
const KEY = '849|normal|costume|low-key-form|regular', SHINY = '849|normal|costume|low-key-form|shiny';
const sum = buf => createHash('sha256').update(buf).digest('hex');

test('hashMirrored reads only mirrored /img/ext files and ignores anything else', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mf-'));
  try {
    await mkdir(join(root, 'img/ext'), { recursive: true });
    await writeFile(join(root, 'img/ext/849-l-aaaa1111.png'), 'normal-bytes');
    const got = await hashMirrored(['/img/ext/849-l-aaaa1111.png', '/img/ext/849-l-bbbb2222.png', '/img/ext/../secret.png', 'https://example.org/x.png'], root);
    assert.deepEqual(got, { '/img/ext/849-l-aaaa1111.png': { sha256: sum('normal-bytes'), bytes: 12 } });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a new mirrored costume gets its checksum; a missing file stays empty (and visibly invalid)', () => {
  const hashes = { '/img/ext/849-l-aaaa1111.png': { sha256: sum('a'), bytes: 1 } };
  const e = legacyEntries({ costumes, dex, hashes });
  assert.equal(e[KEY].sha256, sum('a'));
  assert.equal(e[KEY].bytes, 1);
  assert.equal(e[SHINY].sha256, '', 'no file on disk means no invented checksum');
});

test('an existing checksum for the same url always wins over disk', () => {
  const previous = { [KEY]: { url: '/img/ext/849-l-aaaa1111.png', sha256: sum('old'), bytes: 9 } };
  const hashes = { '/img/ext/849-l-aaaa1111.png': { sha256: sum('new'), bytes: 3 } };
  const e = legacyEntries({ costumes, dex, previous, hashes });
  assert.equal(e[KEY].sha256, sum('old'));
  assert.equal(e[KEY].bytes, 9);
  const changed = legacyEntries({ costumes, dex, previous: { [KEY]: { url: '/img/ext/other.png', sha256: sum('old') } }, hashes });
  assert.equal(changed[KEY].sha256, sum('new'), 'a different url does not inherit the old checksum');
});

test('buildManifest without hashes is unchanged (test 22 stays offline-stable)', () => {
  const a = buildManifest({ costumes, queue: { items: [] }, index: {}, dex, previous: null });
  const b = buildManifest({ costumes, queue: { items: [] }, index: {}, dex, previous: null, hashes: {} });
  assert.deepEqual(a, b);
});
