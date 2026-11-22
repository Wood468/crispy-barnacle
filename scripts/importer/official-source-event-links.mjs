/*
 * Conservative audit-only matching of official Pokémon GO article facets to
 * canonical event IDs. An official article may cover several events, so
 * matching names, dates or geography must NEVER confer ticket entitlements.
 * A single explicit source URL owner is required.
 *
 * INTEGRATION CAUTION: the importer's pickEvent() title matching can attach
 * official pages to event.sources[] in published data. Callers must pass only
 * events whose official link/sourceUrl was curated or independently verified,
 * not those heuristic attributions. Pure and read-only; not wired to output.
 */
const officialKey=value=>{
  // URL parsing silently trims whitespace and resolves dot segments/backslashes;
  // identity must come from the literal string, not from that normalisation.
  if(typeof value!=='string'||value!==value.trim()||/[\\]|\/\.\.?(?:\/|$)/.test(value))return null;
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||
      !['pokemongo.com','www.pokemongo.com'].includes(u.hostname.toLowerCase()))return null;
    let path=u.pathname.replace(/^\/en(?=\/)/i,'').replace(/\/$/,'');
    if(!/^\/(?:news|post|gowildarea)\/[a-z0-9-]{3,}(?:\/[a-z0-9-]{3,})?$/i.test(path))return null;
    return 'pokemongo.com'+path.toLowerCase();
  }catch{return null}
};
// Same ID shape normalizeEventSourceFacets() accepts; anything else could not be joined downstream.
const CANONICAL_ID=/^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const eventMatches=(event,key)=>{
  if(!event||typeof event.id!=='string'||!CANONICAL_ID.test(event.id))return false;
  const sources=[event.link,event.sourceUrl,...(Array.isArray(event.sources)?
    event.sources.filter(s=>s?.id==='official').map(s=>s.url):[])];
  return sources.some(url=>officialKey(url)===key);
};
/**
 * @param {object[]} events verified canonical event objects with explicit
 * official page link/sourceUrl/source record, not inferred title aliases
 * @param {Map<string,object>} byUrl official page facets already extracted
 */
export function linkOfficialSourceFacetsToCanonicalEvents(events,byUrl){
  if(!Array.isArray(events))throw new TypeError('Verified event array required');
  if(!(byUrl instanceof Map))throw new TypeError('Official facet Map required');
  // Sort so duplicate-page selection never depends on Map insertion order.
  const entries=[...byUrl].sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const result=new Map(),seen=new Set(),conflicts=new Set(),fingerprints=new Map();
  // Duplicate normalized pages with conflicting claims must never depend on Map order.
  for(const [url,facets] of entries){
    const key=officialKey(url);
    if(!key||!facets||officialKey(facets.sourceUrl)!==key)continue;
    const fingerprint=JSON.stringify({...facets,sourceUrl:key});
    if(fingerprints.has(key)&&fingerprints.get(key)!==fingerprint)conflicts.add(key);
    else fingerprints.set(key,fingerprint);
  }
  const report={publication:'audit-only',eligiblePages:0,linkedPages:0,unlinkedPages:0,
    ambiguousPages:0,rejectedPages:0,duplicatePages:0,unlinkedExamples:[],ambiguousExamples:[]};
  for(const [url,facets] of entries){
    const key=officialKey(url);
    if(!key||!facets||officialKey(facets.sourceUrl)!==key){report.rejectedPages++;continue;}
    if(seen.has(key)){report.duplicatePages++;continue;}
    seen.add(key);report.eligiblePages++;
    if(conflicts.has(key)){
      report.ambiguousPages++;
      report.ambiguousExamples.push({sourceUrl:'https://'+key,candidateIds:[]});
      continue;
    }
    const candidates=[...new Set(events.filter(e=>eventMatches(e,key)).map(e=>e.id))].sort();
    // Only authoritative, explicit source ownership; never fuzzy event matching.
    const safeUrl='https://'+key;
    if(!candidates.length){
      report.unlinkedPages++;
      report.unlinkedExamples.push({sourceUrl:safeUrl});
      continue;
    }
    if(candidates.length>1){
      report.ambiguousPages++;
      report.ambiguousExamples.push({sourceUrl:safeUrl,candidateIds:candidates.slice(0,8)});
      continue;
    }
    const id=candidates[0];
    if(!result.has(id))result.set(id,[]);
    // Provenance must equal facets.sourceUrl exactly (normalizeEventSourceFacets contract).
    result.get(id).push({sourceId:'official',sourceUrl:facets.sourceUrl,facets});
    report.linkedPages++;
  }
  report.unlinkedExamples.sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl));
  report.ambiguousExamples.sort((a,b)=>a.sourceUrl.localeCompare(b.sourceUrl));
  report.unlinkedExamples=report.unlinkedExamples.slice(0,12);
  report.ambiguousExamples=report.ambiguousExamples.slice(0,12);
  return {byEvent:result,report};
}
