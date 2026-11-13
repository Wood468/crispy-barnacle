/*
 * Audit-only bridge between source facets and verified canonical event IDs.
 * Reuses the page collector and exact source-link gate. No public event data,
 * player inventory, or ticket entitlement is modified by this module.
 */
import { collectSourceFacetStaging } from './source-facets-stage.mjs';
import { linkStagedFacetsToCanonicalEvents } from './source-facet-event-links.mjs';

/**
 * Run an audit on the pages already fetched by the importer, using its
 * existing canonical events list (not inferred names or source headlines).
 * All full source-facet records stay ephemeral in byEvent.
 */
export function collectCanonicalSourceFacetAudit(pages,events){
  if(!Array.isArray(events))throw new TypeError('Verified canonical events array required');
  const stage=collectSourceFacetStaging(pages);
  const links=linkStagedFacetsToCanonicalEvents(events,stage.byUrl);
  const linkedExamples=[...links.byEvent.entries()]
    .map(([eventId,records])=>({
      eventId,
      sourceUrls:records.map(r=>r.sourceUrl).sort().slice(0,4),
      benefits:records.reduce((n,r)=>n+r.facets.benefits.length,0),
      featuredMoves:records.reduce((n,r)=>n+r.facets.featuredMoves.length,0),
      researchPrograms:records.reduce((n,r)=>n+r.facets.researchPrograms.length,0)
    }))
    .sort((a,b)=>a.eventId.localeCompare(b.eventId))
    .slice(0,20);
  return {
    byEvent:links.byEvent,
    report:{
      ...stage.report,
      publication:'audit-only',
      canonicalLinks:{...links.report,linkedExamples}
    }
  };
}
