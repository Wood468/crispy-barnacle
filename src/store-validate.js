// Pure store-snapshot validators (no node: imports) shared by scripts/store-watch.mjs and the Worker's /api/store-ingest route.

// The store occasionally changes its display currency based on request geography. Treat a whole-store currency flip as
// a temporary presentation change, not dozens of individual price changes.
export const currencyOf = price => {
  const value = String(price || "").trim();
  const firstDigit = value.search(/\d/);
  return firstDigit < 0 ? "" : value.slice(0, firstDigit).trim();
};

// Explicit Australian-dollar price: "A$7.99", "A$ 1,299.00". Same pattern as scripts/store-au-prices.mjs.
export function parseAUD(price) {
  const m = /^A\$\s*([\d,]+(?:\.\d{2})?)$/.exec(String(price || "").trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const EVIDENCE_PRODUCER = "store_snapshot.py";

/* Catalogue presence (name, section, link, images, end time) does not depend on price, and the page legitimately shows
   cards with no currency symbol (PokeCoin-priced cards render a bare number, free cards may render text or nothing).
   So a missing price/currency is NOT invalid. Only the items that DO carry a currency symbol take part in the
   whole-store checks: two different symbols still hold the observation (mixed-currency), and the dominant-currency
   flip hold in diffStore is unchanged. Items without a currency never change a saved price (see diffStore). */
export function validateStoreObservation(snap) {
  if (!Array.isArray(snap?.items) || snap.items.length < 3) return "empty-or-short-snapshot";
  const seen = new Set();
  const currencies = new Set();
  for (const i of snap.items) {
    if (!i || typeof i !== "object" || typeof i.name !== "string" || !i.name.trim() ||
        (typeof i.price !== "string" && i.price != null) ||
        typeof i.section !== "string" || !i.section.trim() ||
        (typeof i.href !== "string" && typeof i.href !== "undefined")) return "invalid-sku";
    const k = i.href || i.name;
    if (!k || seen.has(k)) return "duplicate-sku";
    seen.add(k);
    const currency = currencyOf(i.price);
    if (currency) currencies.add(currency);
  }
  if (currencies.size > 1) return "mixed-currency";
  return null;
}

/* Completeness is never taken from a flag. The producer (scripts/store_snapshot.py) emits an evidence block; it is
   checked against the items actually observed. Evidence is "complete" only if the scrape scrolled until two
   consecutive passes added nothing, every rendered card became a named item, and the per-section counts match the items.
   Limitation: the storefront exposes no stated total, so this proves the scrape was stable and internally consistent,
   not that the page hid nothing. */
export function deriveCompleteness(snap) {
  const e = snap && snap.completeness, items = snap && snap.items;
  const no = reason => ({ complete: false, reason });
  if (!e || typeof e !== "object" || Array.isArray(e) || !Array.isArray(items)) return no("no-evidence");
  if (e.schema !== 1 || e.producer !== EVIDENCE_PRODUCER) return no("unsupported-evidence");
  if (e.loadComplete !== true || !Number.isInteger(e.stablePasses) || e.stablePasses < 2) return no("load-not-stable");
  if (!Array.isArray(e.sections) || !e.sections.length) return no("no-sections");
  if (!Number.isInteger(e.cards) || e.cards !== items.length) return no("card-count-mismatch");
  const tally = new Map();
  for (const i of items) tally.set(i.section, (tally.get(i.section) || 0) + 1);
  const seen = new Set();
  for (const sct of e.sections) {
    if (!sct || typeof sct.name !== "string" || !sct.name || seen.has(sct.name) || !Number.isInteger(sct.count) || sct.count < 0) return no("garbled-sections");
    seen.add(sct.name);
    if ((tally.get(sct.name) || 0) !== sct.count) return no("section-count-mismatch");
  }
  if (seen.size !== tally.size) return no("section-count-mismatch");
  return { complete: true };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
/* A snapshot is accepted from the home reader only if it is a complete, explicit Australian-dollar observation.
   Returns null when acceptable, otherwise a short reason code (never echoes input). */
export function validateAuIngest(snap, nowMs = Date.now()) {
  const invalid = validateStoreObservation(snap);
  if (invalid) return invalid;
  if (!deriveCompleteness(snap).complete) return "incomplete";
  if (typeof snap.fetched !== "string" || !ISO.test(snap.fetched) || !Number.isFinite(Date.parse(snap.fetched))) return "bad-fetched";
  let priced = 0;
  for (const i of snap.items) {
    const c = currencyOf(i.price);
    if (c && c !== "A$") return "not-aud";
    if (parseAUD(i.price) !== null) priced++;
    for (const u of Array.isArray(i.imgs) ? i.imgs : []) {
      let x; try { x = new URL(u); } catch { return "bad-image"; }
      if (x.protocol !== "https:") return "bad-image";
    }
    if (i.imgs != null && !Array.isArray(i.imgs)) return "bad-image";
  }
  if (snap.items.length < 3 || priced * 2 < snap.items.length) return "too-few-prices";
  return null;
}
