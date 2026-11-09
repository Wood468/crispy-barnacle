// Conservative AU Web Store importer. Only explicit A$ prices and exact product labels.
// Run after the public store snapshot. No inferred currencies or fuzzy matches.
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function parseAUD(price) {
  const m = /^A\$\s*([\d,]+(?:\.\d{2})?)$/.exec(String(price || '').trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g,''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function updatePrices(data, snapshot) {
  const prices = data.prices || [];
  const known = new Map();
  for (const p of prices) if (p.product?.startsWith('store-') && p.region === 'AU' && p.currency === 'AUD' && p.verified && p.label) {
    const key = p.label.trim().toLowerCase();
    if (!known.has(key)) known.set(key,p.product);
    else if (known.get(key) !== p.product) known.set(key,null);
  }
  const observed = String(snapshot.fetched || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed)) return {data,changed:0,reason:'missing date'};
  const items = snapshot.items || [];
  const explicit = items.filter(i => parseAUD(i.price) !== null);
  // A mixed or non-AUD snapshot must not contaminate the Australian catalogue.
  if (items.length < 3 || explicit.length !== items.length) return {data,changed:0,reason:'not a complete explicit AUD snapshot'};
  let changed = 0;
  const existingIds = new Set(prices.map(p => p.product));
  const discovered = new Set();
  for (const item of explicit) {
    const name = String(item.name || '').trim();
    let product = known.get(name.toLowerCase());
    const href = String(item.href || '');
    if (!product) {
      // New catalogue entries must have an unambiguous store purchase slug.
      const match = /^\/purchase\/item\/([a-z0-9][a-z0-9-]{2,100})$/.exec(href);
      if (!match || !name || name.length > 120) continue;
      product = 'store-auto-' + match[1];
      if (existingIds.has(product) || discovered.has(product)) continue;
      discovered.add(product);
      const lower = name.toLowerCase();
      const group = /pok.coins/.test(lower) ? 'PokéCoins' : /ticket|go pass|research/.test(lower) ? 'Tickets' : /box|bundle|pack/.test(lower) ? 'Boxes' : 'Items';
      prices.push({product,label:name,group,currency:'AUD',amount:parseAUD(item.price),region:'AU',verified:true,source:'Pokémon GO Web Store (explicit A$ snapshot)',url:'https://store.pokemongo.com'+href,observed});
      changed++;
      continue;
    }
    const amount = parseAUD(item.price);
    const current = prices.filter(p=>p.product===product && p.region==='AU' && p.currency==='AUD' && p.verified).sort((a,b)=>String(b.observed).localeCompare(String(a.observed)))[0];
    if (current && current.amount === amount) continue;
    if (current && String(current.observed) > observed) continue;
    prices.push({product,label:current.label,group:current.group,currency:'AUD',amount,region:'AU',verified:true,source:'Pokémon GO Web Store (explicit A$ snapshot)',url:'https://store.pokemongo.com',observed});
    changed++;
  }
  return {data:{...data,prices},changed,reason:null};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [snapPath,pricesPath='public/prices.json'] = process.argv.slice(2);
  const snap = JSON.parse(await readFile(snapPath,'utf8'));
  const data = JSON.parse(await readFile(pricesPath,'utf8'));
  const result = updatePrices(data,snap);
  if (result.changed) await writeFile(pricesPath,JSON.stringify(result.data,null,2)+'\n');
  console.log('AU store import: '+result.changed+' updated; '+(result.reason || 'valid explicit A$ snapshot'));
}
