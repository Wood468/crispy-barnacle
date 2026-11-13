import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Store source art candidates are pinned and never silently deployed', () => {
  const data=JSON.parse(readFileSync(new URL('../data/store-artwork-candidates.json',import.meta.url),'utf8'));
  assert.equal(data.schemaVersion,1);
  assert.match(data.sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(data.runtimeUseAuthorized,false);
  assert.match(data.sourceDisclaimer,/do NOT establish/);
  assert.equal(data.entries.length,9);
  const ids=new Set(),paths=new Set();
  for(const item of data.entries) {
    assert.match(item.id,/^[a-z0-9-]+$/);
    assert.ok(!ids.has(item.id)); ids.add(item.id);
    assert.match(item.sourcePath,/^Images\/Items\/[A-Za-z0-9_.-]+\.png$/);
    assert.ok(!paths.has(item.sourcePath)); paths.add(item.sourcePath);
    assert.match(item.sourceBlobSha,/^[a-f0-9]{40}$/);
    assert.ok(item.bytes>0);
    assert.equal(item.status,'candidate-not-verified');
    assert.equal(item.approvedForRuntime,false);
  }
  const store=readFileSync(new URL('../public/store.js',import.meta.url),'utf8');
  for(const item of data.entries)
    assert.ok(!store.includes(item.sourcePath),'unapproved art cannot load: '+item.id);
  assert.match(store,/data-sp-art="category-token"/);
});
