// Node entry point for the shared artwork resolver. The implementation lives in public/variant-art.js so the browser and the
// scripts/tests use one rule (extended from the #360 foundation: same keys, same flat-manifest contract).
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../public/variant-art.js');
export const { VARIANT_KINDS, variantKey, resolveVariantArtwork, resolve, normalize, parseName, slug, isAvatarItem, urls, costumeRoute, SAFE_URL, BADGES } = A;
export default A;
