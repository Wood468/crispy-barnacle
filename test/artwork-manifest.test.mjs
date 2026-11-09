import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildManifest, queueEntries } from '../scripts/artwork-manifest.mjs';
const V = createRequire(import.meta.url)('../public/variant-art.js');
const rd = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const manifest = rd('../public/artwork-manifest.json'), queue = rd('../docs/asset-inventory/candidate-queue.json');

test('the committed manifest is exactly what the build produces', () => {
  const built = buildManifest({ costumes: rd('../public/costumes.json'), queue, index: rd('../docs/asset-inventory/pokeminers-index.json'), dex: rd('../public/dex.json'), previous: manifest });
  assert.deepEqual(built, manifest);
});
test('every entry is approved with a safe URL and a provenance trail', () => {
  for (const [key, e] of Object.entries(manifest.entries)) {
    assert.equal(e.status, 'approved', key); assert.match(e.url, V.SAFE_URL, key);
    assert.ok(['legacy', 'pokeminers'].includes(e.source), key); assert.ok(e.rights, key);
    assert.match(e.sha256, /^[0-9a-f]{64}$/, key + ' needs a checksum');
    assert.doesNotThrow(() => V.variantKey({ dex: key.split('|')[0], kind: key.split('|')[2], costume: key.split('|')[3] || undefined }), key);
  }
});
test('new-pipeline entries are visually confirmed and carry source path, commit, blob and sha256', () => {
  const fresh = Object.entries(manifest.entries).filter(([, e]) => e.source === 'pokeminers');
  assert.equal(fresh.length, 8);
  for (const [key, e] of fresh) {
    assert.equal(e.review, 'visually-confirmed', key); assert.equal(e.reviewedBy, 'Claude (Sonnet 5.5)');
    assert.match(e.sourcePath, /^Images\/Pokemon\/Addressable Assets\/pm\d+\.f[A-Z0-9_]+(\.s)?\.icon\.png$/); assert.match(e.sourceCommit, /^[0-9a-f]{40}$/); assert.match(e.blobSha, /^[0-9a-f]{40}$/);
    assert.equal(key.endsWith('|shiny'), e.sourcePath.includes('.s.icon'), 'shiny entries use the shiny file only');
  }
});
test('the six priority assets: four approved, Sinistea a candidate, the tee an avatar item', () => {
  const by = Object.fromEntries(queue.items.map(i => [i.id, i]));
  for (const id of ['pikachu-sun-crown', 'pikachu-moon-crown', 'espeon-sun-scarf', 'umbreon-moon-scarf']) { assert.equal(by[id].status, 'approved', id); assert.equal(by[id].approvedAsset.review.status, 'visually-confirmed'); assert.ok(manifest.entries[V.variantKey({ dex: by[id].dex, kind: 'costume', costume: by[id].costume })], id); }
  assert.equal(by['sinistea-bow'].status, 'candidate'); assert.equal(by['sinistea-bow'].approvedAsset, null);
  assert.equal(by['sinistea-bow-antique'].status, 'not-found');
  assert.equal(by['wild-area-purple-tee'].kind, 'avatar-clothing'); assert.equal(by['wild-area-purple-tee'].approvedAsset, null);
  assert.ok(!Object.keys(manifest.entries).some(k => k.startsWith('854|')), 'no Sinistea entry until a person approves a file');
});
test('an approved queue item without a visual review or checksum cannot reach the manifest', () => {
  const bad = structuredClone(queue); bad.items.find(i => i.id === 'pikachu-sun-crown').approvedAsset.review = { status: 'unverified' };
  assert.throws(() => queueEntries(bad), /visual review/);
  const nohash = structuredClone(queue); nohash.items.find(i => i.id === 'espeon-sun-scarf').approvedAsset.normal.sha256 = '';
  assert.throws(() => queueEntries(nohash), /sha256/);
});
test('the PokeMiners Gigantamax list comes from the index and every listed species resolves by rule', () => {
  assert.ok(manifest.pokeminers.gigantamax.length >= 10);
  const dex = Object.fromEntries(rd('../public/dex.json').map(p => [p[0], p[1]]));
  for (const d of manifest.pokeminers.gigantamax) assert.match(V.resolve({ n: 'Gigantamax ' + dex[d], dex: d }, { entries: {}, pokeminers: manifest.pokeminers }, {}).src, /dynamax=1$/);
});
test('the purple tee is recorded as an avatar item, never as a missing Pokémon costume', () => {
  const c = rd('../public/costumes.json');
  assert.ok(c.avatar.includes('tee|purple'), 'purple tee stays classified as avatar clothing');
  assert.ok(c.avatar.includes('espeon (sun scarf)|sun scarf'), 'approved Espeon scarf is retained');
  assert.ok(c.avatar.includes('umbreon (moon scarf)|moon scarf'), 'approved Umbreon scarf is retained');
  assert.ok(!c.missing.some(m => /^tee\|/.test(m)));
  assert.ok(!Object.values(c.pictures).some(u => /tee/i.test(u)));
});
import { renderGallery } from '../scripts/artwork-gallery.mjs';
test('the owner gallery is current, escapes content and only links https sources', () => {
  assert.equal(fs.readFileSync(new URL('../docs/asset-inventory/approval-gallery.html', import.meta.url), 'utf8'), renderGallery(queue));
  const evil = structuredClone(queue); evil.items[0].identityEvidence = ['<script>alert(1)</script>']; evil.items[0].candidates[0].url = 'javascript:alert(1)';
  const html = renderGallery(evil); assert.doesNotMatch(html, /<script>alert/); assert.doesNotMatch(html, /src="javascript/);
});
