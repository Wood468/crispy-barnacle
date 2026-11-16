/*
 * Cross-event publication-readiness audit for normalized source facets.
 * Pure, read-only and deliberately never exposes claim text or entitlement
 * details. A later release controller may consume this report for review;
 * this module cannot write to a public file or certify publication itself.
 */
import { assessSourceFacetPublicationReadiness } from './source-facet-publication-policy.mjs';

const TYPES=['benefits','featuredMoves','researchPrograms'];
const emptyCounts=()=>Object.fromEntries(TYPES.map(type=>[type,0]));
const validId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(id);

export function summarizeSourceFacetReadiness(normalizedByEvent,{sampleLimit=20}={}){
  if(!(normalizedByEvent instanceof Map))throw new TypeError('Normalized events Map required');
  if(!Number.isInteger(sampleLimit)||sampleLimit<0||sampleLimit>50)
    throw new RangeError('Sample limit must be between 0 and 50');
  const eligible=emptyCounts(),held=emptyCounts(),reasons=new Map(),events=[];
  // Validate the *entire* map, including events excluded by the sample cap.
  for(const [eventId,facets] of normalizedByEvent){
    if(!validId(eventId)||facets?.eventId!==eventId)
      throw new TypeError('Canonical event ID mismatch');
    const audit=assessSourceFacetPublicationReadiness(facets);
    const counts=audit.report;
    for(const type of TYPES){
      eligible[type]+=counts.eligible[type];
      held[type]+=counts.held[type];
    }
    for(const [reason,count] of Object.entries(counts.reasons))
      reasons.set(reason,(reasons.get(reason)||0)+count);
    events.push({eventId,eligible:counts.eligible,held:counts.held});
  }
  events.sort((a,b)=>a.eventId.localeCompare(b.eventId));
  return {
    schemaVersion:1,publication:'audit-only',
    eventsInspected:events.length,eligible,held,
    blockers:Object.fromEntries([...reasons].sort(([a],[b])=>a.localeCompare(b))),
    eventSamples:events.slice(0,sampleLimit)
  };
}
