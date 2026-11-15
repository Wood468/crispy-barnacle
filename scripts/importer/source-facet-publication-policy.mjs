/*
 * Publication-readiness policy for independently normalized event-source facets.
 *
 * No file writes or network calls: this module selects eligible *candidates*
 * for a later reviewed publisher. It MUST NOT be used to publish automatically.
 * The input is the output of normalizeEventSourceFacets(), with exact canonical
 * event linking already performed. URL provenance is checked independently.
 */
const FIELDS=['benefits','featuredMoves','researchPrograms'];
const SOURCE_HOSTS=Object.freeze({
  official:['pokemongo.com','www.pokemongo.com'],
  leekduck:['leekduck.com','www.leekduck.com'],
  hub:['pokemongohub.net','www.pokemongohub.net'],
  serebii:['serebii.net','www.serebii.net']
});
const VALID_ACCESS=new Set(['free','ticket','addon','unknown']);
const safe=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const normal=s=>safe(s).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const clone=x=>JSON.parse(JSON.stringify(x));
const sourceProof=refs=>{
  if(!Array.isArray(refs)||!refs.length)return null;
  const ids=new Set();
  for(const r of refs){
    if(!r||typeof r.sourceId!=='string')return null;
    let url;
    try{url=new URL(r.url)}catch{return null}
    if(url.protocol!=='https:'||url.username||url.password||url.port||!SOURCE_HOSTS[r.sourceId]?.includes(url.hostname))return null;
    ids.add(r.sourceId);
  }
  return ids;
};
const reasonsFor=(record,type,semanticConflicts)=>{
  const reasons=[];
  if(!record||typeof record!=='object'||!safe(record.id,200)){return ['invalid-record'];}
  if(record.status==='disputed'||record.status==='unconfirmed')reasons.push(record.status);
  else if(!['source-claimed','corroborated'].includes(record.status))reasons.push('unknown-source-status');
  const sources=sourceProof(record.sourceRefs);
  if(!sources)reasons.push('invalid-source-evidence');
  else {
    if(record.status==='corroborated'&&sources.size<2)reasons.push('uncorroborated-status');
    if(!sources.has('official')&&sources.size<2)reasons.push('insufficient-independent-sources');
  }
  const access=safe(record.access);
  if(!VALID_ACCESS.has(access))reasons.push('invalid-access');
  if(access==='unknown')reasons.push('unknown-audience');
  if((access==='ticket'||access==='addon')&&!sources?.has('official'))reasons.push('paid-needs-official-source');
  if(type==='benefits'){
    if(!safe(record.kind,50)||!safe(record.label,200))reasons.push('missing-benefit-details');
    const collision=normal(record.kind)+'|'+normal(record.label);
    if(semanticConflicts.has(collision))reasons.push('conflicting-audience-claims');
    if((access==='ticket'||access==='addon')&&!safe(record.windowText)&&!safe(record.dayScope))
      reasons.push('paid-window-unverified');
    if((record.kind==='raid-passes'||record.kind==='max-particles')&&access!=='free'){
      if(typeof record.replacesFreeLimit!=='boolean'||!safe(record.replacementEvidence))
        reasons.push('replacement-rule-unverified');
    }
  } else if(type==='featuredMoves'){
    if(!safe(record.pokemonLabel,120)||!safe(record.move,100)||!['fast','charged'].includes(record.moveKind))
      reasons.push('missing-featured-attack');
    const methods=record.acquisitionMethods;
    if(!Array.isArray(methods)||!methods.some(x=>['catch','evolve','raid'].includes(x))||
       methods.some(x=>!['catch','evolve','raid'].includes(x)))reasons.push('acquisition-unverified');
    // A paid featured attack can be available only during a selected session.
    // An event-wide date or unspecified ticket window is not enough evidence
    // to publish a time-bound paid acquisition claim.
    const verifiedDayScope=['ticketed-day','both-event-days','all-day'].includes(record.dayScope);
    if((access==='ticket'||access==='addon')&&!safe(record.windowText)&&!verifiedDayScope)
      reasons.push('paid-move-window-unverified');
  } else if(type==='researchPrograms'){
    if(!['special','timed','field'].includes(record.kind)||!safe(record.title,200))
      reasons.push('missing-research-program');
    if(!Array.isArray(record.sourceResearchEvidence)||!record.sourceResearchEvidence.length)
      reasons.push('research-claims-unattributed');
    else if(!sources||record.sourceResearchEvidence.some(x=>
      !x||!sources.has(x.sourceId)||!safe(x.url)||!record.sourceRefs.some(r=>
        r.sourceId===x.sourceId&&r.url===x.url)))
      reasons.push('research-evidence-mismatch');
    // A stage label is not evidence for actual task text or reward identity.
    // The future publisher may display it only as a stage placeholder.
    if(Array.isArray(record.steps)&&record.steps.some(s=>s.taskRewardEvidence!=='not-extracted'))
      reasons.push('unreviewed-research-stage-content');
  }
  return [...new Set(reasons)].sort();
};
/**
 * Determine if normalized claims have enough independent evidence for a
 * future publication review. Output is audit-only and never a live snapshot.
 *
 * Paid benefits and ticketed research require official primary-source proof;
 * community-only claims remain held until corroborated by an official source.
 */
export function assessSourceFacetPublicationReadiness(normalized){
  if(!normalized||normalized.schemaVersion!==1||normalized.publication!=='staging-only'||
    !safe(normalized.eventId)||!FIELDS.every(field=>Array.isArray(normalized[field])))
    throw new TypeError('Normalized staging event facets required');
  const colliding=new Map();
  for(const benefit of normalized.benefits){
    const key=normal(benefit?.kind)+'|'+normal(benefit?.label);
    if(!key||key==='|')continue;
    if(!colliding.has(key))colliding.set(key,new Set());
    colliding.get(key).add(benefit.access);
  }
  const conflicts=new Set([...colliding].filter(([,access])=>access.size>1).map(([key])=>key));
  const eligible={},held={},reasonCounts={};
  for(const type of FIELDS){
    eligible[type]=[];held[type]=[];
    for(const record of normalized[type]){
      const reasons=reasonsFor(record,type,conflicts);
      if(reasons.length){
        held[type].push({id:safe(record?.id,200)||'(invalid)',reasons});
        for(const reason of reasons)reasonCounts[reason]=(reasonCounts[reason]||0)+1;
      }else eligible[type].push(clone(record));
    }
    eligible[type].sort((a,b)=>a.id.localeCompare(b.id));
    held[type].sort((a,b)=>a.id.localeCompare(b.id));
  }
  return {
    schemaVersion:1,publication:'audit-only',eventId:normalized.eventId,
    eligible,held,
    report:{
      eligible:Object.fromEntries(FIELDS.map(k=>[k,eligible[k].length])),
      held:Object.fromEntries(FIELDS.map(k=>[k,held[k].length])),
      reasons:Object.fromEntries(Object.entries(reasonCounts).sort((a,b)=>a[0].localeCompare(b[0])))
    }
  };
}
/**
 * Preserve a previously verified event snapshot on a transient source outage
 * only when it belongs to the same event and is still inside a bounded
 * freshness interval. Never turn draft/audit-only claims into last known good.
 */
export function retainVerifiedFacetSnapshotOnOutage(eventId,previous,{now,maxAgeHours=168}={}){
  if(!safe(eventId))throw new TypeError('eventId required');
  if(!previous||previous.publication!=='verified'||previous.eventId!==eventId||
      previous.schemaVersion!==1||typeof previous.verifiedAt!=='string')return null;
  if(typeof maxAgeHours!=='number'||!Number.isFinite(maxAgeHours)||maxAgeHours<=0)return null;
  const timestamp=Date.parse(previous.verifiedAt),current=Date.parse(now);
  if(!Number.isFinite(timestamp)||!Number.isFinite(current)||
     timestamp>current||current-timestamp>maxAgeHours*3600000)return null;
  return {decision:'retain-last-known-good',snapshot:clone(previous)};
}
