import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const R = createRequire(import.meta.url)('../public/go-pass-reward-art.js');
const prov = JSON.parse(fs.readFileSync(new URL('docs/asset-inventory/item-icons.json', root), 'utf8'));
const dir = new URL('public/ico/m/', root);
const detail = fs.readFileSync(new URL('public/detail.js', root), 'utf8');

test('manifest, files and provenance agree exactly', () => {
  const files = fs.readdirSync(dir).sort();
  const slugs = R.megaSlugs();
  assert.deepEqual(files, slugs.map(s => s + '.webp').sort());
  assert.deepEqual(Object.keys(prov.mega.files).sort(), files);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const f of files) {
    const buf = fs.readFileSync(new URL(f, dir));
    const [sha, bytes] = prov.mega.files[f].split(':');
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), sha, f);
    assert.equal(buf.length, Number(bytes), f);
    assert.equal(buf.subarray(0, 4).toString(), 'RIFF');
    assert.ok(buf.length < 20000, f);
  }
  assert.match(prov.mega.provenance, /^supplied by owner/);
  assert.match(prov.mega.provenance, /CC BY-NC-SA/);
});

test('exact Mega Energy names get their picture', () => {
  assert.equal(R.megaEnergyIcon('Lucario Mega Energy'), '/ico/m/lucario.webp');
  assert.equal(R.megaEnergyIcon('Manectric Mega Energy'), '/ico/m/manectric.webp');
  assert.equal(R.megaEnergyIcon('25× Manectric Mega Energy'), '/ico/m/manectric.webp');
  assert.equal(R.megaEnergyIcon('Charizard Mega Energy X'), '/ico/m/charizard-x.webp');
  assert.equal(R.megaEnergyIcon('mewtwo mega energy y'), '/ico/m/mewtwo-y.webp');
  assert.equal(R.resolve({ name: 'Lucario Mega Energy' }).src, '/ico/m/lucario.webp');
});

test('no fuzzy matching: unified X/Y names, unknown names and other wording keep the glyph', () => {
  for (const n of ['Charizard Mega Energy', 'Raichu Mega Energy', 'Sableye Mega Energy', 'Zzz Mega Energy', 'Mega Energy', 'Lucario Mega Energy Bonus', 'Mega Lucario Energy', 'Lucario Mega Energy Z', 'Lucario Primal Energy', 'Lucario Candy', '']) assert.equal(R.megaEnergyIcon(n), '', n);
  assert.equal(R.candyIcon('Lucario Mega Energy'), '');
  assert.equal(R.resolve({ name: 'Zzz Mega Energy' }).kind, 'symbol');
});

test('research reward chip renders the Mega Energy picture', () => {
  const fn = detail.match(/function itemIcon\(n\) \{[^\n]*\}\n/)[0];
  const stub = ['eternatusIcon', 'pinapIcon', 'ownerIcon'].map(x => 'function ' + x + '(){return ""}').join('');
  globalThis.GOGoPassRewardArt = R;
  try {
    const itemIcon = new Function(stub + fn + 'return itemIcon;')();
    assert.equal(itemIcon('Lucario Mega Energy'), '/ico/m/lucario.webp');
    assert.equal(itemIcon('Zzz Mega Energy'), '/ico/g/mega.webp');
  } finally { delete globalThis.GOGoPassRewardArt; }
});
