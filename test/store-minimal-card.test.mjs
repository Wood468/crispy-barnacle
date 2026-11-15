import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { OBSERVATIONS } from '../src/regional-observations.js';

/* Owner request: the Store shows ONLY the item name, an image where an exact
   one exists, and each region's price. No provenance sentences on the card. */
const require = createRequire(import.meta.url);
const R = require('../public/regional-prices.js');
const source = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');

const FORBIDDEN = [
  /last verified/i, /Seen in official Store snapshot/i, /regional prices are dated observations/i,
  /Official published product/i, /no matched AU/i, /Current Store availability not confirmed/i,
  /historical\/modelled/i, /FX · /, /Recorded · not re-checked/i, /Verified · /,
  /Based on \d+ comparable/i, /Not observed/, /Included in the published offer/i,
  /Official description/i, /confidence/i, /Distinct official SKU/i,
  /exact SKU; item name not recorded/i, /no exact AU SKU pairing/i, /regional availability not verified/i,
  /Estimate Rp/, /dated observations/i, /Previous offer/i
];

async function render({ prices, regional = [], snapshot = null, owner = true }) {
  const handlers = {};
  const el = { innerHTML: '', id: '', querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (name, fn) => { handlers[name] = fn; } };
  const host = { parentNode: { insertBefore: (n) => { Object.assign(el, n); } } };
  const data = { owner, prices, regional };
  const win = { GORegionalPrices: R,
    GOStoreOfferIdentities: require('../public/store-offer-identities.js'),
    fetch: url => url === '/store-current-snapshot.json'
      ? Promise.resolve({ ok: !!snapshot, json: async () => snapshot }) : Promise.reject(Error('offline')),
    GOLIB: { esc: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'),
      loadPrices: () => Promise.resolve(data), priceView: () => ({ sub: '', save: '', main: '' }) },
    GODASH: {}, localStorage: { getItem: () => null, setItem() {} }, console };
  const doc = { readyState: 'complete', getElementById: id => id === 'evsource' ? host : null,
    createElement: () => el, addEventListener() {} };
  Object.assign(win, { document: doc }); win.window = win;
  vm.runInNewContext(source, win);
  await new Promise(r => setTimeout(r, 40));
  const cards = [...el.innerHTML.matchAll(/<article class="sp-product"[\s\S]*?<\/article>/g)].map(m => m[0]);
  return { html: el.innerHTML, cards, handlers };
}
const au = (product, label, amount, group = 'Items') => ({ product, label, group, currency: 'AUD',
  amount, region: 'AU', verified: true, observed: '2026-11-13' });
const text = card => card.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const named = (cards, name) => cards.find(c => c.includes('>' + name + '</b>'));

test('exact local item art renders as a same-origin lazy image; no image slot otherwise', async () => {
  const { cards } = await render({ prices: [
    au('store-max-potion', 'Max Potions x10', 5.99), au('store-raid-pass', 'Raid Pass', 1.99),
    au('store-lucky-egg', 'Lucky Egg x8', 7.99), au('store-coins', '110 PokéCoins', 1.59, 'PokéCoins'),
    au('store-remote', 'Remote Raid Pass x2', 2.99), au('store-unmapped', 'Future Unmapped Item', 5.49),
    au('store-box', 'Elite Charged TM Box', 9.99, 'Boxes')
  ] });
  const potion = named(cards, 'Max Potions x10');
  assert.match(potion, /<img class="sp-i" src="\/ico\/i\/max-potion\.webp" alt="Max Potions x10" width="40" height="40" loading="lazy" decoding="async">/);
  assert.match(named(cards, 'Raid Pass'), /<img class="sp-i" src="\/ico\/g\/raidpass\.webp" alt="Raid Pass"/);
  for (const name of ['Lucky Egg x8', '110 PokéCoins', 'Remote Raid Pass x2', 'Future Unmapped Item', 'Elite Charged TM Box']) {
    const card = named(cards, name);
    assert.ok(card, name);
    assert.doesNotMatch(card, /<img/, 'no exact image, so no image slot: ' + name);
    assert.doesNotMatch(card, /sp-i-token|data-sp-art|data-sp-fallback/, 'no placeholder tile: ' + name);
    assert.doesNotMatch(text(card), /^(?:PASS|LE|SP|◎|▣|·|MM|LC|INC|SINC)\b/, 'no letters or glyph tile before the name: ' + name);
  }
  for (const card of cards) {
    for (const src of card.matchAll(/<img[^>]*\ssrc="([^"]+)"/g))
      assert.match(src[1], /^\/ico\/[A-Za-z0-9/_-]+\.webp$/, 'only same-origin local art: ' + src[1]);
    assert.doesNotMatch(card, /https?:\/\//, 'no hotlinked or external URL inside a product card');
  }
});

test('a snapshot publisher image is still never promoted to runtime artwork', async () => {
  const now = new Date().toISOString();
  const cdn = 'https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/bundle3.sprite.a-da6f21e79d79/w256.webp';
  const { html } = await render({ prices: [au('store-fixture-pass', 'Fixture Pass', 8.99, 'Tickets')],
    snapshot: { version: 1, updated: now, items: [{ name: 'Fixture Pass', image: cdn, lastSeen: now }], gone: [] } });
  assert.match(html, /Fixture Pass/);
  assert.doesNotMatch(html, /nianticlabs|<img/, 'CSP/CDN decision is the owner\'s, not this change');
});

test('a failed exact image is removed, never replaced by a placeholder tile', async () => {
  const { handlers } = await render({ prices: [au('store-max-potion', 'Max Potions x10', 5.99)] });
  assert.equal(typeof handlers.error, 'function');
  let removed = 0, replaced = 0;
  handlers.error({ target: { matches: s => s === 'img.sp-i', remove: () => { removed++; }, replaceWith: () => { replaced++; } } });
  assert.equal(removed, 1);
  assert.equal(replaced, 0);
  handlers.error({ target: { matches: () => false, remove: () => { removed++; } } });
  assert.equal(removed, 1, 'unrelated image errors are ignored');
});

test('cards show only name and region prices; none of the removed provenance text appears', async () => {
  const prices = [au('store-lucky-egg', 'Lucky Egg x8', 7.99), au('store-unmapped', 'Future Unmapped Item', 5.49),
    au('store-go-pass-deluxe-november', 'GO Pass Deluxe: November + 10 Ranks', 14.99, 'Passes & tickets'),
    { product: 'store-official-source-fixture', label: 'Source-backed Fixture Pass', group: 'Tickets',
      currency: 'AUD', region: 'AU', amount: 9.99, verified: true, observed: '2026-10-12',
      contents: [{ item: 'Ultra Ball', quantity: 20 }], contentsSource: 'https://pokemongo.com/news/go-pass-october-2026',
      disableRegionalEstimates: true }];
  const regional = OBSERVATIONS.concat([{ id: 'id-raid-day-test', product: 'Raid Day Box', kind: 'bundle',
    region: 'ID', channel: 'web', currency: 'IDR', amount: 50000, observed: '2026-11-09', source: 'fixture', status: 'verified' }]);
  const now = new Date().toISOString();
  const snapshot = { version: 1, updated: now, items: [{ name: 'Lucky Egg x8', lastSeen: now }], gone: [] };
  const { html, cards } = await render({ prices, regional, snapshot });
  assert.ok(cards.length >= 4, 'cards rendered');
  for (const card of cards) for (const bad of FORBIDDEN)
    assert.doesNotMatch(card, bad, 'forbidden text ' + bad + ' in card: ' + text(card));
  const defaultView = html.replace(/<details class="sp-compare-more sp-review"[\s\S]*<\/details>\s*<\/details>\s*$/, '');
  for (const bad of FORBIDDEN) assert.doesNotMatch(defaultView, bad, 'forbidden text on default view: ' + bad);
  assert.doesNotMatch(html, /class="sp-intro"|sp-source-id-note|sp-offer-contents|sp-product-group/);
  assert.doesNotMatch(defaultView, /regional prices are/i);
  assert.doesNotMatch(defaultView, /ExchangeRate-API/);
  assert.ok(!/undefined|NaN|\[object/.test(html));
  const egg = named(cards, 'Future Unmapped Item');
  assert.deepEqual([...egg.matchAll(/data-sp-region="(AU|ID|IN)"/g)].map(m => m[1]), ['AU', 'ID', 'IN']);
  assert.match(egg, /A\$5\.49/);
  const rd = (el, r) => el.match(new RegExp('<div class="sp-price[^"]*" data-sp-region="' + r + '"[\\s\\S]*?</div>'))[0];
  assert.match(rd(egg, 'ID'), /class="sp-none"[^>]*>—/, 'absent price is a quiet dash');
  assert.match(rd(egg, 'IN'), /class="sp-none"[^>]*>—/);
  assert.doesNotMatch(egg, /sp-est-mark/, 'no estimate marker on a card with no modelled value');
  const raid = cards.find(c => c.includes('Rp 50,000'));
  assert.match(rd(raid, 'ID'), /Rp 50,000/);
  assert.doesNotMatch(raid, /sp-est-mark/, 'an observed price is not marked as an estimate');
});

test('estimate marker appears only on modelled values and replaces all sentences', async () => {
  const prices = [au('go-pass-deluxe-october', 'GO Pass Deluxe: October', 12.99, 'Passes & tickets')];
  const regional = [
    { id: 'id-a', product: 'GO Pass Deluxe: September', kind: 'monthly-pass', region: 'ID', channel: 'web', currency: 'IDR', amount: 76000, observed: '2026-11-09', source: 'f', status: 'verified' },
    { id: 'in-a', product: 'GO Pass Deluxe: September', kind: 'monthly-pass', region: 'IN', channel: 'in-app', currency: 'INR', amount: 439, observed: '2026-11-09', source: 'f', status: 'verified' },
    { id: 'id-b', product: 'GO Pass Deluxe: October', kind: 'monthly-pass', region: 'ID', channel: 'web', currency: 'IDR', amount: 76000, observed: '2026-11-09', source: 'f', status: 'verified' }
  ];
  const { cards } = await render({ prices: prices.map(p => ({ ...p, verified: true, url: 'https://store.pokemongo.com/' })), regional });
  const card = named(cards, 'GO Pass Deluxe: October');
  assert.ok(card, 'card');
  const cell = r => card.match(new RegExp('<div class="sp-price[^"]*" data-sp-region="' + r + '"[\\s\\S]*?</div>'))[0];
  assert.doesNotMatch(cell('ID'), /sp-est-mark/, 'observed ID price stays unmarked');
  assert.match(cell('ID'), /Rp 76,000/);
  assert.match(cell('IN'), /data-sp-basis="estimate"/);
  assert.match(cell('IN'), /<span class="sp-est-mark"[^>]*>[\s\S]*?est\.[\s\S]*?<\/span>/);
  assert.match(cell('IN'), /₹/);
  assert.doesNotMatch(cell('AU'), /sp-est-mark/);
  for (const bad of FORBIDDEN) assert.doesNotMatch(card, bad);
});

test('source coverage checklist is collapsed behind a single quiet row and adds no default text', async () => {
  const { html } = await render({ prices: [au('store-max-potion', 'Max Potions x10', 5.99)], regional: OBSERVATIONS });
  assert.match(html, /<details class="sp-compare-more sp-review"><summary>Data review<\/summary>/);
  const review = html.indexOf('sp-review');
  assert.ok(review > html.indexOf('data-sp-product'), 'review sits after the catalogue');
  assert.ok(html.indexOf('data-sp-coverage') > review, 'coverage lives inside the collapsed review');
  assert.doesNotMatch(html.slice(0, review), /Source coverage|refresh checklist|Owner-only data review/);
  assert.doesNotMatch(html.slice(0, review), /<details[^>]*\sopen(?=[\s>])(?![^>]*storep)[^>]*data-sp-coverage/);
});

test('section counts stay brief and search stays', async () => {
  const { html } = await render({ prices: [au('store-max-potion', 'Max Potions x10', 5.99)] });
  assert.match(html, /<summary>Regional Store prices <small>\d+<\/small><\/summary>/);
  assert.match(html, /<summary>Items &#38; other <small>1<\/small><\/summary>/);
  assert.match(html, /Find a product/);
  assert.match(html, /data-sp-search/);
});

test('minimal card CSS keeps 44px summaries, no horizontal overflow rules and no obsolete tile styles', () => {
  const css = fs.readFileSync(new URL('../public/dash.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.sp-i-token/);
  const block = css.slice(css.lastIndexOf('/* Store minimal card'));
  assert.match(block, /\.sp-prices\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(block, /object-fit:contain/);
  assert.match(block, /\.sp-none/);
  assert.match(block, /\.sp-results:empty\{display:none\}/);
});
