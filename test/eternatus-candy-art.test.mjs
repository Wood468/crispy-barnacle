import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const detail = fs.readFileSync(new URL('public/detail.js', root), 'utf8');
const sw = fs.readFileSync(new URL('public/sw.js', root), 'utf8');
const prov = JSON.parse(fs.readFileSync(new URL('docs/asset-inventory/item-icons.json', root), 'utf8'));

function load() {
  const a = detail.match(/function eternatusIcon\(n\) \{[^\n]*\}\n/);
  const c = detail.match(/function pinapIcon\(n\) \{[^\n]*\}\n/);
  const d = detail.match(/function ownerIcon\(n\) \{[^\n]*\}\n/);
  const b = detail.match(/function itemIcon\(n\) \{[^\n]*\}\n/);
  assert.ok(a && b && c && d, 'icon functions exist');
  return new Function(a[0] + c[0] + d[0] + b[0] + 'return { eternatusIcon: eternatusIcon, pinapIcon: pinapIcon, itemIcon: itemIcon };')();
}
const { eternatusIcon, pinapIcon, itemIcon } = load();
const PINAP = '/ico/i/pinap-berry.webp', CANDY = '/ico/i/eternatus-candy.webp', XL = '/ico/i/eternatus-candy-xl.webp';

test('Eternatus Candy uses the candy picture, with or without a quantity prefix', () => {
  for (const n of ['Eternatus Candy', 'eternatus candy', '25× Eternatus Candy', '10× Eternatus Candy', '10x Eternatus Candy', '1,000 × Eternatus Candy', '  Eternatus   Candy ']) assert.equal(itemIcon(n), CANDY, n);
});

test('Eternatus Candy XL (and Eternatus XL Candy) use the XL picture', () => {
  for (const n of ['Eternatus Candy XL', '5× Eternatus Candy XL', 'Eternatus XL Candy', 'eternatus candy xl']) assert.equal(itemIcon(n), XL, n);
});

test('no lookalike matching: other candy, Rare Candy, other species and loose strings are untouched', () => {
  for (const n of ['Rare Candy', 'Rare Candy XL', 'XL Candy', 'Candy', 'Candy XL', 'Pikachu Candy', 'Pikachu Candy XL', 'Eternatus', 'Eternamax Eternatus', 'Eternatus Sticker',
    'Eternatus Candy Bonus', 'Not Eternatus Candy', 'Eternatus Candy XL Extra', 'Eternatus Candies', 'Duraludon Candy', 'Mega Eternatus Candy', '']) assert.equal(eternatusIcon(n), '', JSON.stringify(n));
  assert.equal(itemIcon('Rare Candy'), '/ico/i/rare-candy.webp');
  assert.equal(itemIcon('Pikachu Candy'), '');
  assert.equal(itemIcon('XL Candy'), '');
});

test('combined reward text keeps its existing behaviour', () => {
  assert.equal(eternatusIcon('Eternatus Candy 1 × Silver Pinap Berry'), '');
  assert.equal(itemIcon('Eternatus Candy 1 × Silver Pinap Berry'), '/ico/i/silver-pinap.webp');
  assert.equal(itemIcon('Eternatus Candy 2000 × Stardust Duraludon Drampa'), '/ico/dust.webp');
});

test('other item pictures are unchanged', () => {
  assert.equal(itemIcon('Stardust'), '/ico/dust.webp');
  assert.equal(itemIcon('Max Potion'), '/ico/i/max-potion.webp');
  assert.equal(itemIcon('Golden Razz Berry'), '/ico/i/golden-razz.webp');
  assert.equal(itemIcon('Mega Energy'), '/ico/g/mega.webp');
  assert.equal(itemIcon('Premier Ball'), '');
});

test('the generic candy glyph stays as the fallback for any other candy', () => {
  assert.match(detail, /\\bcandy\( xl\)\?\\b\/i\.test\(name\)\) return \{ kind: 'candy', svg: '<svg/);
  assert.match(detail, /var icon = itemIcon\(item\.name\);\s*\n\s*var glyph = icon \? null : researchItemGlyph\(item\.name\);/);
});

test('pictures are local webp files whose bytes match the recorded checksum and provenance', () => {
  assert.equal(prov.entries.length, 25);
  for (const e of prov.entries) {
    const buf = fs.readFileSync(new URL(e.path, root));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), e.sha256, e.path);
    assert.equal(buf.length, e.bytes, e.path);
    assert.equal(buf.subarray(0, 4).toString(), 'RIFF');
    assert.equal(buf.subarray(8, 12).toString(), 'WEBP');
    assert.ok(buf.length < 20000, 'small');
    assert.match(e.path, /^public\/ico\/i\/[a-z0-9-]+\.webp$/);
    assert.match(e.provenance, /^supplied by owner/);
    assert.match(e.provenance, /Pok.mon artwork belongs to its owners$/);
    assert.doesNotMatch(JSON.stringify(e), /licen[cs]ed? (under|to)|CC0|public domain/i);
  }
  assert.deepEqual(prov.entries.map(e => '/' + e.path.replace(/^public\//, '')).sort(), [CANDY, XL, PINAP, "/ico/i/item-bag.webp", "/ico/i/pokemon-storage.webp", "/ico/i/star-piece.webp", "/ico/i/poke-ball.webp", "/ico/i/great-ball.webp", "/ico/i/ultra-ball.webp", "/ico/i/rare-candy.webp", "/ico/i/rare-candy-xl.webp", "/ico/i/lucky-egg.webp", "/ico/i/egg-incubator.webp", "/ico/i/super-incubator.webp", "/ico/i/nanab-berry.webp", "/ico/i/max-mushroom.webp", "/ico/i/revive.webp", "/ico/i/potion.webp", "/ico/i/hyper-potion.webp", "/ico/i/super-potion.webp", "/ico/i/remote-raid-pass.webp", "/ico/i/max-particle-pack.webp", "/ico/i/lure-module.webp", "/ico/i/link-charge.webp", "/ico/i/premium-battle-pass.webp"].sort());
});

test('no hotlinking: the pictures are same-origin paths and the shell cache moved to v376', () => {
  assert.doesNotMatch(detail.match(/function eternatusIcon[^\n]*/)[0], /https?:/);
  assert.ok(Number(/const SHELL_CACHE = 'gofn-shell-v(\d+)'/.exec(sw)[1]) >= 373);
});

test('Pinap Berry (exact, optional quantity prefix) uses the Pinap picture', () => {
  for (const n of ['Pinap Berry', 'pinap berry', '3\u00d7 Pinap Berry', '10x Pinap Berry', ' Pinap  Berry ']) assert.equal(itemIcon(n), PINAP, n);
});

test('Pinap picture is never used for Silver Pinap, Golden Razz or any other berry', () => {
  assert.equal(itemIcon('Silver Pinap Berry'), '/ico/i/silver-pinap.webp');
  assert.equal(itemIcon('3\u00d7 Silver Pinap Berry'), '/ico/i/silver-pinap.webp');
  assert.equal(itemIcon('Golden Razz Berry'), '/ico/i/golden-razz.webp');
  for (const n of ['Razz Berry', 'Nanab Berry', 'Pinap', 'Pinap Berries', 'Silver Pinap Berry', 'Golden Pinap Berry', 'Eternatus Candy 1 \u00d7 Silver Pinap Berry', 'Pinap Berry Bonus', 'Not Pinap Berry', 'Wepar Berry', 'Berry', '']) assert.equal(pinapIcon(n), '', JSON.stringify(n));
  for (const n of ['Razz Berry', 'Wepar Berry', 'Pinap']) assert.equal(itemIcon(n), '', n);
  assert.match(detail, /\(berry\|pinap\|razz\|nanab/);
});
