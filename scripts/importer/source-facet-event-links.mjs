/*
 * Exact, reviewable association for staged event-source facets.
 *
 * Fuzzy event-title matching, shared roundups, and nearby event dates must
 * never assign paid perks or exclusive moves to the wrong event. This returns
 * an in-memory mapping only; no generated or public event file is modified.
 */
import { sourceFor } from './sources.mjs';

/** Shared exact LeekDuck event-page identity for canonical and world audits. */
export function canonicalLeekDuckEventKey(value) {
  if(typeof value!=='string'||value!==value.trim()||value.includes('\\'))return null;
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||
       !['leekduck.com','www.leekduck.com'].includes(u.hostname.toLowerCase())||
       !/^\/events\/[a-z0-9_-]+\/?$/i.test(u.pathname))return null;
    return 'leekduck.com'+u.pathname.replace(/\/$/,'');
  } catch { return null; }
}
function sourceKey(value) {
  const key=canonicalLeekDuckEventKey(value);
  if(!key)return null;
  const provider=sourceFor(value);
  return provider?.id==='leekduck'&&provider.pattern.test(value)?key:null;
}
const idForUrl = value => {
  const key=sourceKey(value);
  const path=key?.slice('leekduck.com/events/'.length);
  return path?'leekduck:'+path:null;
};
function matchesEvent(event,pageKey,alias) {
  if(!event||typeof event.id!=='string'||!event.id.trim())return false;
  if(event.id===alias)return true;
  if(Array.isArray(event.detailIds)&&event.detailIds.includes(alias))return true;
  return [event.link,event.sourceUrl].some(value=>sourceKey(value)===pageKey);
}
/**
 * @param {object[]} events - verified canonical event records, already joined by the caller
 * @param {Map<string,object>} facetByUrl - collector's in-memory byUrl map
 * @returns {{byEvent:Map<string,object[]>,report:object}}
 */
export function linkStagedFacetsToCanonicalEvents(events,facetByUrl){
  if(!Array.isArray(events))throw new TypeError('Verified events array required');
  if(!(facetByUrl instanceof Map))throw new TypeError('Source facet map required');
  const byEvent=new Map(),seen=new Set();
  const report={publication:'staging-only',eligiblePages:0,linkedPages:0,unlinkedPages:0,ambiguousPages:0,duplicatePages:0,rejectedPages:0,
    unlinkedExamples:[],ambiguousExamples:[]};
  for(const [url,facets] of facetByUrl){
    const key=sourceKey(url);
    if(!key||!facets||sourceKey(facets.sourceUrl)!==key){
      report.rejectedPages++;continue;
    }
    if(seen.has(key)){report.duplicatePages++;continue;}
    seen.add(key);report.eligiblePages++;
    const alias=idForUrl(url);
    const matched=events.filter(event=>matchesEvent(event,key,alias));
    const matchingIds=new Set(matched.map(event=>event.id));
    // The live feed may include a source-generated copy alongside an owner's
    // curated event. Prefer the curated ID only when it itself declares this
    // exact publisher URL or alias, and when precisely ONE such owner exists.
    // Names, dates, proximity and arbitrary "curated" flags are not proof.
    if(matchingIds.size>1){
      const curatedOwners=new Set(matched.filter(event=>event.curated===true&&event.id!==alias&&(
        (Array.isArray(event.detailIds)&&event.detailIds.includes(alias))||
        [event.link,event.sourceUrl].some(value=>sourceKey(value)===key)
      )).map(event=>event.id));
      if(curatedOwners.size===1){
        matchingIds.clear();
        matchingIds.add([...curatedOwners][0]);
      }
    }
    // Report a bounded, scrubbed source locator and exact candidate IDs so
    // reviewers can resolve omissions without fuzzy title/date guesses.
    // Never emit source page prose, user state, tokens or raw query strings.
    const sourceUrl='https://'+key;
    if(matchingIds.size===0){
      report.unlinkedPages++;
      report.unlinkedExamples.push({sourceUrl,expectedAlias:alias});
      continue;
    }
    if(matchingIds.size>1){
      report.ambiguousPages++;
      report.ambiguousExamples.push({sourceUrl,candidateIds:[...matchingIds].sort().slice(0,8)});
      continue;
    }
    const id=[...matchingIds][0];
    if(!byEvent.has(id))byEvent.set(id,[]);
    byEvent.get(id).push({sourceId:'leekduck',sourceUrl:url,facets});
    report.linkedPages++;
  }
  // Sort before bounding so source-discovery order cannot change the review
  // sample or accidentally omit the same conflicts on repeated refreshes.
  report.unlinkedExamples=report.unlinkedExamples.sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl)).slice(0,12);
  report.ambiguousExamples=report.ambiguousExamples.sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl)).slice(0,12);
  return {byEvent,report};
}
