/*
 * Audit-only bridge between source facets and verified canonical event IDs.
 * Reuses the page collector and exact source-link gate. No public event data,
 * player inventory, or ticket entitlement is modified by this module.
 */
import { collectSourceFacetStaging } from './source-facets-stage.mjs';
import { linkStagedFacetsToCanonicalEvents } from './source-facet-event-links.mjs';
import { normalizeEventSourceFacets } from './source-facets-contract.mjs';

/**
 * Link the already-validated generated world-event catalogue back to staged
 * source pages. The world catalogue has explicit source URLs but is produced
 * after the curated/API event list. These are audit candidates only.
 * A source without an exact trusted LeekDuck event URL is never attributed.
 */
// Known owners and generated world records must use the SAME strict source
// URL identity; query/fragment/non-standard-port URLs may never suppress a
// legitimate world event by normalizing to an unrelated clean article.
function worldLeekDuckKey(value){
  if(typeof value!=='string'||value!==value.trim()||value.includes('\\'))return null;
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||
       !['leekduck.com','www.leekduck.com'].includes(u.hostname.toLowerCase())||
       !/^\/events\/[a-z0-9_-]+\/?$/i.test(u.pathname))return null;
    return 'leekduck.com'+u.pathname.replace(/\/$/,'');
  }catch{return null}
}
export function worldSourceFacetCandidates(world,knownEvents=[]){
  if(!Array.isArray(world))throw new TypeError('World event records array required');
  if(!Array.isArray(knownEvents))throw new TypeError('Known canonical events array required');
  const knownIds=new Set(),knownPages=new Set();
  for(const item of knownEvents){
    if(typeof item?.id==='string')knownIds.add(item.id);
    if(Array.isArray(item?.detailIds)){
      for(const id of item.detailIds)if(typeof id==='string')knownIds.add(id);
    }
    for(const url of [item?.link,item?.sourceUrl,
      ...(Array.isArray(item?.sources)?item.sources.filter(s=>s?.id==='leekduck').map(s=>s.url):[])]){
      const key=worldLeekDuckKey(url);
      if(key)knownPages.add(key);
    }
  }
  const out=[],seen=new Set();
  for(const event of world){
    if(!event||typeof event.id!=='string'||
       !/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(event.id)||
       !Array.isArray(event.sources))continue;
    for(const source of event.sources){
      if(source?.id!=='leekduck')continue;
      const pageKey=worldLeekDuckKey(source.url);
      if(!pageKey)continue;
      const alias='leekduck:'+pageKey.slice('leekduck.com/events/'.length);
      // Exact canonical ownership only. Names, nearby dates and geographic
      // similarities never authorize a source association.
      if(knownIds.has(alias)||knownPages.has(pageKey))continue;
      const key=event.id+'|'+pageKey;
      // Keep distinct world event IDs that claim the same source; the
      // downstream link audit must see their ambiguity, not suppress it.
      if(seen.has(key))continue;
      seen.add(key);
      out.push({id:event.id,sourceUrl:source.url});
    }
  }
  return out;
}

/**
 * Run an audit on the pages already fetched by the importer, using its
 * existing canonical events list (not inferred names or source headlines).
 * All full source-facet records stay ephemeral in byEvent.
 */
export function collectCanonicalSourceFacetAudit(pages,events){
  if(!Array.isArray(events))throw new TypeError('Verified canonical events array required');
  const stage=collectSourceFacetStaging(pages);
  const links=linkStagedFacetsToCanonicalEvents(events,stage.byUrl);
  // The normalized source contract remains in memory. Do not publish a
  // ticket entitlement merely because its event alias can be resolved.
  const normalizedByEvent=new Map([...links.byEvent.entries()].map(([id,records])=>
    [id,normalizeEventSourceFacets(id,records)]
  ));
  const normalizedCounts={
    events:normalizedByEvent.size,benefits:0,featuredMoves:0,
    researchPrograms:0,disputed:0,unconfirmed:0,warnings:0
  };
  for(const value of normalizedByEvent.values()){
    normalizedCounts.warnings+=value.warnings.length;
    for(const kind of ['benefits','featuredMoves','researchPrograms']){
      normalizedCounts[kind]+=value[kind].length;
      normalizedCounts.disputed+=value[kind].filter(x=>x.status==='disputed').length;
      normalizedCounts.unconfirmed+=value[kind].filter(x=>x.status==='unconfirmed').length;
    }
  }
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
    normalizedByEvent,
    report:{
      ...stage.report,
      publication:'audit-only',
      canonicalLinks:{...links.report,linkedExamples,normalizedCounts}
    }
  };
}
