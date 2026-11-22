import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = name => JSON.parse(readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
const publisher = load('store-artwork-publisher-references.json');
const candidates = load('store-artwork-candidates.json');

test('publisher image references remain evidence-only, not runtime art approval', () => {
  assert.equal(publisher.runtimeUseAuthorized, false);
  assert.equal(publisher.approvedImages, 0);
  assert.ok(publisher.entries.length > 0);
  const ids = new Set(), urls = new Set();
  for (const row of publisher.entries) {
    assert.ok(row.id && row.item && row.listingEvidence, 'each reference needs exact identity and evidence');
    assert.ok(!ids.has(row.id), 'duplicate publisher identity: ' + row.id);
    ids.add(row.id);
    assert.equal(row.approvedForRuntime, false, row.id);
    assert.equal(row.rightsStatus, 'not-cleared', row.id);
    assert.notEqual(row.deliveryStatus, 'approved', row.id);
    const url = new URL(row.publisherImageUrl);
    assert.equal(url.protocol, 'https:', row.id);
    assert.equal(url.hostname, 'assets.pgo.webstore.nianticlabs.com', row.id);
    assert.match(url.pathname, /^\/pgo\/image_variants\/v1\/sku_assets\/[^/]+\/w\d+\.webp$/, row.id);
    assert.equal(url.search, '', row.id);
    assert.ok(!urls.has(url.href), 'shared exact-item URL requires review: ' + row.id);
    urls.add(url.href);
  }
});

test('candidate asset references remain pinned and cannot be silently promoted', () => {
  assert.equal(candidates.runtimeUseAuthorized, false);
  assert.match(candidates.sourceCommit, /^[0-9a-f]{40}$/);
  const ids = new Set(), paths = new Set();
  for (const row of candidates.entries) {
    assert.ok(row.id && row.item, 'candidate identity is required');
    assert.ok(!ids.has(row.id), 'duplicate candidate identity: ' + row.id);
    ids.add(row.id);
    assert.equal(row.approvedForRuntime, false, row.id);
    assert.equal(row.status, 'candidate-not-verified', row.id);
    assert.match(row.sourceBlobSha, /^[0-9a-f]{40}$/, row.id);
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0, row.id);
    assert.match(row.sourcePath, /^Images\/Items\/[a-zA-Z0-9_.-]+\.png$/, row.id);
    assert.ok(!paths.has(row.sourcePath), 'duplicate candidate asset: ' + row.id);
    paths.add(row.sourcePath);
  }
});

test('matching publisher and candidate item identities remain aligned', () => {
  const sourceById = new Map(candidates.entries.map(x => [x.id, x]));
  for (const row of publisher.entries) {
    const candidate = sourceById.get(row.id);
    if (candidate) {
      const normalize = x => x.toLowerCase().replace(/[^a-z0-9]/g, '');
      assert.equal(normalize(row.item).replace(/upgrade$/, ''), normalize(candidate.item).replace(/upgrade$/, ''), row.id);
    }
  }
});
