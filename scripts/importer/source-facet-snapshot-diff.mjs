/*
 * Deterministic review-only delta between a previously verified event facet
 * snapshot and a newly proposed review candidate.
 * No writes, publication, or claim-text leakage in the returned summary.
 */
const TYPES=['benefits','featuredMoves','researchPrograms'];
const FIELDS={
  benefits:['id','label','kind','access','dayScope','windowText','addonLabel','replacesFreeLimit','replacementEvidence','status','sourceRefs'],
  featuredMoves:['id','pokemonLabel','move','moveKind','access','acquisitionMethods','dayScope','windowText','sessionLabel','status','sourceRefs'],
  researchPrograms:['id','kind','title','storyTitle','access','paths','onceOnly','steps','status','sourceRefs']
};
const validId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(s);
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  }
  return value;
};
const identity= (type,value)=>JSON.stringify(canonical(
  Object.fromEntries(FIELDS[type].filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]))
));
function records(snapshot,type){
  if(!Array.isArray(snapshot[type]))throw new TypeError('Facet arrays required');
  const map=new Map();
  for(const record of snapshot[type]){
    if(!record||!validId(record.id)||map.has(record.id))
      throw new TypeError('Unique valid facet claim IDs required');
    map.set(record.id,identity(type,record));
  }
  return map;
}
/**
 * @param {object|null} previous previously VERIFIED snapshot, or null on first review
 * @param {object} next explicit review-candidate, never live data
 * @returns {object} bounded audit-only counts + claim IDs (no reward/source text)
 */
export function compareFacetSnapshotForReview(previous,next){
  if(!next||next.schemaVersion!==1||next.publication!=='review-candidate'||
     next.requiresIndependentReview!==true||!validId(next.eventId))
    throw new TypeError('Explicit canonical review candidate required');
  if(previous!==null&&(!previous||previous.schemaVersion!==1||
      previous.publication!=='verified'||previous.eventId!==next.eventId))
    throw new TypeError('Matching previously verified snapshot required');
  const changes={};let needsReview=false;
  const massRemovalTypes=[];
  for(const type of TYPES){
    const old=previous?records(previous,type):new Map();
    const proposed=records(next,type);
    const added=[...proposed.keys()].filter(id=>!old.has(id)).sort();
    const removed=[...old.keys()].filter(id=>!proposed.has(id)).sort();
    const changed=[...proposed.keys()].filter(id=>old.has(id)&&old.get(id)!==proposed.get(id)).sort();
    const unchanged=[...proposed.keys()].filter(id=>old.has(id)&&old.get(id)===proposed.get(id)).length;
    if(added.length||removed.length||changed.length)needsReview=true;
    // Missing provider data must never silently clear last-known-good
    // snapshots. Large removals need separate explicit reviewer attention.
    if(old.size>0&&removed.length>0&&removed.length*2>=old.size)
      massRemovalTypes.push(type);
    changes[type]={added,removed,changed,unchanged};
  }
  return {schemaVersion:1,publication:'audit-only',eventId:next.eventId,
    requiresIndependentReview:true,hasChanges:needsReview,
    requiresRemovalReview:massRemovalTypes.length>0,
    massRemovalTypes,changes};
}
