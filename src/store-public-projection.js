// Public Store ingest projection contract for #885.
// This pure module does not perform D1 operations or authenticate requests.
// Worker/auth/D1 owner must integrate it after an independent review.
// Never derive approval from the incoming (untrusted) snapshot.
import { validateAuIngest } from "./store-validate.js";

const SKU = /^\/purchase\/[a-zA-Z0-9_.-]+$/;
const IMG_HOST = "assets.pgo.webstore.nianticlabs.com";
const allowedImage = value => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === IMG_HOST &&
      !u.username && !u.password && !u.search && !u.hash;
  } catch { return false; }
};

/**
 * Return a public watcher-compatible snapshot only when EVERY observed SKU
 * is explicitly approved. Partial filtering would invalidate producer
 * completeness evidence and falsely suggest an item was removed.
 * `approvedHrefs` MUST come from a trusted, reviewed catalogue, not D1 input.
 * A null result means fail closed (e.g. 503), never return the raw row.
 */
export function projectPublicStoreSnapshot(raw, approvedHrefs, nowMs = Date.now()) {
  if (!(approvedHrefs instanceof Set) || !approvedHrefs.size) return null;
  if (validateAuIngest(raw, nowMs) !== null) return null;
  if (!raw.items.every(item => SKU.test(item.href) && approvedHrefs.has(item.href))) return null;
  const items = raw.items.map(item => ({
    name: item.name,
    section: item.section,
    href: item.href,
    price: item.price,
    imgs: (item.imgs || []).filter(allowedImage).slice(0, 4)
  }));
  const result = {
    fetched: raw.fetched,
    items,
    completeness: {
      schema: raw.completeness.schema,
      producer: raw.completeness.producer,
      loadComplete: raw.completeness.loadComplete,
      stablePasses: raw.completeness.stablePasses,
      cards: raw.completeness.cards,
      sections: raw.completeness.sections.map(section => ({
        name: section.name, count: section.count
      }))
    }
  };
  return validateAuIngest(result, nowMs) === null ? result : null;
}
