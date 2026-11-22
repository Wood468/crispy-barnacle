/*
 * Universal event-source facet contract (draft v1).
 *
 * Normalize independently sourced event claims without treating a published
 * description as confirmation of an entitlement. Not connected to public
 * event output or UI; this module has no I/O or network dependencies.
 */
import { createHash } from 'node:crypto';
const trim = x => typeof x==='string'?x.trim():'';
const norm = x => trim(x).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
// A truncated readable slug alone can collide for long reward descriptions.
// Retain a deterministic identity digest so future event tiles have unique keys.
const atom = x => {
  const identity=norm(x);
  const slug=identity.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,128)||'claim';
  return slug+'-'+createHash('sha256').update(identity).digest('hex').slice(0,12);
};
const unique = xs => [...new Set(xs)].sort();
// Source identity is verified against the actual hostname, not a caller's
// claimed sourceId; this excludes lookalike / userinfo authority spoofing.
const SOURCE_HOSTS = Object.freeze({official:['pokemongo.com','www.pokemongo.com'],leekduck:['leekduck.com','www.leekduck.com'],hub:['pokemongohub.net','www.pokemongohub.net'],serebii:['serebii.net','www.serebii.net']});
const SOURCE_IDS = new Set(Object.keys(SOURCE_HOSTS));
const ACCESS = new Set(['free','ticket','addon','unknown']);
const MOVE_KIND = new Set(['fast','charged']);
const RESEARCH_KIND = new Set(['special','timed','field']);
const DAY_SCOPE = new Set(['ticketed-day','both-event-days','all-day']);
const ACQUIRE = new Set(['catch','evolve','raid','unknown']);
const TYPES = ['benefits','featuredMoves','researchPrograms'];
const cleanUrl = value => {
  try {
    const u = new URL(trim(value));
    if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname||u.hash) return null;
    return u.toString();
  } catch { return null; }
};
const audience = raw => {
  const access=trim(raw.access)||'unknown';
  return ACCESS.has(access)?access:'unknown';
};
const safe = (x,max=500) => trim(x).slice(0,max);
const safeEvidence = (value,max=400) => safe(value,max*2)
  .replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ').trim().replace(/\s+([.,;:!?])/g,'$1').slice(0,max)||null;
function researchSourceEvidence(raw,source,section){
  const medalEffects=[];
  for(const entry of (Array.isArray(raw.medalEffects)?raw.medalEffects:[]).slice(0,8)){
    const medalLabel=safeEvidence(entry?.medalLabel,100),effectText=safeEvidence(entry?.effectText,400);
    if(medalLabel&&effectText&&!medalEffects.some(x=>x.medalLabel===medalLabel&&x.effectText===effectText))
      medalEffects.push({medalLabel,effectText});
  }
  medalEffects.sort((a,b)=>(a.medalLabel+'|'+a.effectText).localeCompare(b.medalLabel+'|'+b.effectText));
  return {sourceId:source.sourceId,url:source.url,section,
    storyTitle:safeEvidence(raw.storyTitle,180),
    claimInstructionsText:safeEvidence(raw.claimInstructionsText,400),
    completionDeadlineText:safeEvidence(raw.completionDeadlineText,400),
    bonusActivationText:safeEvidence(raw.bonusActivationText,400),
    completionRewardText:safeEvidence(raw.completionRewardText,400),
    medalEffects};
}
const cleanMoveMethods = methods => {
  const values=Array.isArray(methods)?methods.filter(x=>ACQUIRE.has(x)):[];
  return values.length?unique(values):['unknown'];
};
const provenance = (record,kind) => {
  if(!record||!SOURCE_IDS.has(record.sourceId))return null;
  const url=cleanUrl(record.sourceUrl);
  if(!url||!SOURCE_HOSTS[record.sourceId]?.includes(new URL(url).hostname))return null;
  const f=record.facets;
  if(!f||!Array.isArray(f[kind])||cleanUrl(f.sourceUrl)!==url)return null;
  return {sourceId:record.sourceId,url};
};
const fmtKey = values => values.map(x=>norm(String(x??''))).join('\u001f');
// A source's boolean is NOT evidence that a paid limit replaces a free limit.
// Require explicit, attributable wording; absent evidence stays unknown.
function replacementRule(raw,kind){
  if(kind!=='raid-passes'&&kind!=='max-particles')return {rule:false,evidence:null,missing:false};
  const evidence=safe(raw.replacementEvidence,240);
  const mentionsFree=/\bfree\b/i.test(evidence)&&/\blimits?\b/i.test(evidence);
  const replaces=mentionsFree&&/\b(?:replaces?|replaced|instead of)\b/i.test(evidence);
  const stacks=mentionsFree&&/\b(?:stack(?:s|ed)?|in addition to|on top of)\b/i.test(evidence);
  if(replaces&&!stacks&&raw.replacesFreeLimit===true)return {rule:true,evidence,missing:false};
  if(stacks&&!replaces&&raw.replacesFreeLimit===false)return {rule:false,evidence,missing:false};
  return {rule:null,evidence:null,missing:raw.replacesFreeLimit===true};
}
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
    const replacement=replacementRule(raw,kind);
    return { ...core,id:atom(['benefit',kind,access,addonLabel,dayScope,windowText,label].join('|')),
      label,kind,dayScope,windowText,addonLabel,
      replacesFreeLimit:replacement.rule,replacementEvidence:replacement.evidence,
      _replacementStates:replacement.rule===null?[]:[replacement.rule],
      _warnings:replacement.missing?['replacement-evidence-missing']:[],
      _disputes:[],
      _key:fmtKey([kind,access,addonLabel,dayScope,windowText,label])};
  }
  if(type==='featuredMoves'){
    const pokemonLabel=safe(raw.pokemonLabel,100),move=safe(raw.move,90),moveKind=trim(raw.moveKind);
    if(!pokemonLabel||!move||!MOVE_KIND.has(moveKind))return null;
    const methods=cleanMoveMethods(raw.acquisitionMethods);
    // Only retain explicit source-scoped availability. A ticketed Saturday
    // move and an otherwise identical Sunday move are distinct claims.
    // Missing timing remains unknown; never inherit event-wide hours.
    const dayScope=DAY_SCOPE.has(raw.dayScope)?raw.dayScope:null;
    const windowText=safe(raw.windowText,400)||null;
    const sessionLabel=safe(raw.sessionLabel,140)||null;
    const identity=[pokemonLabel,moveKind,move,access,methods.join(','),dayScope,windowText,sessionLabel];
    return {...core,id:atom(['move',...identity].join('|')),
      pokemonLabel,move,moveKind,acquisitionMethods:methods,
      dayScope,windowText,sessionLabel,
      _key:fmtKey(identity)};
  }
  if(type==='researchPrograms'){
    const title=safe(raw.title,200),kind=trim(raw.kind);
    if(!title||!RESEARCH_KIND.has(kind))return null;
    const paths=unique((Array.isArray(raw.paths)?raw.paths:[]).map(x=>safe(x,100)).filter(Boolean));
    const steps=(Array.isArray(raw.steps)?raw.steps:[]).filter(s=>
      Number.isInteger(s?.step)&&Number.isInteger(s?.outOf)&&s.step>0&&s.outOf<=100&&s.step<=s.outOf
    ).slice(0,100).map(s=>({step:s.step,outOf:s.outOf,title:safe(s.title,160),taskRewardEvidence:'not-extracted'}));
    const onceOnly=typeof raw.onceOnly==='boolean'?raw.onceOnly:null;
    const storyTitle=safeEvidence(raw.storyTitle,180)||null;
    return {...core,id:atom(['research',kind,title,storyTitle,access,paths.join(',')].join('|')),
      kind,title,storyTitle,paths,steps,onceOnly,
      sourceResearchEvidence:[researchSourceEvidence(raw,source,section)],
      _onceStates:onceOnly===null?[]:[onceOnly],_disputes:[],
      _key:fmtKey([kind,title,storyTitle,access,paths.join(',')])};
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
        // Unconfirmed claims cannot become confirmed merely by repetition.
        if(claim.status==='unconfirmed')old.status='unconfirmed';
        else if(old.status!=='unconfirmed'&&new Set(old.sourceRefs.map(s=>s.sourceId)).size>=2)old.status='corroborated';
        if(type==='benefits'){
          old._warnings=unique([...old._warnings,...claim._warnings]);
          old._replacementStates=unique([...old._replacementStates,...claim._replacementStates]);
          if(old._replacementStates.length>1){
            old.replacesFreeLimit=null;
            old.replacementEvidence=null;
            if(!old._disputes.includes('replacement-rule-disagreement'))
              old._disputes.push('replacement-rule-disagreement');
          }else if(old._replacementStates.length===1){
            old.replacesFreeLimit=old._replacementStates[0];
            old.replacementEvidence=[old.replacementEvidence,claim.replacementEvidence]
              .filter(Boolean).sort()[0]??null;
          }
        }
        if(type==='researchPrograms'){
          // Keep exact source statements independent: don't silently replace
          // a paid medal activation or claim deadline with another summary.
          for(const evidence of claim.sourceResearchEvidence){
            if(!old.sourceResearchEvidence.some(x=>JSON.stringify(x)===JSON.stringify(evidence)))
              old.sourceResearchEvidence.push(evidence);
          }
          // "One time" and "repeatable on extra days" are not equivalent.
          old._onceStates=unique([...old._onceStates,...claim._onceStates]);
          if(old._onceStates.length>1){
            old.onceOnly=null;
            if(!old._disputes.includes('research-once-only-disagreement'))
              old._disputes.push('research-once-only-disagreement');
          }else old.onceOnly=old._onceStates[0]??null;
          for(const step of claim.steps){
            const matched=old.steps.find(s=>s.step===step.step&&s.outOf===step.outOf);
            if(!matched){old.steps.push(step);continue;}
            if(matched.taskRewardEvidence==='disputed')continue;
            if(norm(matched.title)!==norm(step.title)){
              matched.title='';
              matched.taskRewardEvidence='disputed';
              const reason='research-stage-disagreement:'+step.step+'/'+step.outOf;
              if(!old._disputes.includes(reason))old._disputes.push(reason);
            }else matched.title=[matched.title,step.title].sort()[0];
          }
          old.steps.sort((a,b)=>a.step-b.step||a.outOf-b.outOf);
        }
      }
    }
  }
  const out={schemaVersion:1,publication:'staging-only',eventId};
  for(const type of TYPES)out[type]=[...groups[type].values()].map(record=>{
    for(const reason of record._warnings||[])warnings.push({id:record.id,field:type,reason});
    for(const reason of record._disputes||[])warnings.push({id:record.id,field:type,reason});
    const {_key,_replacementStates,_onceStates,_warnings,_disputes,...visible}=record;
    return {
      ...visible,
      status:(record._disputes||[]).length?'disputed':record.status,
      sourceRefs:visible.sourceRefs.sort((a,b)=>
        (a.sourceId+'|'+a.url+'|'+a.section).localeCompare(b.sourceId+'|'+b.url+'|'+b.section)),
      ...(type==='researchPrograms'?{
        sourceResearchEvidence:visible.sourceResearchEvidence.sort((a,b)=>
          JSON.stringify(a).localeCompare(JSON.stringify(b)))
      }:{})
    };
  }).sort((a,b)=>a.id.localeCompare(b.id));
  out.warnings=warnings.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))).slice(0,30);
  return out;
}
