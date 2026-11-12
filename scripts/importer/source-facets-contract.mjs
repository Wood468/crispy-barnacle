/*
 * Universal event-source facet contract (draft v1).
 *
 * Normalize independently sourced event claims without treating a published
 * description as confirmation of an entitlement. Not connected to public
 * event output or UI; this module has no I/O or network dependencies.
 */
const trim = x => typeof x==='string'?x.trim():'';
const norm = x => trim(x).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const atom = x => norm(x).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160);
const unique = xs => [...new Set(xs)].sort();
const SOURCE_IDS = new Set(['official','leekduck','hub','serebii']);
const ACCESS = new Set(['free','ticket','addon','unknown']);
const MOVE_KIND = new Set(['fast','charged']);
const RESEARCH_KIND = new Set(['special','timed','field']);
const DAY_SCOPE = new Set(['ticketed-day','both-event-days','all-day']);
const ACQUIRE = new Set(['catch','evolve','raid','unknown']);
const TYPES = ['benefits','featuredMoves','researchPrograms'];
const cleanUrl = value => {
  try {
    const u = new URL(trim(value));
    if(u.protocol!=='https:'||u.username||u.password||!u.hostname||u.hash) return null;
    return u.toString();
  } catch { return null; }
};
const audience = raw => {
  const access=trim(raw.access)||'unknown';
  return ACCESS.has(access)?access:'unknown';
};
const safe = (x,max=500) => trim(x).slice(0,max);
const cleanMoveMethods = methods => {
  const values=Array.isArray(methods)?methods.filter(x=>ACQUIRE.has(x)):[];
  return values.length?unique(values):['unknown'];
};
const provenance = (record,kind) => {
  if(!record||!SOURCE_IDS.has(record.sourceId))return null;
  const url=cleanUrl(record.sourceUrl);
  if(!url)return null;
  const f=record.facets;
  if(!f||!Array.isArray(f[kind])||cleanUrl(f.sourceUrl)!==url)return null;
  return {sourceId:record.sourceId,url};
};
const fmtKey = values => values.map(x=>norm(String(x??''))).join('\u001f');
function normalizeClaim(type,raw,source){
  if(!raw||typeof raw!=='object')return null;
  const src=raw.source;
  if(!src||cleanUrl(src.url)!==source.url)return null;
  const access=audience(raw), section=safe(src.section,160), status=raw.status==='unconfirmed'?'unconfirmed':'source-claimed';
  const core={access,sourceRefs:[{...source,section}],status};
  if(type==='benefits'){
    const label=safe(raw.label,190),kind=safe(raw.kind,50);
    if(!label||!kind)return null;
    const windowText=safe(raw.windowText,400)||null;
    const dayScope=DAY_SCOPE.has(raw.dayScope)?raw.dayScope:null;
    const addonLabel=access==='addon'?safe(raw.addonLabel,140)||null:null;
    return { ...core,id:atom(['benefit',kind,access,addonLabel,dayScope,windowText,label].join('|')),
      label,kind,dayScope,windowText,addonLabel,replacesFreeLimit:raw.replacesFreeLimit===true,
      _key:fmtKey([kind,access,addonLabel,dayScope,windowText,label,raw.replacesFreeLimit===true])};
  }
  if(type==='featuredMoves'){
    const pokemonLabel=safe(raw.pokemonLabel,100),move=safe(raw.move,90),moveKind=trim(raw.moveKind);
    if(!pokemonLabel||!move||!MOVE_KIND.has(moveKind))return null;
    const methods=cleanMoveMethods(raw.acquisitionMethods);
    return {...core,id:atom(['move',pokemonLabel,moveKind,move,access,methods.join(',')].join('|')),
      pokemonLabel,move,moveKind,acquisitionMethods:methods,
      _key:fmtKey([pokemonLabel,moveKind,move,access,methods.join(',')])};
  }
  if(type==='researchPrograms'){
    const title=safe(raw.title,200),kind=trim(raw.kind);
    if(!title||!RESEARCH_KIND.has(kind))return null;
    const paths=unique((Array.isArray(raw.paths)?raw.paths:[]).map(x=>safe(x,100)).filter(Boolean));
    const steps=(Array.isArray(raw.steps)?raw.steps:[]).filter(s=>
      Number.isInteger(s?.step)&&Number.isInteger(s?.outOf)&&s.step>0&&s.outOf<=100&&s.step<=s.outOf
    ).slice(0,100).map(s=>({step:s.step,outOf:s.outOf,title:safe(s.title,160),taskRewardEvidence:'not-extracted'}));
    const onceOnly=raw.onceOnly===true?true:null;
    return {...core,id:atom(['research',kind,title,access,paths.join(',')].join('|')),
      kind,title,paths,steps,onceOnly,
      _key:fmtKey([kind,title,access,paths.join(',')])};
  }
  return null;
}
/**
 * @param {string} eventId - caller-verified canonical ID; never guessed from URL
 * @param {Array<{sourceId:string,sourceUrl:string,facets:object}>} sourceRecords
 * @returns {object} stable source-backed, non-published facet collections
 */
export function normalizeEventSourceFacets(eventId,sourceRecords){
  if(!trim(eventId)||!/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(eventId))throw new TypeError('Canonical eventId required');
  if(!Array.isArray(sourceRecords))throw new TypeError('Source records must be an array');
  const groups=Object.fromEntries(TYPES.map(t=>[t,new Map()]));
  const warnings=[];
  for(const record of sourceRecords.slice(0,150)){
    for(const type of TYPES){
      const src=provenance(record,type);
      if(!src){if(record?.facets?.[type]?.length)warnings.push({sourceId:safe(record.sourceId,30),field:type,reason:'source-mismatch'});continue;}
      for(const raw of record.facets[type].slice(0,200)){
        const claim=normalizeClaim(type,raw,src);
        if(!claim)continue;
        const old=groups[type].get(claim._key);
        if(!old){groups[type].set(claim._key,claim);continue;}
        const proof=claim.sourceRefs[0];
        if(!old.sourceRefs.some(s=>s.sourceId===proof.sourceId&&s.url===proof.url&&s.section===proof.section))
          old.sourceRefs.push(proof);
        // A source that flags an item as unconfirmed cannot turn it into
        // a confirmed bonus just because another source repeats the wording.
        if(claim.status==='unconfirmed')old.status='unconfirmed';
        else if(old.status!=='unconfirmed'&&new Set(old.sourceRefs.map(s=>s.sourceId)).size>=2)old.status='corroborated';
        // Keep stage evidence from sources without creating fictitious rewards.
        if(type==='researchPrograms'){
          const has=new Set(old.steps.map(s=>s.step+'/'+s.outOf));
          for(const step of claim.steps)if(!has.has(step.step+'/'+step.outOf)){old.steps.push(step);has.add(step.step+'/'+step.outOf);}
          old.steps.sort((a,b)=>a.step-b.step);
        }
      }
    }
  }
  const out={schemaVersion:1,publication:'staging-only',eventId};
  for(const type of TYPES)out[type]=[...groups[type].values()].map(({_key,...record})=>({
    ...record,sourceRefs:record.sourceRefs.sort((a,b)=>
      (a.sourceId+'|'+a.url+'|'+a.section).localeCompare(b.sourceId+'|'+b.url+'|'+b.section))
  })).sort((a,b)=>a.id.localeCompare(b.id));
  out.warnings=warnings.slice(0,30);
  return out;
}
