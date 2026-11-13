/* Read-only audit of officially sourced GO Web Store SKU observations.
   Never infer a currency from a "$" string; never treat external event tickets as Web Store offers.
   The regional owner-only observations are deliberately out of scope. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function officialStoreUrl(value) {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && url.hostname === 'store.pokemongo.com' &&
      !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}
function latestObservation(a, b) {
  if (!a) return b;
  return String(b.observed || '') > String(a.observed || '') ? b : a;
}
function exactSlug(entry) {
  const slug = String(entry?.slug || '');
  if (!/^[a-z0-9][a-z0-9-]{2,119}$/.test(slug)) return '';
  if (entry.href !== '/purchase/item/' + slug) return '';
  return slug;
}

export function auditOfficialStore(prices = [], feedItems = [], officialIdentities = [], now = Date.now(), reviewDays = 30) {
  const observations = new Map();
  for (const p of prices || []) {
    if (!p || typeof p.product !== 'string' || !p.product.trim()) continue;
    if (p.region !== 'AU' || p.currency !== 'AUD' || p.verified !== true ||
        !Number.isFinite(p.amount) || p.amount <= 0 || !officialStoreUrl(p.url)) continue;
    observations.set(p.product, latestObservation(observations.get(p.product), p));
  }
  const knownPrices = [...observations.values()].map(p => ({
    sku: p.product, label: typeof p.label === 'string' && p.label.trim() ? p.label : null,
    amount: p.amount, currency: 'AUD', observed: p.observed || null, sourceUrl: p.url,
    source: p.source || null
  })).sort((a, b) => a.sku.localeCompare(b.sku));

  const feed = new Map();
  for (const item of feedItems || []) {
    const slug = exactSlug(item);
    if (!slug) continue;
    const newer = feed.get(slug);
    if (newer && String(newer.lastSeen || '') >= String(item.lastSeen || '')) continue;
    feed.set(slug, item);
  }
  const feedOffers = [...feed.entries()].map(([slug, o]) => ({
    slug, label: o.name || null, lastSeen: o.lastSeen || null,
    availability: o.goneAt ? 'last seen, no longer listed' : 'last observed',
    priceLabel: typeof o.price === 'string' ? o.price : null,
    currency: null, /* The feed's "$" has no explicitly verified denomination. */
    currencyStatus: 'unverified', purchasePath: o.href
  })).sort((a, b) => a.slug.localeCompare(b.slug));
  // Publisher announcements are an independent identity-only ledger:
  // never merge them into a regional price or assume a checkout channel.
  const identities = new Map();
  const asOf = new Date(now).getTime();
  const staleDays = Number.isSafeInteger(reviewDays) && reviewDays > 0 ? reviewDays : 30;
  for (const p of Array.isArray(officialIdentities) ? officialIdentities : []) {
    if (!p || p.noPriceObservation !== true || p.regionAvailability !== 'unknown'
      || typeof p.id !== 'string' || !/^official:[a-z0-9:-]+$/.test(p.id)
      || typeof p.label !== 'string' || !p.label.trim()
      || typeof p.sourceUrl !== 'string'
      || !/^https:\/\/pokemongo\.com\/news\/[a-z0-9-]+$/.test(p.sourceUrl)
      || typeof p.sourceCheckedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(p.sourceCheckedAt)
      || !Number.isFinite(Date.parse(p.sourceCheckedAt))
      || !Array.isArray(p.contents)
      || !p.contents.length
      || !p.contents.every(x => x && typeof x.item === 'string' && x.item.trim()
         && Number.isSafeInteger(x.quantity) && x.quantity > 0)) continue;
    const previous = identities.get(p.id);
    if (previous && previous.sourceCheckedAt >= p.sourceCheckedAt) continue;
    const checked = Date.parse(p.sourceCheckedAt + 'T00:00:00Z');
    const reviewDue = Number.isFinite(asOf) && asOf >= checked
      && (asOf - checked) >= staleDays * 86400000;
    // Copy only whitelisted public publisher facts, not accidental price,
    // account, checkout or regional fields supplied by an input object.
    identities.set(p.id, {
      id:p.id, label:p.label.trim(), sourceUrl:p.sourceUrl,
      sourceCheckedAt:p.sourceCheckedAt, regionAvailability:'unknown',
      regionalPricing:'not observed (AU / ID / IN)',
      reviewDue,
      contents:p.contents.map(x => ({item:x.item.trim(),quantity:x.quantity}))
    });
  }
  const announced = [...identities.values()].sort((a,b) => a.id.localeCompare(b.id));
  return {
    counts: {
      officialAuPriceSkus: knownPrices.length,
      feedPurchaseSlugs: feedOffers.length,
      unnamedAuPriceSkus: knownPrices.filter(p => !p.label).length,
      feedCurrencyUnverified: feedOffers.length,
      announcedUnpriced: announced.length,
      announcedReviewDue: announced.filter(p => p.reviewDue).length
    },
    officialAuPrices: knownPrices,
    officialFeedOffers: feedOffers,
    officialUnpriced: announced
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const prices = JSON.parse(readFileSync(new URL('../public/prices.json', import.meta.url), 'utf8'));
  const feed = JSON.parse(readFileSync(new URL('../public/store-log.json', import.meta.url), 'utf8'));
  const identities = require('../public/store-offer-identities.js');
  const result = auditOfficialStore(prices.prices || [], feed.items || [], identities);
  console.log(JSON.stringify(result, null, 2));
}
