import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateThumbnails,
  sourceRelativePath,
  thumbnailRelativePath
} from '../scripts/infographic-thumbnails.mjs';

const webp = name => Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.from(name)
]);

test('only same-origin approved infographic paths map to safe static WebP paths', () => {
  assert.equal(sourceRelativePath('/infographics/g47ix/a.jpg'), 'g47ix/a.jpg');
  assert.equal(sourceRelativePath('https://pogo.michaelpuff.com/infographics/g47ix/a.png'), 'g47ix/a.png');
  assert.equal(thumbnailRelativePath('/infographics/g47ix/a.jpg'), 'infographic-thumbs/g47ix/a.jpg.webp');
  assert.equal(sourceRelativePath('https://example.com/infographics/a.jpg'), null);
  assert.equal(sourceRelativePath('/img/ext/a.webp'), null);
  assert.equal(sourceRelativePath('/infographics/a.gif'), null);
  assert.equal(sourceRelativePath('/infographics/%2e%2e/private.jpg'), null);
});

test('approved infographic thumbnails are generated once and unchanged outputs are not rewritten', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofn-infographic-thumbs-'));
  try {
    const sourceDir = path.join(root, 'public', 'infographics', 'g47ix');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'a.jpg'), 'source-a');
    await fs.writeFile(path.join(sourceDir, 'b.png'), 'source-b');
    await fs.writeFile(path.join(root, 'public', 'event-info.json'), JSON.stringify({
      events: {
        alpha: { infographics: [{ url: '/infographics/g47ix/a.jpg' }, { url: '/infographics/g47ix/a.jpg' }] },
        beta: { infographicUrl: '/infographics/g47ix/missing.webp' },
        gamma: { infographic: 'https://example.com/infographics/external.jpg' }
      }
    }));
    await fs.writeFile(path.join(root, 'public', 'data.json'), JSON.stringify({
      events: [{ id: 'delta', infographicUrl: '/infographics/g47ix/b.png' }]
    }));
    const calls = [];
    const convert = async (source, destination) => {
      calls.push(path.basename(source));
      await fs.writeFile(destination, webp(path.basename(source)));
    };
    const first = await generateThumbnails({ root, convert, log: () => {} });
    assert.deepEqual(first, { referenced: 2, generated: 2, unchanged: 0, missing: 0, failed: 0 });
    assert.deepEqual(calls.sort(), ['a.jpg', 'b.png']);
    assert.ok((await fs.readFile(path.join(root, 'public', thumbnailRelativePath('/infographics/g47ix/a.jpg')))).subarray(8, 12).equals(Buffer.from('WEBP')));
    assert.ok((await fs.readFile(path.join(root, 'public', thumbnailRelativePath('/infographics/g47ix/b.png')))).subarray(8, 12).equals(Buffer.from('WEBP')));

    calls.length = 0;
    const second = await generateThumbnails({ root, convert, log: () => {} });
    assert.deepEqual(second, { referenced: 2, generated: 0, unchanged: 2, missing: 0, failed: 0 });
    assert.deepEqual(calls.sort(), ['a.jpg', 'b.png']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('thumbnail generation reads R2-restored originals but never adds the thumbnail folder to R2 sync', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const r2Sync = await fs.readFile(path.join(root, 'scripts', 'r2-sync.sh'), 'utf8');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'g47ix-infographics.yml'), 'utf8');
  assert.equal(r2Sync.includes('infographic-thumbs'), false);
  const generateAt = workflow.indexOf('node scripts/infographic-thumbnails.mjs');
  const restoreAt = workflow.indexOf('bash scripts/r2-sync.sh restore');
  const saveAt = workflow.indexOf('bash scripts/r2-sync.sh save');
  assert.ok(restoreAt >= 0 && saveAt > restoreAt && generateAt > saveAt);
  assert.ok(workflow.includes('public/infographic-thumbs'));
});
