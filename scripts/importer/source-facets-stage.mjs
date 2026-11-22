/*
 * Staged source-facet audit for the event importer.
 * Counts source claims, never renders or publishes them as verified game data.
 * Deliberately independent of event identity and source authority merging.
 */
import { extractEventSourceFacets } from './source-facets.mjs';
import { sourceFor } from './sources.mjs';

const LIMITS = Object.freeze({ maxPages: 120, maxHtmlBytes: 2_000_000, maxExamples: 20, maxErrors: 12 });
const totals = () => ({ benefits: 0, featuredMoves: 0, researchPrograms: 0, unconfirmed: 0 });

function eligible(page) {
  if (!page || page.source !== 'leekduck' || typeof page.url !== 'string') return false;
  const source = sourceFor(page.url);
  return source?.id === 'leekduck' && source.pattern.test(page.url);
}

/**
 * Parse verified LeekDuck event URLs, retaining full facets in memory only.
 * Output report is an internal diagnostic summary, not a public catalogue.
 *
 * An unrecognized source, missing HTML, error or provisional source claim must
 * never alter existing event pages, encounter methods, ticket entitlements,
 * curated gameplay, prior source snapshots or user data.
 */
export function collectSourceFacetStaging(pages = []) {
  if (!Array.isArray(pages)) throw new TypeError('pages must be an array');
  const byUrl = new Map(), seen = new Set(), examples = [], errors = [];
  const counts = totals();
  let eligiblePages = 0, pagesWithFacets = 0, skippedLarge = 0, duplicates = 0;
  for (const page of pages) {
    if (!eligible(page)) continue;
    // The importer already caps fetched pages; this additional cap is
    // defensive against corrupted fixtures or a future unbounded caller.
    if (eligiblePages >= LIMITS.maxPages) break;
    const url = page.url;
    // LeekDuck's www and apex hosts serve equivalent event pages. They
    // must not multiply bonus/move claims when both appear in a watch list.
    const parsed = new URL(url);
    const key = parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '');
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    eligiblePages++;
    if (typeof page.html !== 'string' || !page.html.trim()) continue;
    if (page.html.length > LIMITS.maxHtmlBytes) { skippedLarge++; continue; }
    try {
      const facets = extractEventSourceFacets(page.html, { sourceUrl: url });
      byUrl.set(url, facets);
      const benefitCount = facets.benefits.length;
      const moveCount = facets.featuredMoves.length;
      const researchCount = facets.researchPrograms.length;
      if (benefitCount + moveCount + researchCount === 0) continue;
      pagesWithFacets++;
      counts.benefits += benefitCount;
      counts.featuredMoves += moveCount;
      counts.researchPrograms += researchCount;
      counts.unconfirmed += facets.benefits.filter(x => x.status === 'unconfirmed').length;
      counts.unconfirmed += facets.researchPrograms.filter(x => x.status === 'unconfirmed').length;
      if (examples.length < LIMITS.maxExamples) examples.push({
        sourceUrl: url, benefitCount, featuredMoveCount: moveCount,
        researchProgramCount: researchCount
        // Example labels are only needed for source QA; keep them out of the
        // recurring report until they have been independently validated.
      });
    } catch (e) {
      if (errors.length < LIMITS.maxErrors) errors.push({
        sourceUrl: url,
        reason: e instanceof Error ? e.name : 'UnknownError'
      });
    }
  }
  return {
    byUrl,
    report: {
      schemaVersion: 1,
      publication: 'audit-only',
      sourceId: 'leekduck',
      eligiblePages, pagesWithFacets, duplicates, skippedLarge,
      counts, examples, errors
    }
  };
}
