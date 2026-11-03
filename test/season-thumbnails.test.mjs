import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectSeasonPosters,
  generateSeasonThumbnails,
  sourceDescriptor,
  sourceHash,
  thumbnailFilename,
  thumbnailPath
} from '../scripts/season-thumbnails.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
const WEBP = Buffer.from('RIFF0000WEBP', 'ascii');

function response({ status = 200, bytes = JPEG, type = 'image/jpeg', url = '' } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: { get(name) {
      if (name.toLowerCase() === 'content-type') return type;
      if (name.toLowerCase() === 'content-length') return String(bytes.length);
      return null;
    } },
    async arrayBuffer() { return Uint8Array.from(bytes).buffer; }
  };
}

async function fixtureRoot(items) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofn-season-thumb-test-'));
  await fs.mkdir(path.join(root, 'public', 'img', 'ext'), { recursive: true });
  await fs.writeFile(path.join(root, 'public', 'season.json'), JSON.stringify({ items }, null, 2));
  return root;
}

test('Season poster sources are restricted to the production image path and Leek Duck event CDN', () => {
  const local = sourceDescriptor('/img/ext/season-poster.jpg');
  assert.equal(local.url, 'https://pogo.michaelpuff.com/img/ext/season-poster.jpg');
  assert.equal(local.relativePath, 'img/ext/season-poster.jpg');
  const absolute = sourceDescriptor('https://pogo.michaelpuff.com/img/ext/season-poster.webp');
  assert.equal(absolute.origin, 'https://pogo.michaelpuff.com');
  const duck = sourceDescriptor('https://cdn.leekduck.com/assets/img/events/2026/season-poster.png');
  assert.equal(duck.origin, 'https://cdn.leekduck.com');
  assert.equal(duck.relativePath, null);

  for (const value of [
    'https://evil.example/img/ext/poster.jpg',
    'https://pogo.michaelpuff.com/infographics/poster.jpg',
    'https://cdn.leekduck.com/other/poster.jpg',
    'http://cdn.leekduck.com/assets/img/events/poster.jpg',
    '//cdn.leekduck.com/assets/img/events/poster.jpg',
    '/img/ext/poster.jpg?token=secret',
    '/img/ext/poster.jpg#fragment',
    '/img/ext/%2e%2e/private.jpg',
    '/img/ext/poster.svg'
  ]) assert.equal(sourceDescriptor(value), null, value);
});

test('Season thumbnail filenames are deterministic, source-specific and path-safe', () => {
  const image = '/img/ext/season-24-twilight-trails-99c978ed.jpg';
  const filename = thumbnailFilename('season:24', image);
  assert.match(filename, /^season-24-[a-f0-9]{8}\.webp$/);
  assert.equal(filename, thumbnailFilename('season:24', image));
  assert.notEqual(filename, thumbnailFilename('season:24', '/img/ext/updated-poster.jpg'));
  assert.equal(thumbnailPath('season:24', image), '/season-thumbs/' + filename);
  assert.match(sourceHash(image), /^[a-f0-9]{8}$/);
  assert.equal(thumbnailFilename('../private', image), 'season-private-' + sourceHash(image) + '.webp');
});

test('Season poster collection ignores unapproved images and de-duplicates repeated IDs', () => {
  const posters = collectSeasonPosters({ items: [
    { id: 'season:24', img: '/img/ext/season.jpg' },
    { id: 'season:24', img: '/img/ext/season.jpg' },
    { id: 'season:pass-november', img: 'https://cdn.leekduck.com/assets/img/events/november.jpg' },
    { id: 'season:unsafe', img: 'https://evil.example/poster.jpg' },
    { id: 'season:no-image' }
  ] });
  assert.equal(posters.length, 2);
  assert.deepEqual(posters.map(item => item.id), ['season:pass-november', 'season:24'].sort());
});

test('Local generation writes a WebP derivative and skips an existing valid file', async () => {
  const root = await fixtureRoot([{ id: 'season:24', img: '/img/ext/season.jpg' }]);
  try {
    await fs.writeFile(path.join(root, 'public', 'img', 'ext', 'season.jpg'), JPEG);
    const convert = async (_source, destination) => fs.writeFile(destination, WEBP);
    const first = await generateSeasonThumbnails({ root, convert, log: () => {} });
    assert.deepEqual(first, { referenced: 1, generated: 1, unchanged: 0, missing: 0, failed: 0 });
    const output = path.join(root, 'public', 'season-thumbs', thumbnailFilename('season:24', '/img/ext/season.jpg'));
    assert.deepEqual(await fs.readFile(output), WEBP);
    const second = await generateSeasonThumbnails({ root, convert, skipExisting: true, log: () => {} });
    assert.deepEqual(second, { referenced: 1, generated: 0, unchanged: 1, missing: 0, failed: 0 });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Remote generation fetches only approved sources and rejects non-image responses', async () => {
  const root = await fixtureRoot([
    { id: 'season:24', img: '/img/ext/season.jpg' },
    { id: 'season:pass-november', img: 'https://cdn.leekduck.com/assets/img/events/2026/november.jpg' }
  ]);
  try {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      return response({ url: String(url) });
    };
    const convert = async (_source, destination) => fs.writeFile(destination, WEBP);
    const result = await generateSeasonThumbnails({ root, sourceMode: 'remote', fetchImpl, convert, log: () => {} });
    assert.deepEqual(result, { referenced: 2, generated: 2, unchanged: 0, missing: 0, failed: 0 });
    assert.deepEqual(calls.map(call => call.url), [
      'https://pogo.michaelpuff.com/img/ext/season.jpg',
      'https://cdn.leekduck.com/assets/img/events/2026/november.jpg'
    ]);
    assert.ok(calls.every(call => call.options.redirect === 'error'));
    assert.ok(calls.every(call => call.options.headers['user-agent'].includes('go-field-notes-season-thumbnail-generator')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }

  const badRoot = await fixtureRoot([{ id: 'season:bad', img: '/img/ext/not-an-image.jpg' }]);
  try {
    const result = await generateSeasonThumbnails({
      root: badRoot,
      sourceMode: 'remote',
      fetchImpl: async url => response({ url: String(url), bytes: Buffer.from('<html>'), type: 'text/html' }),
      convert: async () => { throw new Error('must not run'); },
      log: () => {}
    });
    assert.deepEqual(result, { referenced: 1, generated: 0, unchanged: 0, missing: 0, failed: 1 });
  } finally {
    await fs.rm(badRoot, { recursive: true, force: true });
  }
});

test('Generation workflow updates only static derivatives and service worker caches Season thumbnails offline', async () => {
  const workflow = await fs.readFile(path.join(ROOT, '.github', 'workflows', 'qa10-thumbnail-generation.yml'), 'utf8');
  const sw = await fs.readFile(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  const season = await fs.readFile(path.join(ROOT, 'public', 'season.js'), 'utf8');
  const g47ix = await fs.readFile(path.join(ROOT, '.github', 'workflows', 'g47ix-infographics.yml'), 'utf8');
  assert.match(workflow, /public\/season\.json/);
  assert.match(workflow, /node scripts\/season-thumbnails\.mjs --remote/);
  assert.match(workflow, /git add -- public\/infographic-thumbs public\/season-thumbs/);
  assert.doesNotMatch(workflow, /r2-sync\.sh|R2_ACCESS_KEY|CLOUDFLARE_API_TOKEN/);
  assert.match(sw, /season-thumbs/);
  assert.match(sw, /gofn-shell-v233/);
  assert.match(season, /seasonThumbnailPath/);
  const discover = g47ix.slice(g47ix.indexOf('  discover:'), g47ix.indexOf('  notify:'));
  const notify = g47ix.slice(g47ix.indexOf('  notify:'), g47ix.indexOf('  audit:'));
  const audit = g47ix.slice(g47ix.indexOf('  audit:'));
  assert.doesNotMatch(discover, /Dispatch read-only QA-10/, 'audit dispatch waits until all G47IX commits have finished');
  assert.match(g47ix, /deploy_changed:\s+\$\{\{\s*steps\.summarize_public\.outputs\.deploy_changed\s*\}\}/);
  assert.match(notify, /if \[\[ "\$DEPLOY_CHANGED" == "true" \]\]; then[\s\S]*?Record notification state after public update[\s\S]*?\[skip ci\]/);
  assert.match(notify, /final_sha="\\$\\(git ls-remote origin refs\\/heads\\/main/);
  assert.match(notify, /echo "final_commit_sha=\\$final_sha" >> "\\$GITHUB_OUTPUT"/);
  assert.match(audit, /COMMIT_SHA:\s+\$\{\{\s*needs\.notify\.outputs\.final_commit_sha\s*\}\}/);
  assert.ok(g47ix.indexOf('  audit:') > g47ix.indexOf('  notify:'), 'the production audit runs after the final main commit');
});
