/*
 * Export verified Sprint 4 event facets to a separate public feed.
 *
 * TRUST BOUNDARY: expectedSha256ByEvent is supplied ONLY by a trusted
 * release controller after it independently verifies signed publication
 * decisions and records the exact private snapshot SHA-256. An on-disk
 * "publication: verified" label is never sufficient authorization.
 *
 * Nothing here alters event-details.json, event-moves.json or existing UI.
 */
import {readFile,mkdir,open,rename,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';

const EVENT_ID=/^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const HASH=/^[a-f0-9]{64}$/;
const FIELDS=['benefits','featuredMoves','researchPrograms'];
const COMMON=['id','status','access'];
const ALLOW={
  benefits:[...COMMON,'label','kind','dayScope','windowText','addonLabel','replacesFreeLimit','replacementEvidence'],
  featuredMoves:[...COMMON,'pokemonLabel','move','moveKind','acquisitionMethods','dayScope','windowText','sessionLabel'],
  researchPrograms:[...COMMON,'kind','title','storyTitle','paths','onceOnly','steps']
};
const VALID_SOURCE_HOSTS={
  official:['pokemongo.com','www.pokemongo.com'],
  leekduck:['leekduck.com','www.leekduck.com'],
  hub:['pokemongohub.net','www.pokemongohub.net'],
  serebii:['serebii.net','www.serebii.net']
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const cleanText=(value,max=300)=>typeof value==='string'?value.slice(0,max):undefined;
function sourceRef(ref){
  if(!plain(ref)||!Object.hasOwn(VALID_SOURCE_HOSTS,ref.sourceId))throw new TypeError('Unrecognized source attribution');
  const url=new URL(ref.url);
  if(url.protocol!=='https:'||url.username||url.password||
     !VALID_SOURCE_HOSTS[ref.sourceId].includes(url.hostname.toLowerCase()))
    throw new TypeError('Invalid source provenance');
  url.search='';url.hash='';
  return {sourceId:ref.sourceId,url:url.toString(),
    section:cleanText(ref.section,160)||''};
}
function project(type,record){
  if(!plain(record)||typeof record.id!=='string'||!record.id.trim()||record.id.length>160)
    throw new TypeError('Invalid verified facet claim');
  if(!Array.isArray(record.sourceRefs)||!record.sourceRefs.length||record.sourceRefs.length>12)
    throw new TypeError('Verified claim missing bounded sources');
  const projected={};
  for(const key of ALLOW[type]){
    const value=record[key];
    if(value===undefined||value===null)continue;
    if(key==='steps'){
      if(!Array.isArray(value)||value.length>30)throw new TypeError('Unbounded research stages');
      projected.steps=value.map(step=>{
        if(!plain(step)||step.taskRewardEvidence!=='not-extracted')throw new TypeError('Unreviewed research reward');
        return {step:step.step,outOf:step.outOf,title:cleanText(step.title,160)||'',
          taskRewardEvidence:'not-extracted'};
      });
    }else if(key==='paths'){
      if(!Array.isArray(value)||value.length>8)throw new TypeError('Unbounded research paths');
      projected.paths=value.map(v=>cleanText(v,100)||'');
    }else if(key==='acquisitionMethods'){
      if(!Array.isArray(value)||value.some(v=>!['catch','evolve','raid'].includes(v)))
        throw new TypeError('Invalid move acquisition');
      projected.acquisitionMethods=[...value];
    }else if(typeof value==='string'){
      projected[key]=cleanText(value,500);
    }else if(typeof value==='number'||typeof value==='boolean'){
      projected[key]=value;
    }else throw new TypeError('Unexpected facet field type');
  }
  projected.sourceRefs=record.sourceRefs.map(sourceRef);
  return projected;
}
function checkedSnapshot(bytes,eventId,expectedHash){
  if(bytes.length>1024*1024||sha256(bytes)!==expectedHash)
    throw new TypeError('Private verified snapshot SHA mismatch or too large');
  const snapshot=JSON.parse(bytes.toString('utf8'));
  if(!plain(snapshot)||snapshot.schemaVersion!==1||snapshot.publication!=='verified'||
     snapshot.eventId!==eventId||!HASH.test(snapshot.reviewFingerprint||'')||
     typeof snapshot.verifiedAt!=='string'||
     !Number.isFinite(Date.parse(snapshot.verifiedAt))||
     FIELDS.some(type=>!Array.isArray(snapshot[type])||snapshot[type].length>300))
    throw new TypeError('Unverified or malformed canonical event snapshot');
  const facets={};
  for(const type of FIELDS){
    facets[type]=snapshot[type].map(row=>project(type,row));
    const ids=facets[type].map(x=>x.id);
    if(new Set(ids).size!==ids.length)throw new TypeError('Duplicate verified facet claim');
    facets[type].sort((a,b)=>a.id.localeCompare(b.id));
  }
  return {eventId,verifiedAt:snapshot.verifiedAt,
    reviewFingerprint:snapshot.reviewFingerprint,...facets};
}
/**
 * Publish ONLY hashes pinned by a trusted release controller.
 * The destination is fixed under public/ and written atomically.
 */
export async function publishApprovedFacetFeed({rootDir,expectedSha256ByEvent}={}){
  if(typeof rootDir!=='string'||!rootDir.trim()||!plain(expectedSha256ByEvent))
    throw new TypeError('Trusted root and explicit release hash map required');
  const entries=Object.entries(expectedSha256ByEvent);
  if(!entries.length||entries.length>300||entries.some(([id,hash])=>
    !EVENT_ID.test(id)||!HASH.test(hash)))
    throw new TypeError('Nonempty bounded canonical event hash map required');
  const root=resolve(rootDir);
  const events=[];
  // Complete validation before creating or replacing ANY public output.
  for(const [id,hash] of entries.sort(([a],[b])=>a.localeCompare(b))){
    const bytes=await readFile(join(root,'data','verified-event-facets',id+'.json'));
    events.push(checkedSnapshot(bytes,id,hash));
  }
  const output={schemaVersion:1,publication:'verified-feed',events};
  const payload=JSON.stringify(output,null,2)+'\n';
  if(Buffer.byteLength(payload)>8*1024*1024)
    throw new TypeError('Published feed exceeds size limit');
  const dir=join(root,'public');await mkdir(dir,{recursive:true});
  const target=join(dir,'verified-event-facets.json');
  const temporary=join(dir,'.verified-event-facets.'+randomBytes(12).toString('hex')+'.tmp');
  const file=await open(temporary,'wx',0o600);
  try{
    await file.writeFile(payload,'utf8');await file.sync();await file.close();
    await rename(temporary,target);
  }catch(e){
    try{await file.close()}catch{}
    try{await unlink(temporary)}catch{}
    throw e;
  }
  return {publication:'verified-feed',eventCount:events.length,
    sha256:sha256(Buffer.from(payload)),path:'public/verified-event-facets.json'};
}
