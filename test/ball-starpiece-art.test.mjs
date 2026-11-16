import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const store = read('public/store.js'), detail = read('public/detail.js'), sw = read('public/sw.js'), html = read('public/index.html');
const prov = JSON.parse(read('docs/asset-inventory/item-icons.json'));
const GP = createRequire(import.meta.url)('../public/go-pass-reward-art.js');

const SP = '/ico/i/star-piece.webp', GB = '/ico/i/great-ball.webp', UB = '/ico/i/ultra-ball.webp', PB = '/ico/i/poke-ball.webp';
const FILES = [SP, GB, UB, PB];

const src = store.slice(store.indexOf('var ICO = ['), store.indexOf('/* Owner-approved (15 Nov 2026)'));
const { icon } = new Function('window', 'var esc=window.GOLIB.esc;' + src + 'return {icon:icon};')({ GOLIB: { esc: s => String(s).replace(/"/g, '&quot;') } });
const srcOf = h => (h.match(/src="([^"]+)"/) || [])[1] || '';
const { itemIcon } = new Function(['ballIcon', 'eternatusIcon', 'pinapIcon'].map(f => detail.match(new RegExp('function ' + f + '\\(n\\) \\{[^\\n]*\\}\\n'))[0]).join('') + detail.match(/function itemIcon\(n\) \{[^\n]*\}\n/)[0] + 'return {itemIcon:itemIcon};')();

test('Store: exact names (optional xN suffix) get their picture', () => {
  for (const n of ['Star Piece', 'star piece', 'Star Piece x8', 'Star Piece ×8', 'Star Pieces ×8']) assert.equal(srcOf(icon(n)), SP, n);
  for (const n of ['Great Ball', 'Great Ball x20', 'great ball ×5']) assert.equal(srcOf(icon(n)), GB, n);
  for (const n of ['Ultra Ball', 'Ultra Ball x10']) assert.equal(srcOf(icon(n)), UB, n);
  for (const n of ['Poké Ball', 'Poke Ball', 'poké ball x25']) assert.equal(srcOf(icon(n)), PB, n);
});

test('Store: no false matches (bundles, packs, other balls, other items)', () => {
  for (const n of ['Star Piece Pack', 'Star Piece Bundle', 'Star Piece x0', 'Lucky Star Piece', 'Stardust', 'Star Piece x8 Bundle', 'Great Ball Bundle', 'Great Ball Box', 'Ultra Ball Bundle', 'Ultra Ball Box +1',
    'Poké Ball Bundle', 'Premier Ball', 'Master Ball', 'Safari Ball', 'Ball', 'Great', 'Ultra', 'Super Ball', 'Great Ball and Ultra Ball', 'Pokémon Ball', 'Poké Ball Set', 'Ultra Ball x', '']) assert.equal(icon(n), '', JSON.stringify(n));
});

test('Research chips: exact names, optional quantity prefix', () => {
  for (const [names, want] of [[['Star Piece', '3× Star Piece', '3x Star Piece'], SP], [['Great Ball', '10 × Great Ball', '10× Great Ball'], GB], [['Ultra Ball', '5× Ultra Ball'], UB], [['Poké Ball', 'Poke Ball', '10× Poké Ball'], PB]])
    for (const n of names) assert.equal(itemIcon(n), want, n);
  for (const n of ['Star Piece Pack', 'Great Ball Bundle', 'Great Balls', 'Premier Ball', 'Master Ball', 'Mega Ball', 'Poké Ball Plus', 'Ball']) assert.equal(itemIcon(n), '', JSON.stringify(n));
  assert.equal(itemIcon('Max Potion'), '/ico/i/max-potion.webp');
});

test('GO Pass rewards: exact names use the pictures, lookalikes keep their symbol', () => {
  for (const [n, want] of [['Star Piece', SP], ['Great Ball', GB], ['Ultra Ball', UB], ['Poké Ball', PB], ['Poke Ball', PB]]) assert.equal(GP.resolve({ name: n, type: 'item' }).src, want, n);
  for (const n of ['Star Piece Pack', 'Great Ball Bundle', 'Premier Ball', 'Master Ball']) assert.equal(GP.resolve({ name: n, type: 'item' }).src, null, n);
  assert.equal(GP.resolve({ name: 'Premier Ball', type: 'item' }).symbol, 'PR');
});

test('pictures are 128px-max local webp files matching their recorded checksum and provenance', () => {
  for (const f of FILES) {
    const e = prov.entries.find(x => '/' + x.path.replace(/^public\//, '') === f);
    assert.ok(e, f);
    const buf = fs.readFileSync(new URL(e.path, root));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), e.sha256, f);
    assert.equal(buf.length, e.bytes, f);
    assert.equal(buf.subarray(0, 4).toString(), 'RIFF'); assert.equal(buf.subarray(8, 12).toString(), 'WEBP');
    assert.equal(Math.max(e.width, e.height), 128, f);
    assert.match(e.provenance, /^supplied by owner/); assert.match(e.provenance, /Pok.mon artwork belongs to its owners$/);
    assert.doesNotMatch(JSON.stringify(e), /licen[cs]ed? (under|to)|CC0|public domain/i);
  }
});

test('store icons are decorative, lazy and sized; no new hosts; version tokens and shell cache current', () => {
  const h = icon('Great Ball x20');
  assert.match(h, /alt=""/); assert.match(h, /loading="lazy"/); assert.match(h, /width="40" height="40"/); assert.doesNotMatch(h, /https?:/);
  for (const f of FILES) assert.ok(store.includes(f) && detail.includes(f), f);
  assert.match(sw, /gofn-shell-v376/);
  assert.match(html, /go-pass-reward-art\.js\?v=20261118e/); assert.match(sw, /go-pass-reward-art\.js\?v=20261118e/);
});
