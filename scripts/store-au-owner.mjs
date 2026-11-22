// Owner-supplied Australian Web Store prices (read from the Australian storefront by a person, never by the CI runner).
// node scripts/store-au-owner.mjs [data/au-store-input.json] [public/prices.json] [public/store-current-snapshot.json]
// All-or-nothing: any problem rejects the whole input and changes nothing. See docs/store-au-owner-prices.md.
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseAUD} from './store-au-prices.mjs';

const MIN = 0.5, MAX = 500, MAX_AGE_DAYS = 14, MAX_RATIO = 3;
const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const realDate = d => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === d;
};
// Same id the Buy planner derives (public/buy.js productFor), so a new current offer lines up with the planner.
const slug = label => 'store-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const groupOf = label => {
  const l = label.toLowerCase();
  return /pok.coins/.test(l) ? 'PokéCoins' : /ticket|go pass|research/.test(l) ? 'Tickets' : /box|bundle|pack/.test(l) ? 'Boxes' : 'Items';
};

export function applyOwnerInput(data, input, snapshot, opts = {}) {
  const reject = errors => ({data, changed: 0, errors});
  const today = opts.today || new Date().toISOString().slice(0, 10);
  if (!input || typeof input !== 'object' || !Array.isArray(input.items) || !input.items.length) return reject(['input needs {observed, items:[{label, price}]} with at least one item']);
  const errors = [], observed = input.observed;
  if (!realDate(observed)) errors.push('observed must be a real date YYYY-MM-DD (the day you read the prices in the Australian store)');
  else {
    if (observed > today) errors.push('observed is in the future');
    else if ((Date.parse(today) - Date.parse(observed)) / 864e5 > MAX_AGE_DAYS) errors.push('observed is more than ' + MAX_AGE_DAYS + ' days old; re-read the store');
  }
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const au = prices.filter(p => p.region === 'AU' && p.currency === 'AUD' && p.verified && p.label);
  const known = new Map();
  for (const p of au) { const k = norm(p.label); known.set(k, known.has(k) && known.get(k) !== p.product ? null : p.product); }
  // Only exact names the Store is showing now, or products already in the Australian catalogue.
  const current = new Set((snapshot?.items || []).map(i => norm(i.name)));
  const seen = new Set(), additions = [], removals = new Map(), itemProducts = new Set();
  for (const [n, row] of input.items.entries()) {
    const where = 'item ' + (n + 1) + (row && row.label ? ' (' + row.label + ')' : '');
    if (!row || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 120) { errors.push(where + ': label required'); continue; }
    const key = norm(row.label), amount = parseAUD(row.price);
    if (seen.has(key)) { errors.push(where + ': duplicate label'); continue; }
    seen.add(key);
    if (amount === null) { errors.push(where + ': price must be an explicit A$ amount like "A$12.99"'); continue; }
    if (amount < MIN || amount > MAX) { errors.push(where + ': A$' + amount + ' is outside the plausible range A$' + MIN + ' to A$' + MAX); continue; }
    if (known.get(key) === null) { errors.push(where + ': label matches more than one catalogue product'); continue; }
    // Explicit opt-in for an owner-observed item the snapshot has not seen yet. Needs a note, and the name must not already be in the snapshot (then it is a normal item).
    const unlisted = row.unlisted === true;
    if (row.unlisted !== undefined && !unlisted) { errors.push(where + ': "unlisted" must be true or omitted'); continue; }
    if (unlisted) {
      const note = typeof row.note === 'string' ? row.note.trim() : '';
      if (!note || note.length > 200) { errors.push(where + ': "unlisted" items need a "note" (1-200 characters) saying why it is not in the snapshot'); continue; }
      if (current.has(key)) { errors.push(where + ': is in the current Store snapshot; remove "unlisted"'); continue; }
    }
    if (!known.has(key) && !current.has(key) && !unlisted) { errors.push(where + ': not a name in the current Store snapshot or the Australian catalogue'); continue; }
    const product = known.get(key) || slug(row.label.trim());
    if (!known.has(key) && !/^store-[a-z0-9-]{3,110}$/.test(product)) { errors.push(where + ': cannot derive a product id'); continue; }
    itemProducts.add(product);
    // Opt-in: retire an earlier AU entry this item replaces (e.g. one recorded under a guessed label). Removes only that product's AU/AUD entries.
    if (row.supersedes !== undefined) {
      const target = typeof row.supersedes === 'string' ? norm(row.supersedes) : '';
      if (!target) { errors.push(where + ': "supersedes" must be the label of an existing Australian entry'); continue; }
      if (!known.has(target)) { errors.push(where + ': "supersedes" ' + row.supersedes + ' is not an existing Australian entry'); continue; }
      if (known.get(target) === null) { errors.push(where + ': "supersedes" label matches more than one catalogue product'); continue; }
      const old = known.get(target);
      if (old === product) { errors.push(where + ': "supersedes" cannot name the item itself'); continue; }
      const oldNewest = au.filter(p => p.product === old).sort((a, b) => String(b.observed).localeCompare(String(a.observed)))[0];
      const why = typeof row.supersedesNote === 'string' ? row.supersedesNote.trim() : '';
      if (oldNewest.amount !== amount && (!why || why.length > 200)) { errors.push(where + ': superseded entry is A$' + oldNewest.amount + ', not A$' + amount + '; add "supersedesNote" (1-200 characters) explaining why it is being replaced'); continue; }
      if (removals.has(old)) { errors.push(where + ': "supersedes" ' + row.supersedes + ' is already superseded by another item'); continue; }
      removals.set(old, where);
    }
    const mine = au.filter(p => p.product === product).sort((a, b) => String(b.observed).localeCompare(String(a.observed)));
    const last = mine[0];
    if (last && realDate(observed)) {
      if (String(last.observed) > observed) { errors.push(where + ': already has a newer price (' + last.observed + ')'); continue; }
      if (last.observed === observed) {
        if (last.amount !== amount) errors.push(where + ': already has a different price for ' + observed);
        continue; // identical same-day entry: nothing to do
      }
      const ratio = amount / last.amount;
      if ((ratio > MAX_RATIO || ratio < 1 / MAX_RATIO) && row.confirm !== true) { errors.push(where + ': A$' + amount + ' is more than ' + MAX_RATIO + 'x different from the last verified A$' + last.amount + '; add "confirm": true to that item if this is correct'); continue; }
    }
    additions.push({product, label: last ? last.label : row.label.trim(), group: last?.group || groupOf(row.label), currency: 'AUD', amount, region: 'AU', verified: true,
      source: 'Pokémon GO Web Store (Australian storefront, read by the owner)', url: 'https://store.pokemongo.com/', observed,
      ...(unlisted ? {note: row.note.trim()} : {})});
  }
  for (const [old, where] of removals) if (itemProducts.has(old)) errors.push(where + ': "supersedes" names a product that is itself an item in this input');
  if (errors.length) return reject(errors);
  const kept = removals.size ? prices.filter(p => !(removals.has(p.product) && p.region === 'AU' && p.currency === 'AUD')) : prices;
  return {data: {...data, prices: [...kept, ...additions]}, changed: additions.length + (prices.length - kept.length), removed: prices.length - kept.length, errors: []};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.GITHUB_ACTIONS === 'true') { console.error('Refusing to run on a CI runner: Australian prices must be read by a person in Australia.'); process.exit(1); }
  const [inPath = 'data/au-store-input.json', pricesPath = 'public/prices.json', snapPath = 'public/store-current-snapshot.json'] = process.argv.slice(2);
  const [input, data, snap] = await Promise.all([inPath, pricesPath, snapPath].map(async p => JSON.parse(await readFile(p, 'utf8'))));
  const r = applyOwnerInput(data, input, snap);
  if (r.errors.length) { console.error('Rejected, nothing changed:\n- ' + r.errors.join('\n- ')); process.exit(1); }
  if (r.changed) await writeFile(pricesPath, JSON.stringify(r.data, null, 2) + '\n');
  console.log('AU owner prices: ' + (r.changed - (r.removed || 0)) + ' added' + (r.removed ? ', ' + r.removed + ' superseded entry removed' : ''));
}
