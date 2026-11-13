/*
 * Pure review-candidate projection for canonical event source facets.
 *
 * A human-selected claim ID is not proof of entitlement or publication.
 * Re-evaluate every claim against the source proof policy and emit only a
 * narrow, public-safe field allowlist. No filesystem/network operations.
 */
import {assessSourceFacetPublicationReadiness} from './source-facet-publication-policy.mjs';

const TYPES=['benefits','featuredMoves','researchPrograms'];
const FIELDS={
  benefits:['id','label','kind','access','dayScope','windowText','addonLabel','replacesFreeLimit','replacementEvidence','status'],
  featuredMoves:['id','pokemonLabel','move','moveKind','access','acquisitionMethods','dayScope','windowText','sessionLabel','status'],
  researchPrograms:['id','kind','title','storyTitle','access','paths','onceOnly','steps','status']
};
const clone=value=>JSON.parse(JSON.stringify(value));
const identifier=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(value);
const project=(type,record)=>{
  const result={};
  for(const field of FIELDS[type])if(Object.hasOwn(record,field))result[field]=clone(record[field]);
  result.sourceRefs=record.sourceRefs.map(ref=>({
    sourceId:ref.sourceId,url:ref.url,section:ref.section
  }));
  return result;
};

/**
 * Select specific, eligible, source-backed claims for manual review.
 * Output is not verified, deployable or automatically publishable.
 *
 * @param {object} normalized canonical staged source facets (v1)
 * @param {{eventId:string,approved:object}} manifest explicit reviewed IDs
 */
export function buildReviewedFacetCandidate(normalized,manifest){
  if(!manifest||typeof manifest!=='object'||!identifier(manifest.eventId)||
      manifest.eventId!==normalized?.eventId||!manifest.approved||
      typeof manifest.approved!=='object'||Array.isArray(manifest.approved))
    throw new TypeError('Matching event ID and explicit review manifest required');
  const extra=Object.keys(manifest.approved).filter(type=>!TYPES.includes(type));
  if(extra.length)throw new TypeError('Unknown facet category in review manifest');
  const audit=assessSourceFacetPublicationReadiness(normalized);
  const chosen={};
  for(const type of TYPES){
    const ids=manifest.approved[type];
    if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id.trim())||
       new Set(ids).size!==ids.length)
      throw new TypeError('Unique approved claim IDs required for '+type);
    const eligible=new Map(audit.eligible[type].map(record=>[record.id,record]));
    const held=new Set(audit.held[type].map(record=>record.id));
    for(const id of ids){
      if(held.has(id))throw new TypeError('Held claim cannot be selected: '+type);
      if(!eligible.has(id))throw new TypeError('Unrecognized eligible claim: '+type);
    }
    chosen[type]=ids.map(id=>project(type,eligible.get(id)))
      .sort((a,b)=>a.id.localeCompare(b.id));
  }
  return {
    schemaVersion:1,publication:'review-candidate',eventId:manifest.eventId,
    requiresIndependentReview:true,...chosen
  };
}
