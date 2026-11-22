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
const RC = '/ico/i/rare-candy.webp', RX = '/ico/i/rare-candy-xl.webp', LE = '/ico/i/lucky-egg.webp', EI = '/ico/i/egg-incubator.webp', SI = '/ico/i/super-incubator.webp';
const NB = '/ico/i/nanab-berry.webp', MM = '/ico/i/max-mushroom.webp', RV = '/ico/i/revive.webp', PT = '/ico/i/potion.webp', HP = '/ico/i/hyper-potion.webp', SPT = '/ico/i/super-potion.webp', RR = '/ico/i/remote-raid-pass.webp';
const MP = '/ico/i/max-particle-pack.webp', LM = '/ico/i/lure-module.webp', LC = '/ico/i/link-charge.webp', PBP = '/ico/i/premium-battle-pass.webp';
const FILES = [SP, GB, UB, PB, RC, RX, LE, EI, SI, NB, MM, RV, PT, HP, SPT, RR, MP, LM, LC, PBP];

const src = store.slice(store.indexOf('var ICO = ['), store.indexOf('/* Owner-approved (15 Nov 2026)'));
const { icon } = new Function('window', 'var esc=window.GOLIB.esc;' + src + 'return {icon:icon};')({ GOLIB: { esc: s => String(s).replace(/"/g, '&quot;') } });
const srcOf = h => (h.match(/src="([^"]+)"/) || [])[1] || '';
const { itemIcon } = new Function(['ownerIcon', 'eternatusIcon', 'pinapIcon'].map(f => detail.match(new RegExp('function ' + f + '\\(n\\) \\{[^\\n]*\\}\\n'))[0]).join('') + detail.match(/function itemIcon\(n\) \{[^\n]*\}\n/)[0] + 'return {itemIcon:itemIcon};')();

test('Store: exact names (optional xN suffix) get their picture', () => {
  for (const n of ['Star Piece', 'star piece', 'Star Piece x8', 'Star Piece ×8', 'Star Pieces ×8']) assert.equal(srcOf(icon(n)), SP, n);
  for (const n of ['Great Ball', 'Great Ball x20', 'great ball ×5']) assert.equal(srcOf(icon(n)), GB, n);
  for (const n of ['Ultra Ball', 'Ultra Ball x10']) assert.equal(srcOf(icon(n)), UB, n);
  for (const n of ['Poké Ball', 'Poke Ball', 'poké ball x25']) assert.equal(srcOf(icon(n)), PB, n);
});

test('Store: Rare Candy, Rare Candy XL, Lucky Egg and incubators (exact, optional xN) and no cross matches', () => {
  for (const [names, want] of [[['Rare Candy', 'Rare Candy x3'], RC], [['Rare Candy XL', 'Rare Candy XL x2', 'rare candy xl ×2'], RX], [['Lucky Egg', 'Lucky Egg x8'], LE], [['Egg Incubator', 'Egg Incubator x3', 'Egg Incubators ×3'], EI], [['Super Incubator', 'Super Incubator x2'], SI]])
    for (const n of names) assert.equal(srcOf(icon(n)), want, n);
  for (const n of ['Zzz Candy', 'Candy', 'Candy XL', 'XL Candy', 'Rare Candy Pack', 'Rare Candy XL Bundle', 'Lucky Egg Bundle', 'Lucky Eggs Pack', 'Golden Lucky Egg', 'Incubator', 'Egg', 'Egg Incubator Bundle', 'Super Incubator Pack', 'Super Egg Incubator', 'Basic Incubator', 'Rare Candy x0', '']) assert.equal(icon(n), '', JSON.stringify(n));
});

test('Research chips and GO Pass: the five new items are exact, Rare Candy and XL never cross', () => {
  for (const [n, want] of [['Rare Candy', RC], ['10× Rare Candy', RC], ['Rare Candy XL', RX], ['3× Rare Candy XL', RX], ['Lucky Egg', LE], ['Egg Incubator', EI], ['2× Super Incubator', SI]]) { assert.equal(itemIcon(n), want, n); }
  for (const [n, want] of [['Rare Candy', RC], ['Rare Candy XL', RX], ['Lucky Egg', LE], ['Egg Incubator', EI], ['Super Incubator', SI]]) assert.equal(GP.resolve({ name: n, type: 'item' }).src, want, n);
  for (const n of ['Zzz Candy', 'Candy', 'Candy XL', 'Rare Candy Pack', 'Lucky Egg Pack', 'Incubator', 'Egg Incubator Bundle', 'Super Incubator Pack', 'Zzz Candy XL']) { assert.equal(itemIcon(n), '', n); assert.equal(GP.resolve({ name: n, type: 'item' }).src, null, n); }
});

test('Nanab, Max Mushroom, Revive, Potions and Remote Raid Pass: exact in Store, chips and GO Pass; Max Revive/Max Potion/Raid Pass keep theirs', () => {
  const cases = [[['Nanab Berry', 'Nanab Berries x3'], NB, 'Nanab Berry'], [['Max Mushroom', 'Max Mushroom x3'], MM, 'Max Mushroom'], [['Revive', 'Revive x10', 'Revives x10'], RV, 'Revive'], [['Potion', 'Potion x10'], PT, 'Potion'], [['Hyper Potion', 'Hyper Potion x5'], HP, 'Hyper Potion'], [['Super Potion', 'Super Potions x5'], SPT, 'Super Potion'], [['Remote Raid Pass', 'Remote Raid Pass x2', 'Remote Raid Passes ×3'], RR, 'Remote Raid Pass']];
  for (const [names, want, plain] of cases) {
    for (const n of names) assert.equal(srcOf(icon(n)), want, n);
    assert.equal(itemIcon(plain), want, plain); assert.equal(itemIcon('4× ' + plain), want, plain);
    assert.equal(GP.resolve({ name: plain, type: 'item' }).src, want, plain);
  }
  assert.equal(srcOf(icon('Max Revive')), '/ico/i/max-revive.webp'); assert.equal(itemIcon('Max Revive'), '/ico/i/max-revive.webp'); assert.equal(GP.resolve({ name: 'Max Revive' }).src, '/ico/i/max-revive.webp');
  assert.equal(srcOf(icon('Max Potions x10')), '/ico/i/max-potion.webp'); assert.equal(itemIcon('Max Potion'), '/ico/i/max-potion.webp');
  assert.equal(srcOf(icon('Raid Pass')), '/ico/g/raidpass.webp'); assert.equal(GP.resolve({ name: 'Raid Pass' }).src, '/ico/g/raidpass.webp');
  for (const n of ['Revive Pack', 'Potion Bundle', 'Hyper Potion Box', 'Super Potion Pack', 'Max Potion Box', 'Max Mushroom Pack', 'Nanab Berry Bundle', 'Razz Berry', 'Mushroom', 'Remote Raid Pass Bundle', 'Remote Raid Pass + Max Particle', 'Max Particle Pack + Remote Raid Pass', 'Premium Battle Pass Bundle', 'Revive x0', 'Full Restore', 'Regular Potion', 'Lucky Potion']) { assert.equal(icon(n).includes('/ico/i/revive') || srcOf(icon(n)) === '' || /max-potion|raidpass/.test(icon(n)), true, n); assert.ok(![RV, PT, HP, SPT, RR, NB, MM].includes(srcOf(icon(n))), n); assert.ok(![RV, PT, HP, SPT, RR, NB, MM].includes(itemIcon(n)), n); assert.ok(![RV, PT, HP, SPT, RR, NB, MM].includes(GP.resolve({ name: n }).src), n); }
});

test('Max Particle Pack, Lure Module, Link Charge, Premium Battle Pass: exact only', () => {
  for (const [names, want] of [[['Max Particle Pack', 'Max Particle Pack x6', 'Max Particles'], MP], [['Lure Module', 'Lure Module x3'], LM], [['Link Charge', 'Link Charges'], LC], [['Premium Battle Pass', 'Premium Battle Pass x3'], PBP]])
    for (const n of names) assert.equal(srcOf(icon(n)), want, n);
  for (const [n, want] of [['Max Particle Pack', MP], ['Max Particles', MP], ['Lure Module', LM], ['Link Charge', LC], ['Link Charges', LC], ['Premium Battle Pass', PBP]]) { assert.equal(itemIcon(n), want, n); assert.equal(GP.resolve({ name: n }).src, want, n); }
  const ours = [MP, LM, LC, PBP];
  for (const n of ['Glacial Lure Module', 'Golden Lure Module', 'Magnetic Lure Module', 'Mossy Lure Module', 'Rainy Lure Module', 'Lure', 'Lure Module Bundle', '600 Link Charge', '600 Link Charge + 3 Remote Raid Pass', 'Max Particle Pack + Remote Raid Pass', '3 Max Particle Pack + 3 Remote Raid Pass', 'Max Mushroom', 'Max', 'Max Particle', 'Link', 'Charge', 'Premium Battle Pass Bundle', 'Battle Pass', 'Raid Pass Bundle', 'GO Pass', 'Go Pass Deluxe', 'Battle League Pass', 'Premium Raid Pass', 'Remote Raid Pass x2 Premium Battle Pass'])
    for (const f of [x => srcOf(icon(x)), itemIcon, x => GP.resolve({ name: x }).src]) assert.ok(!ours.includes(f(n)), n);
  assert.equal(srcOf(icon('Raid Pass')), '/ico/g/raidpass.webp'); assert.equal(srcOf(icon('Remote Raid Pass')), RR);
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
  assert.match(sw, /gofn-shell-v388/);
  assert.match(html, /go-pass-reward-art\.js\?v=20261122b/); assert.match(sw, /go-pass-reward-art\.js\?v=20261122b/);
});
