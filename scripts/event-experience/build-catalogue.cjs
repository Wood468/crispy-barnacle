/* Compile the established trusted source snapshots into one validated, atomic read model. */
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const A=require('../../public/event-adapter.js');
const C=require('./contract-v1.js');
const Catalogue=require('../../public/event-catalogue.js');
const L=require('../../public/lib.js');
const {reconcile}=require('./identity-index-v1.cjs');
const Art=require('../../public/event-art.js');
function key(url){try{const u=new URL(url);return u.origin+u.pathname.replace(/\/$/,'');}catch{return '';}}
function publicValue(value){if(typeof value==='string')return L.isPrivateLink(value)?undefined:value;if(Array.isArray(value))return value.map(publicValue).filter(v=>v!==undefined);if(value&&typeof value==='object'){if(typeof value.url==='string'&&L.isPrivateLink(value.url))return undefined;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,publicValue(v)]).filter(([,v])=>v!==undefined));}return value;}
function digest(event){return crypto.createHash('sha256').update(JSON.stringify(event,(k,v)=>['sources','internalValidation','revision','amendment'].includes(k)?undefined:v)).digest('hex');}

/* Promotional artwork inheritance. An event never loses a verified banner because its facts arrive in several records:
   (1) the page-level index written by the importer (official / Leek Duck pages' own og:image) is joined to every event that lists
   that page as its own source, and (2) an event shares the verified banner of another record that cites the same Leek Duck or
   official page. Every candidate must pass the Release 1.1 rule (event-art verify: year, article folder, place; never a generic
   image). A shared official news page must be the event's primary source or its address must name the event. Distinct events are
   never merged by this step; only the image is carried. */
function pageKey(url){return String(url||'').replace(/[?#].*$/,'').replace(/\/?$/,'/').toLowerCase();}
function evidence(model){const d=model.schedule||(model.internalValidation&&model.internalValidation.legacyDates)||{};return {name:model.title,start:d.start||'',end:d.end||d.start||'',region:''};}
function inheritArtwork(out,artwork,policy){
 const pages=(artwork&&artwork.pages)||{},models=[...out.values()],byPage=new Map();
 const rx=v=>{try{return new RegExp(v,'i');}catch{return null;}};
 const reject=((policy&&policy.rejectPages)||[]).map(r=>rx(r.pattern)).filter(Boolean),series=((policy&&policy.series)||[]).map(r=>({url:rx(r.pattern),title:rx(r.title),label:r.label})).filter(r=>r.url);
 const rejectedPage=url=>reject.some(r=>r.test(url));
 /* Community photography is never event artwork: drop its image from every record, however it arrived. */
 const rejectedImages=new Set(Object.entries(pages).filter(([url,e])=>e&&e.image&&rejectedPage(url)).map(([,e])=>e.image));
 models.forEach(m=>{if(m.image&&rejectedImages.has(m.image))m.image=null;});
 const ownPages=m=>(m.sources||[]).map(s=>s&&s.url).filter(u=>/^https:\/\/(?:www\.)?(?:pokemongo|leekduck)\.com\//i.test(u||''));
 models.forEach(m=>ownPages(m).forEach(u=>{const k=pageKey(u);(byPage.get(k)||byPage.set(k,[]).get(k)).push(m);}));
 const words=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w=>w.length>=4&&!/^(pokemon|event|events|with|from|raid|battles|battle|area|2025|2026|2027)$/.test(w));
 function pageFits(model,url,primary){
  const slug=new URL(url).pathname.toLowerCase(),title=words(model.title);
  /* A named installment ("Event: Place") needs its own page: a sibling's or the whole event's page is not its artwork. */
  const variant=words(String(model.title).split(':').slice(1).join(':'));
  if(!primary&&variant.length&&!variant.some(w=>slug.includes(w)))return false;
  return primary||title.filter(w=>slug.includes(w)).length>=2;
 }
 let carried=0;
 for(const model of models){
  if(model.image&&!(model.internalValidation&&model.internalValidation.imageUnattributed))continue;
  const ev=evidence(model),urls=ownPages(model),candidates=[];
  const score=url=>{const slug=new URL(url).pathname.toLowerCase();return words(model.title).filter(w=>slug.includes(w)).length;};
  /* The page whose own address best names the event comes first; the primary source is the fallback. */
  urls.filter(url=>!rejectedPage(url)).map((url,i)=>({url,i,score:score(url)})).sort((a,b)=>b.score-a.score||a.i-b.i).forEach(({url,i})=>{const entry=pages[pageKey(url)];if(entry&&entry.image&&pageFits(model,url,i===0))candidates.push(entry.image);});
  /* Reviewed series artwork (data/artwork-policy.json): every location of the series shares its one official image. */
  const seriesImages=new Set();
  series.filter(r=>r.title&&r.title.test(model.title)).forEach(r=>Object.entries(pages).forEach(([url,entry])=>{if(r.url.test(url)&&entry&&entry.image&&!rejectedPage(url)){candidates.push(entry.image);seriesImages.add(entry.image);}}));
  const mine=words(model.title),similar=other=>{const theirs=words(other.title);if(!mine.length||!theirs.length)return false;const named=words(String(model.title).split(':').slice(1).join(':'));if(named.length&&!named.every(w=>theirs.includes(w)))return false;const shared=mine.filter(w=>theirs.includes(w)).length;return shared===Math.min(mine.length,theirs.length)||shared/new Set([...mine,...theirs]).size>=0.6;};
  urls.filter(url=>!rejectedPage(url)).forEach(url=>(byPage.get(pageKey(url))||[]).forEach(other=>{if(other!==model&&other.image&&similar(other))candidates.push(other.image);}));
  const years=(url=>(url.match(/20\d{2}/g)||[]).map(Number));
  for(const image of candidates){
   if(!Art.verify(image,ev))continue;
   const claimed=urls.flatMap(years),own=[ev.start,ev.end].map(x=>+String(x).slice(0,4)).filter(Boolean);
   if(!seriesImages.has(image)&&claimed.length&&own.length&&!claimed.some(y=>own.includes(y)))continue;
   /* An undated event cannot confirm an image's year: a year in the image address must be named by the event's title or its own page addresses. */
   const imageYears=(image.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/g)||[]).map(x=>+x.replace(/\D/g,''));
   const known=new Set([...own,...claimed,...years(String(model.title))]);
   if(imageYears.length&&!own.length&&!imageYears.every(y=>known.has(y)))continue;
   model.image=image;if(model.internalValidation)delete model.internalValidation.imageUnattributed;carried++;break;
  }
 }
 /* Label shared series artwork so provenance is explicit (never presented as event-specific art). */
 for(const model of out.values()){
  if(!model.image)continue;
  for(const [url,entry] of Object.entries(pages)){
   if(!entry||entry.image!==model.image)continue;
   const rule=series.find(r=>r.url.test(url)&&(!r.title||r.title.test(model.title)));
   if(rule&&model.internalValidation){model.internalValidation.artScope='series';model.internalValidation.artSourceUrl=entry.sourceUrl||url;model.internalValidation.artLabel=rule.label;break;}
  }
 }
 return carried;
}
function buildCatalogue(input){
 A.configureSpecies(input.dex||input.previous?.species||[]);
 const costumeRows=input.costumeRows||A.costumeDescriptors(input.data,input.costumes);A.configureCostumes(costumeRows);
 const data=input.data||{},details=input.details?.events||{},info=input.info?.events||{},previous=input.previous?.events||[];
 const old=new Map(previous.map(e=>[e.eventId,e])),out=new Map(),coverage=[],warnings=[],rejections=[],oldIndex=reconcile(previous);
 const rules=new Map();for(const pair of input.aliases?.same||[]){if(Array.isArray(pair)&&pair.length===2)rules.set(pair[1],pair[0]);}
 // Reviewed source corrections apply before normalization, never in event-specific UI branches.
 const corrections=input.corrections?.events||{},correctionAliases={};
 if(input.corrections&&input.corrections.schemaVersion!==1)throw Error('Invalid correction schema');
 for(const [id,patch] of Object.entries(corrections)){
  correctionAliases[id]=[id,...(patch.aliases||[])].flatMap(alias=>{const prior=oldIndex.resolve(alias);return prior?[prior.eventId,...(prior.aliases||[])]:[];}).filter(alias=>alias!==id);
  for(const alias of patch.aliases||[]){if(rules.has(alias)&&rules.get(alias)!==id)throw Error('Conflicting correction alias: '+alias);rules.set(alias,id);}
 }
 function urls(model){return new Set((model.sources||[]).filter(s=>s.url&&!L.isPrivateLink(s.url)).map(s=>key(s.url)).filter(Boolean));}
 function samePublishedEvent(a,b){
  const x=a.internalValidation?.legacyDates||a.schedule||{},y=b.internalValidation?.legacyDates||b.schedule||{};
  if(!x.start||!x.end||x.start!==y.start||x.end!==y.end||a.family!==b.family||a.attendance!==b.attendance||JSON.stringify(a.location)!==JSON.stringify(b.location))return false;
  if(L.norm(a.title)!==L.norm(b.title))return false;
  const links=urls(a);return [...urls(b)].some(url=>links.has(url));
 }

 function addRecord(raw,collection){
  if(!raw)throw Error('Missing event record');if(raw.schemaVersion===1)raw={...raw,id:raw.eventId};
  if(!raw.id||!(raw.name||raw.t||raw.title))throw Error('Event requires stable ID and title');
  const bare=String(raw.id).replace(/^cur:/,''),ids=[raw.id,bare,...(raw.detailIds||[])];
  let d=ids.map(id=>details[id]).find(Boolean),i=ids.map(id=>info[id]).find(Boolean)||{};
  // Explicit source URL joins only. A shared title is never identity evidence.
  const url=key(raw.link||raw.sourceUrl);
  if(!d&&url){const hits=Object.values(details).filter(x=>(x.sources||[]).some(s=>key(s.url)===url));if(hits.length===1){/* A named installment ("Meetup: Karlsruhe") never takes the details of a sibling or the whole event just because they share an article. */
    const variant=String(raw.name||raw.t||raw.title||'').split(':').slice(1).join(':').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>=4),hay=(String(hits[0].name||'')+' '+(hits[0].sources||[]).map(x=>x.url).join(' ')).toLowerCase();
    if(!variant.length||variant.some(w=>hay.includes(w)))d=hits[0];}}
  const correctedId=rules.get(String(raw.id))||String(raw.id),patch=corrections[correctedId];
  if(patch)raw={...raw,...patch,schedule:raw.schedule||patch.schedule,pokemon:raw.pokemon||patch.pokemon,id:correctedId,aliases:[...(raw.aliases||[]),...(patch.aliases||[]),...(correctionAliases[correctedId]||[]),...(String(raw.id)!==correctedId?[String(raw.id)]:[])]};
  let model=A.adapt(raw,d,i);if(d&&Object.prototype.hasOwnProperty.call(d,'imageProvenance'))model=C.normalize({...model,image:d.image||null,internalValidation:{...model.internalValidation,imageReviewed:true}});if(d&&d.image&&!Object.prototype.hasOwnProperty.call(d,'imageProvenance'))model=C.normalize({...model,internalValidation:{...model.internalValidation,imageUnattributed:true}});const originalId=model.eventId;
  let canonical=rules.get(originalId)||(oldIndex.resolve(originalId)||{}).eventId;if(canonical===originalId)canonical=null;
  if(!canonical){const matches=[...out.values()].filter(e=>samePublishedEvent(e,model));if(matches.length===1)canonical=matches[0].eventId;}
  if(canonical&&canonical!==model.eventId)model=C.normalize({...model,eventId:canonical,aliases:[...(model.aliases||[]),originalId]});
  const prior=old.get(model.eventId),existing=out.get(model.eventId);
  let merged=existing?A.retain(existing,model):A.retain(prior,model);
  /* A details-only record is typed 'reference'; joining it to a dated announcement must not demote the event's status. */
  for(const earlier of [existing,prior])if(merged.lifecycle==='reference'&&earlier&&earlier.lifecycle&&earlier.lifecycle!=='reference'){merged.lifecycle=earlier.lifecycle;break;}
  const hash=digest(merged),priorHash=prior&&digest(prior);
  merged.internalValidation={...merged.internalValidation,contentHash:hash,revision:prior?(prior.internalValidation?.revision||1)+(priorHash!==hash?1:0):1,amended:!!prior&&priorHash!==hash,native:!!(raw.schemaVersion===1||existing?.internalValidation?.native),collection:existing?.internalValidation?.collection||collection};
  out.set(merged.eventId,merged);
 }
 function add(raw,collection){try{addRecord(raw,collection);}catch(error){rejections.push({eventId:raw&&(raw.eventId||raw.id)||null,collection,error:error.message});}}
 function batch(name,items,convert){let count=0;if(items!=null&&!Array.isArray(items)){rejections.push({eventId:null,collection:name,error:'Expected event array'});return;}for(const raw of items||[]){try{add(convert?convert(raw):raw,name);}catch(error){rejections.push({eventId:raw&&raw.id||null,collection:name,error:error.message});}count++;}coverage.push({collection:name,records:count});}
 batch('events',data.events);
 batch('worldEvents',data.worldEvents,x=>({...x,id:x.id||'world:'+key(x.link),name:x.t,place:x.where,kind:L.attendanceOf(x)==='in-person'?'person':'event'}));
 batch('inPerson',data.inPerson,x=>({...x,id:x.id||'in-person:'+C.classify(x.title)+':'+x.title,notes:x.bullets,name:x.title,kind:L.attendanceOf({...x,place:x.place||x.where})==='in-person'?'person':'event'}));
 batch('world-events',input.world?.events,x=>({...x,id:x.id||'source:'+key(x.url||(x.sources||[])[0]?.url)+':'+(x.place||''),name:x.name,kind:L.attendanceOf(x)==='in-person'?'person':'event',link:x.url||(x.sources||[])[0]?.url,s:x.start,e:x.end}));
 batch('regional-events',input.regional?.events,x=>({...x,id:x.id||'regional:'+key(x.url||(x.sources||[])[0]?.url)+':'+(x.place||x.name||''),name:x.name||x.t,kind:L.attendanceOf(x)==='in-person'?'person':'event',link:x.url||(x.sources||[])[0]?.url}));
 batch('season',input.season?.items,x=>({...x,name:x.name,link:x.url,scope:'worldwide_local',detailIds:x.detailId?[x.detailId]:[]}));
 batch('spotlight',data.spotlight,x=>({id:'sp:'+x.d,name:x.n+' Spotlight Hour',s:x.d+'T18:00',e:x.d+'T19:00',scope:'worldwide_local',bonuses:x.b?[x.b]:[],featured:[{name:x.n,methods:['wild']}]}));
 batch('raidHour',data.raidHour,x=>({id:'rh:'+x.d,name:x.n+' Raid Hour',s:x.d+'T18:00',e:x.d+'T19:00',scope:'worldwide_local',featured:[{name:x.n,methods:['raid']}]}));
 batch('rotation',data.rotation,x=>({...x,id:x.id||'rotation:'+x.s,name:'Raid rotation',scope:'worldwide_local',featured:[...(x.five?[{name:x.five,methods:['raid']}]:[]),...(x.mega?[{name:x.mega,methods:['raid']}]:[])]}));
 batch('maxBattles',data.maxBattles,x=>Array.isArray(x)?{id:'max:'+x[0],name:'Max Battles',s:x[0],e:x[1],featured:typeof x[2]==='string'?[{name:x[2],methods:['max']}]:[]}:({...x,id:x.id||'max:'+x.s,name:x.t||x.name||'Max Battles'}));
 const referenced=new Set([...out.values()].flatMap(e=>e.internalValidation?.detailRefs||[]));
 Object.entries(details).forEach(([id,d])=>{if(!out.has(id)&&!referenced.has(id)&&d.name)add(d.normalizedEvent||{id,name:d.name,lifecycle:d.lifecycle||'reference',detailIds:[id],sources:d.sources},'source-details');});
 const consumed=new Set([...out.values()].flatMap(e=>e.aliases||[]));
 previous.forEach(e=>{if(!out.has(e.eventId)&&!consumed.has(e.eventId))out.set(e.eventId,e);});
 inheritArtwork(out,input.artwork,input.artworkPolicy);
 const events=[...out.values()].sort((a,b)=>a.eventId.localeCompare(b.eventId));
 const checked=Catalogue.prepare({schemaVersion:1,events},input.previous),conflicts=checked.diagnostics.conflicts;
 if(rejections.length||!checked.accepted){const rejected=rejections.concat(checked.diagnostics.rejections.filter(r=>events.length||!rejections.length||r.eventId));const diagnostics={rejectedCount:rejected.length,rejections:rejected,conflicts};const error=Error('Catalogue validation failed: '+JSON.stringify(diagnostics));error.diagnostics=diagnostics;throw error;}
 return publicValue({schemaVersion:1,species:input.dex||input.previous?.species||[],costumes:costumeRows,events,coverage,excluded:[{collection:'upcoming',reason:'Pokémon release summaries, not independent event instances; existing release views are preserved'},{collection:'regionals',reason:'Geographic Pokémon availability, not event instances'},{collection:'week',reason:'Static week guidance, not event instances'},{collection:'raidNow',reason:'Derived rotation summary, represented by rotation records'},{collection:'pastFests',reason:'Historical reference list, not announced event instances'}],warnings});
}
async function publish(root=path.resolve(__dirname,'../..')){async function read(name,fallback={}){try{return JSON.parse(await fs.readFile(path.join(root,'public',name+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 const [data,details,info,world,regional,season,previous,dex,costumes,artwork]=await Promise.all(['data','event-details','event-info','world-events','regional-events','season','events-v1','dex','costumes','event-artwork'].map(n=>read(n)));
 let corrections={schemaVersion:1,events:{}};try{corrections=JSON.parse(await fs.readFile(path.join(root,'data/event-corrections.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 let aliases={};try{aliases=JSON.parse(await fs.readFile(path.join(root,'data/event-aliases.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 let artworkPolicy={};try{artworkPolicy=JSON.parse(await fs.readFile(path.join(root,'data/artwork-policy.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=buildCatalogue({data,details,info,world,regional,season,previous,dex,costumes,aliases,corrections,artwork,artworkPolicy});
 const target=path.join(root,'public/events-v1.json'),temp=target+'.tmp';await fs.writeFile(temp,JSON.stringify(result,null,1)+'\n');await fs.rename(temp,target);return result;
}
module.exports={buildCatalogue,inheritArtwork,publish,digest};
if(require.main===module)publish().then(result=>console.log('Validated universal catalogue:',result.events.length,'events across',result.coverage.length,'collections')).catch(error=>{console.error(error);process.exitCode=1;});
