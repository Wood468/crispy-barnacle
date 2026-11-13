/*
 * Read-only, exact-identity projection from the independently promoted
 * public verified-facet feed into an additive Event Details read model.
 *
 * This function never guesses a canonical event by title, merges source
 * claims into raids/encounters, infers move windows, or publishes files.
 * Caller must load the same-origin verified feed from an authenticated
 * release. Do not treat an arbitrary third-party JSON as approval.
 */
const ID=/^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const HASH=/^[a-f0-9]{64}$/;
const CATEGORIES=['benefits','featuredMoves','researchPrograms'];
const PROVIDERS={
  official:['pokemongo.com','www.pokemongo.com'],
  leekduck:['leekduck.com','www.leekduck.com'],
  hub:['pokemongohub.net','www.pokemongohub.net'],
  serebii:['serebii.net','www.serebii.net']
};
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const copy=o=>JSON.parse(JSON.stringify(o));
function citations(claim){
  if(!Array.isArray(claim.sourceRefs)||!claim.sourceRefs.length||claim.sourceRefs.length>12)
    throw new TypeError('Every verified facet needs bounded provenance');
  return claim.sourceRefs.map(ref=>{
    if(!plain(ref)||!Object.hasOwn(PROVIDERS,ref.sourceId)||
       typeof ref.url!=='string')
      throw new TypeError('Unrecognized verified facet provenance');
    const u=new URL(ref.url);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
       !PROVIDERS[ref.sourceId].includes(u.hostname.toLowerCase()))
      throw new TypeError('Unsafe verified facet citation');
    return {sourceId:ref.sourceId,url:u.toString(),
      section:typeof ref.section==='string'?ref.section.slice(0,160):''};
  });
}
function checkedClaim(claim){
  if(!plain(claim)||!ID.test(claim.id||'')||
     !['free','ticket','unknown','all'].includes(claim.access)||
     typeof claim.status!=='string')
    throw new TypeError('Invalid verified facet claim identity');
  return citations(claim);
}
/** Validate the entire feed to prevent partial/inconsistent event display. */
export function indexVerifiedFacetFeed(feed){
  if(!plain(feed)||feed.schemaVersion!==1||
     feed.publication!=='verified-feed'||!Array.isArray(feed.events)||
     !feed.events.length||feed.events.length>300)
    throw new TypeError('Complete promoted event facet feed required');
  const map=new Map();
  for(const event of feed.events){
    if(!plain(event)||!ID.test(event.eventId||'')||
       !HASH.test(event.reviewFingerprint||'')||
       typeof event.verifiedAt!=='string'||
       !Number.isFinite(Date.parse(event.verifiedAt))||
       map.has(event.eventId))
      throw new TypeError('Unique verified canonical event required');
    for(const category of CATEGORIES){
      if(!Array.isArray(event[category])||event[category].length>300)
        throw new TypeError('Complete bounded verified facet categories required');
      const claimIds=new Set();
      for(const claim of event[category]){
        checkedClaim(claim);
        if(claimIds.has(claim.id))throw new TypeError('Duplicate verified facet claim');
        claimIds.add(claim.id);
      }
    }
    map.set(event.eventId,event);
  }
  return map;
}
function panels(event){
  return {
    eventId:event.eventId,reviewFingerprint:event.reviewFingerprint,
    verifiedAt:event.verifiedAt,
    // Bonus access remains explicit. A ticket-only benefit is NEVER silently
    // converted into a free/always-on benefit.
    bonuses:event.benefits.map(item=>({
      id:item.id,text:String(item.label||'').slice(0,500),
      access:item.access,status:'verified',dayScope:item.dayScope||null,
      windowText:item.windowText||null,sourceRefs:citations(item)
    })),
    // These are research PROGRAM summaries only. A stage heading is not a
    // published research task and no task/reward is inferred.
    research:event.researchPrograms.map(item=>({
      id:item.id,title:String(item.title||item.storyTitle||'').slice(0,500),
      kind:item.kind||'',access:item.access,status:'verified',
      paths:Array.isArray(item.paths)?item.paths.slice():[],
      steps:Array.isArray(item.steps)?item.steps.map(s=>({
        step:s.step,outOf:s.outOf,title:s.title,
        taskRewardEvidence:'not-extracted'
      })):[],sourceRefs:citations(item)
    })),
    // Moves remain separate source-backed details; no automatic insertion
    // into a Pokémon's ordinary learnset or an unrelated raid rotation.
    featuredMoves:event.featuredMoves.map(item=>({
      id:item.id,pokemonLabel:item.pokemonLabel||'',
      move:item.move||'',moveKind:item.moveKind||'',
      access:item.access,status:'verified',
      acquisitionMethods:Array.isArray(item.acquisitionMethods)?
        item.acquisitionMethods.slice():[],
      dayScope:item.dayScope||null,windowText:item.windowText||null,
      sessionLabel:item.sessionLabel||null,sourceRefs:citations(item)
    }))
  };
}
/** Requires an EXACT canonical ID from the trusted event catalogue. */
export function verifiedFacetPanelsForEvent(feed,canonicalEventId){
  if(!ID.test(canonicalEventId||''))
    throw new TypeError('Exact canonical event ID required');
  const event=indexVerifiedFacetFeed(feed).get(canonicalEventId);
  return event?panels(event):null;
}
/**
 * Add a separately namespaced source section to a trusted event read model.
 * Does not replace curated bonuses or research, and never alters the source
 * model in place. Existing event UI can opt into displaying this section.
 */
export function withVerifiedFacetPanels(model,feed){
  if(!plain(model)||!ID.test(model.eventId||''))
    throw new TypeError('Normalized canonical event model required');
  const section=verifiedFacetPanelsForEvent(feed,model.eventId);
  const next=copy(model);
  if(section)next.verifiedFacets=section;
  return next;
}
