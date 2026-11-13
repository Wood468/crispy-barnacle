/*
 * Exact, reviewable association for staged event-source facets.
 *
 * Fuzzy event-title matching, shared roundups, and nearby event dates must
 * never assign paid perks or exclusive moves to the wrong event. This returns
 * an in-memory mapping only; no generated or public event file is modified.
 */
import { sourceFor } from './sources.mjs';

function sourceKey(value) {
  try {
    const u=new URL(value);
    const provider=sourceFor(value);
    if(u.protocol!=='https:'||u.username||u.password||!provider||
       provider.id!=='leekduck'||!provider.pattern.test(value))return null;
    return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'');
  } catch {
    return null;
  }
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
  const report={publication:'staging-only',eligiblePages:0,linkedPages:0,unlinkedPages:0,ambiguousPages:0,duplicatePages:0,rejectedPages:0};
  for(const [url,facets] of facetByUrl){
    const key=sourceKey(url);
    if(!key||!facets||sourceKey(facets.sourceUrl)!==key){
      report.rejectedPages++;continue;
    }
    if(seen.has(key)){report.duplicatePages++;continue;}
    seen.add(key);report.eligiblePages++;
    const alias=idForUrl(url);
    const matchingIds=new Set(events.filter(event=>matchesEvent(event,key,alias)).map(event=>event.id));
    if(matchingIds.size===0){report.unlinkedPages++;continue;}
    if(matchingIds.size>1){report.ambiguousPages++;continue;}
    const id=[...matchingIds][0];
    if(!byEvent.has(id))byEvent.set(id,[]);
    byEvent.get(id).push({sourceId:'leekduck',sourceUrl:url,facets});
    report.linkedPages++;
  }
  return {byEvent,report};
}
