import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const R = createRequire(import.meta.url)('../public/go-pass-reward-art.js');
const prov = JSON.parse(fs.readFileSync(new URL('docs/asset-inventory/item-icons.json', root), 'utf8'));
const dir = new URL('public/ico/c/', root);
const detail = fs.readFileSync(new URL('public/detail.js', root), 'utf8');

test('manifest, files and provenance agree exactly', () => {
  const files = fs.readdirSync(dir).sort();
  const slugs = R.candySlugs();
  assert.deepEqual(files, slugs.flatMap(s => [s + '-xl.webp', s + '.webp']).sort());
  assert.deepEqual(Object.keys(prov.candy.files).sort(), files);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const f of files) {
    const buf = fs.readFileSync(new URL(f, dir));
    const [sha, bytes] = prov.candy.files[f].split(':');
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), sha, f);
    assert.equal(buf.length, Number(bytes), f);
    assert.equal(buf.subarray(0, 4).toString(), 'RIFF');
    assert.ok(buf.length < 20000, f);
  }
  assert.match(prov.candy.provenance, /^supplied by owner/);
  assert.doesNotMatch(prov.candy.note + prov.candy.provenance, /licen[cs]ed? (under|to)|CC0|public domain/i);
});

test('exact species candy names get their picture', () => {
  assert.equal(R.candyIcon('Machop Candy'), '/ico/c/machop.webp');
  assert.equal(R.candyIcon('Ralts Candy'), '/ico/c/ralts.webp');
  assert.equal(R.candyIcon('Machop Candy XL'), '/ico/c/machop-xl.webp');
  assert.equal(R.candyIcon('10× Machop Candy'), '/ico/c/machop.webp');
  assert.equal(R.candyIcon('3x ralts candy xl'), '/ico/c/ralts-xl.webp');
  assert.equal(R.candyIcon('Mr. Mime Candy'), '/ico/c/mr-mime.webp');
  assert.equal(R.candyIcon('Nidoran♀ Candy'), '/ico/c/nidoran-f.webp');
  assert.equal(R.resolve({ name: 'Ralts Candy' }).src, '/ico/c/ralts.webp');
});

test('no fuzzy matching: other wording and unknown names keep the glyph', () => {
  for (const n of ['Rare Candy', 'Rare Candy XL', 'Candy Bar', 'Machop', 'Zzz Candy', 'Machop Candy Bar', 'Machop Candy 2', 'Candy', 'Candy XL', 'XL Candy', 'Machoke Candy Bonus', 'Machop XL Candy', '']) assert.equal(R.candyIcon(n), '', n);
  assert.equal(R.resolve({ name: 'Zzz Candy' }).symbol, 'C');
  assert.equal(R.resolve({ name: 'Rare Candy XL' }).src, '/ico/i/rare-candy-xl.webp');
  assert.equal(R.resolve({ name: 'Eternatus Candy' }).src, '/ico/i/eternatus-candy.webp');
  assert.equal(R.resolve({ name: 'Eternatus Candy XL' }).src, '/ico/i/eternatus-candy-xl.webp');
});

test('research reward chip renders the candy picture instead of the C glyph', () => {
  const fn = detail.match(/function itemIcon\(n\) \{[^\n]*\}\n/)[0];
  const stub = ['eternatusIcon', 'pinapIcon', 'ownerIcon'].map(x => 'function ' + x + '(){return ""}').join('');
  globalThis.GOGoPassRewardArt = R;
  try {
    const itemIcon = new Function(stub + fn + 'return itemIcon;')();
    assert.equal(itemIcon('Machop Candy'), '/ico/c/machop.webp');
    assert.equal(itemIcon('Zzz Candy'), '');
  } finally { delete globalThis.GOGoPassRewardArt; }
  assert.match(detail, /var icon = itemIcon\(item\.name\);\s*\n\s*var glyph = icon \? null : researchItemGlyph\(item\.name\);/);
});
