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
  assert.equal(sourceRelativePath('/infographics/g47ix/a.jpg'), 'infographics/g47ix/a.jpg');
  assert.equal(sourceRelativePath('https://pogo.michaelpuff.com/infographics/g47ix/a.png'), 'infographics/g47ix/a.png');
  assert.equal(sourceRelativePath('/img/ext/a.png'), 'img/ext/a.png');
  assert.equal(sourceRelativePath('https://pogo.michaelpuff.com/img/ext/b.png'), 'img/ext/b.png');
  assert.equal(sourceRelativePath('/img/ext/%2e%2e/private.jpg'), null);
  assert.equal(thumbnailRelativePath('https://pogo.michaelpuff.com/img/ext/b.png'), 'infographic-thumbs/img/ext/b.png.webp');
  assert.equal(thumbnailRelativePath('/infographics/g47ix/a.jpg'), 'infographic-thumbs/infographics/g47ix/a.jpg.webp');
  assert.equal(thumbnailRelativePath('/img/ext/a.png'), 'infographic-thumbs/img/ext/a.png.webp');
  assert.equal(sourceRelativePath('https://example.com/infographics/a.jpg'), null);
  assert.equal(sourceRelativePath('/other/a.webp'), null);
  assert.equal(sourceRelativePath('/infographics/a.gif'), null);
  assert.equal(sourceRelativePath('/infographics/%2e%2e/private.jpg'), null);
});

test('approved infographic thumbnails are generated once and unchanged outputs are not rewritten', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofn-infographic-thumbs-'));
  try {
    const sourceDir = path.join(root, 'public', 'infographics', 'g47ix');
    const extDir = path.join(root, 'public', 'img', 'ext');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(extDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'a.jpg'), 'source-a');
    await fs.writeFile(path.join(extDir, 'b.png'), 'source-b');
    await fs.writeFile(path.join(root, 'public', 'event-info.json'), JSON.stringify({
      events: {
        alpha: { infographics: [{ url: '/infographics/g47ix/a.jpg' }, { url: '/infographics/g47ix/a.jpg' }] },
        beta: { infographicUrl: '/infographics/g47ix/missing.webp' },
        gamma: { infographic: 'https://example.com/infographics/external.jpg' }
      }
    }));
    await fs.writeFile(path.join(root, 'public', 'data.json'), JSON.stringify({
      events: [{ id: 'delta', infographicUrl: '/img/ext/b.png' }]
    }));
    const calls = [];
    const convert = async (source, destination) => {
      calls.push(path.basename(source));
      await fs.writeFile(destination, webp(path.basename(source)));
    };
    const first = await generateThumbnails({ root, convert, log: () => {} });
    assert.deepEqual(first, { referenced: 3, generated: 2, unchanged: 0, missing: 1, failed: 0 });
    assert.deepEqual(calls.sort(), ['a.jpg', 'b.png']);
    assert.ok((await fs.readFile(path.join(root, 'public', thumbnailRelativePath('/infographics/g47ix/a.jpg')))).subarray(8, 12).equals(Buffer.from('WEBP')));
    assert.ok((await fs.readFile(path.join(root, 'public', thumbnailRelativePath('/img/ext/b.png')))).subarray(8, 12).equals(Buffer.from('WEBP')));

    calls.length = 0;
    const second = await generateThumbnails({ root, convert, log: () => {} });
    assert.deepEqual(second, { referenced: 3, generated: 0, unchanged: 2, missing: 1, failed: 0 });
    assert.deepEqual(calls.sort(), ['a.jpg', 'b.png']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('remote mode fetches only approved originals from the fixed production origin and skips valid existing thumbnails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofn-infographic-remote-'));
  try {
    await fs.mkdir(path.join(root, 'public'), { recursive: true });
    await fs.writeFile(path.join(root, 'public', 'event-info.json'), JSON.stringify({
      events: { alpha: { infographics: [{ url: '/infographics/g47ix/a.jpg' }] } }
    }));
    await fs.writeFile(path.join(root, 'public', 'data.json'), JSON.stringify({
      events: [{ id: 'beta', infographicUrl: '/img/ext/b.png' }, { id: 'external', infographicUrl: 'https://example.com/secret.jpg' }]
    }));
    const existing = path.join(root, 'public', thumbnailRelativePath('/img/ext/b.png'));
    await fs.mkdir(path.dirname(existing), { recursive: true });
    await fs.writeFile(existing, webp('already-generated'));

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), redirect: options.redirect });
      return {
        ok: true,
        status: 200,
        url: String(url),
        headers: { get: name => name === 'content-type' ? 'image/jpeg' : (name === 'content-length' ? String(jpeg.length) : null) },
        arrayBuffer: async () => Uint8Array.from(jpeg).buffer
      };
    };
    const convert = async (source, destination) => {
      assert.deepEqual(await fs.readFile(source), jpeg);
      await fs.writeFile(destination, webp('downloaded'));
    };
    const result = await generateThumbnails({ root, sourceMode: 'remote', skipExisting: true, fetchImpl, convert, log: () => {} });
    assert.deepEqual(result, { referenced: 2, generated: 1, unchanged: 1, missing: 0, failed: 0 });
    assert.deepEqual(calls, [{ url: 'https://pogo.michaelpuff.com/infographics/g47ix/a.jpg', redirect: 'error' }]);
    assert.ok(isWebpBytes(await fs.readFile(path.join(root, 'public', thumbnailRelativePath('/infographics/g47ix/a.jpg')))));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('remote mode treats missing originals as missing and rejects HTML responses', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofn-infographic-remote-errors-'));
  try {
    await fs.mkdir(path.join(root, 'public'), { recursive: true });
    await fs.writeFile(path.join(root, 'public', 'event-info.json'), JSON.stringify({
      events: { alpha: { infographics: [{ url: '/infographics/g47ix/missing.jpg' }, { url: '/infographics/g47ix/html.jpg' }] } }
    }));
    const fetchImpl = async url => {
      if (String(url).endsWith('/missing.jpg')) return { ok: false, status: 404 };
      return {
        ok: true,
        status: 200,
        url: String(url),
        headers: { get: name => name === 'content-type' ? 'text/html' : null },
        arrayBuffer: async () => Buffer.from('<html>').buffer
      };
    };
    const result = await generateThumbnails({ root, sourceMode: 'remote', fetchImpl, convert: async () => { throw new Error('must not convert invalid response'); }, log: () => {} });
    assert.deepEqual(result, { referenced: 2, generated: 0, unchanged: 0, missing: 1, failed: 1 });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function isWebpBytes(bytes) {
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}


test('QA-10 thumbnail audit dispatch sends one payload-bearing repository_dispatch request', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'qa10-thumbnail-generation.yml'), 'utf8');
  const marker = '      - name: Dispatch the read-only production image audit';
  const section = workflow.slice(workflow.indexOf(marker));
  assert.ok(section.startsWith(marker), 'dispatch step must exist');
  assert.ok(section.includes('set -euo pipefail'), 'dispatch shell must fail safely');
  const curlCalls = section.match(/curl --fail-with-body/g) || [];
  assert.equal(curlCalls.length, 1, 'dispatch must issue exactly one API request');
  assert.ok(section.indexOf('payload=') < section.indexOf('curl --fail-with-body'), 'payload must be constructed before dispatch');
  assert.ok(section.includes('-d "$payload"'), 'repository_dispatch must include its event payload');
  assert.ok(section.includes('qa10-thumbnail-audit'), 'dispatch must use the QA-10 audit event type');
});

test('thumbnail generation reads R2-restored originals but never adds the thumbnail folder to R2 sync', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const r2Sync = await fs.readFile(path.join(root, 'scripts', 'r2-sync.sh'), 'utf8');
  const workflow = await fs.readFile(path.join(root, '.github', 'workflows', 'g47ix-infographics.yml'), 'utf8');
  const auditWorkflow = await fs.readFile(path.join(root, '.github', 'workflows', 'qa10-thumbnail-audit.yml'), 'utf8');
  const thumbnailWorkflow = await fs.readFile(path.join(root, '.github', 'workflows', 'qa10-thumbnail-generation.yml'), 'utf8');
  assert.ok(r2Sync.includes('infographics:public/infographics'));
  assert.ok(r2Sync.includes('img/ext:public/img/ext'));
  assert.equal(r2Sync.includes('infographic-thumbs'), false);
  const generateAt = workflow.indexOf('node scripts/infographic-thumbnails.mjs');
  const restoreAt = workflow.indexOf('bash scripts/r2-sync.sh restore');
  const saveAt = workflow.indexOf('bash scripts/r2-sync.sh save');
  assert.ok(restoreAt >= 0 && saveAt > restoreAt && generateAt > saveAt);
  assert.ok(workflow.includes('public/infographic-thumbs'));
  assert.ok(workflow.includes('qa10-thumbnail-audit'));
  const stepIds = [...workflow.matchAll(/^\s+id:\s*([A-Za-z0-9_-]+)\s*$/gm)].map(match => match[1]);
  assert.equal(new Set(stepIds).size, stepIds.length, 'G47IX workflow step IDs must be unique');
  assert.ok(workflow.includes('steps.approved_publish.outputs.thumbnail_changed'));
  assert.ok(workflow.includes('steps.summarize_public.outputs.deploy_changed'));
  assert.ok(workflow.includes('needs.notify.outputs.final_commit_sha'));
  assert.ok(auditWorkflow.includes('repository_dispatch:'));
  assert.ok(auditWorkflow.includes('scripts/wait-for-workers-build.mjs'));
  assert.ok(auditWorkflow.includes('test/production_image_audit.py'));
  assert.ok(thumbnailWorkflow.includes('workflow_run:'));
  assert.ok(thumbnailWorkflow.includes('G47IX infographic discovery'));
  assert.ok(thumbnailWorkflow.includes('30 2 * * *'));
  assert.ok(thumbnailWorkflow.includes('node scripts/infographic-thumbnails.mjs --remote --skip-existing'));
  assert.ok(thumbnailWorkflow.includes('qa10-thumbnail-audit'));
  assert.equal(thumbnailWorkflow.includes('r2-sync.sh'), false, 'read-only thumbnail generation must not call R2 sync');
  assert.equal(thumbnailWorkflow.includes('CLOUDFLARE_API_TOKEN'), false, 'read-only thumbnail generation must not require R2 credentials');
});
