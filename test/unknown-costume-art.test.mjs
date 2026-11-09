import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../public/detail.js',import.meta.url),'utf8');
const start=src.indexOf('  function exactArt(p) {');
const end=src.indexOf('  var TRUST_LABEL',start);
assert.ok(start>=0&&end>start,'shared exactArt renderer must exist');
const renderer=src.slice(start,end);

test('unmapped costumes cannot borrow generic species art',()=>{
  assert.match(renderer,/p\.costumeId\s*&&\s*!p\.assetKey/);
  assert.match(renderer,/costume-unavailable/);
  assert.ok(renderer.indexOf('p.costumeId&&!p.assetKey')<renderer.indexOf('return G.art('),'costume guard must precede art request');
});

test('explicitly mapped costume art and other exact forms retain normal rendering',()=>{
  assert.match(renderer,/return G\.art\(/);
  assert.match(renderer,/asset:p\.assetKey\|\|undefined/);
  assert.match(renderer,/p\.formId&&!p\.costumeId/);
});
