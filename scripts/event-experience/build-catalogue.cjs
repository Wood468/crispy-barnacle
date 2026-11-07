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
function key(url){try{const u=new URL(url);return u.origin+u.pathname.replace(/\/$/,'');}catch{return '';}}
function publicValue(value){if(typeof value==='string')return L.isPrivateLink(value)?undefined:value;if(Array.isArray(value))return value.map(publicValue).filter(v=>v!==undefined);if(value&&typeof value==='object'){if(typeof value.url==='string'&&L.isPrivateLink(value.url))return undefined;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,publicValue(v)]).filter(([,v])=>v!==undefined));}return value;}
function digest(event){return crypto.createHash('sha256').update(JSON.stringify(event,(k,v)=>['sources','internalValidation','revision','amendment'].includes(k)?undefined:v)).digest('hex');}
function buildCatalogue(input){
 A.configureSpecies(input.dex||input.previous?.species||[]);
 const costumeRows=input.costumeRows||A.costumeDescriptors(input.data,input.costumes);A.configureCostumes(costumeRows);
 const data=input.data||{},details=input.details?.events||{},info=input.info?.events||{},previous=input.previous?.events||[];
 const old=new Map(previous.map(e=>[e.eventId,e])),out=new Map(),coverage=[],warnings=[],rejections=[],oldIndex=reconcile(previous);
 const rules=new Map();for(const pair of input.aliases?.same||[]){if(Array.isArray(pair)&&pair.length===2)rules.set(pair[1],pair[0]);}
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
  if(!d&&url){const hits=Object.values(details).filter(x=>(x.sources||[]).some(s=>key(s.url)===url));if(hits.length===1)d=hits[0];}
  let model=A.adapt(raw,d,i);const originalId=model.eventId;
  let canonical=rules.get(originalId)||(oldIndex.resolve(originalId)||{}).eventId;if(canonical===originalId)canonical=null;
  if(!canonical){const matches=[...out.values()].filter(e=>samePublishedEvent(e,model));if(matches.length===1)canonical=matches[0].eventId;}
  if(canonical&&canonical!==model.eventId)model=C.normalize({...model,eventId:canonical,aliases:[...(model.aliases||[]),originalId]});
  const prior=old.get(model.eventId),existing=out.get(model.eventId);
  let merged=existing?A.retain(existing,model):A.retain(prior,model);
  const hash=digest(merged),priorHash=prior&&digest(prior);
  merged.internalValidation={...merged.internalValidation,contentHash:hash,revision:prior?(prior.internalValidation?.revision||1)+(priorHash!==hash?1:0):1,amended:!!prior&&priorHash!==hash,native:!!(raw.schemaVersion===1||existing?.internalValidation?.native),collection:existing?.internalValidation?.collection||collection};
  out.set(merged.eventId,merged);
 }
 function add(raw,collection){try{addRecord(raw,collection);}catch(error){rejections.push({eventId:raw&&(raw.eventId||raw.id)||null,collection,error:error.message});}}
 function batch(name,items,convert){let count=0;if(items!=null&&!Array.isArray(items)){rejections.push({eventId:null,collection:name,error:'Expected event array'});return;}for(const raw of items||[]){try{add(convert?convert(raw):raw,name);}catch(error){rejections.push({eventId:raw&&raw.id||null,collection:name,error:error.message});}count++;}coverage.push({collection:name,records:count});}
 batch('events',data.events);
 batch('worldEvents',data.worldEvents,x=>({...x,id:x.id||'world:'+key(x.link),name:x.t,place:x.where,kind:x.mode==='in-game'||x.scope==='global'?'event':'person'}));
 batch('inPerson',data.inPerson,x=>({...x,id:x.id||'in-person:'+C.classify(x.title)+':'+x.title,notes:x.bullets,name:x.title,kind:'person'}));
 batch('world-events',input.world?.events,x=>({...x,id:x.id||'source:'+key(x.url||(x.sources||[])[0]?.url)+':'+(x.place||''),name:x.name,kind:x.mode==='in-game'||x.scope==='global'?'event':'person',link:x.url||(x.sources||[])[0]?.url,s:x.start,e:x.end}));
 batch('regional-events',input.regional?.events,x=>({...x,id:x.id||'regional:'+key(x.url||(x.sources||[])[0]?.url)+':'+(x.place||x.name||''),name:x.name||x.t,kind:x.mode==='in-game'||x.scope==='global'?'event':'person',link:x.url||(x.sources||[])[0]?.url}));
 batch('season',input.season?.items,x=>({...x,name:x.name,link:x.url,scope:'worldwide_local',detailIds:x.detailId?[x.detailId]:[]}));
 batch('spotlight',data.spotlight,x=>({id:'sp:'+x.d,name:x.n+' Spotlight Hour',s:x.d+'T18:00',e:x.d+'T19:00',scope:'worldwide_local',bonuses:x.b?[x.b]:[],featured:[{name:x.n,methods:['wild']}]}));
 batch('raidHour',data.raidHour,x=>({id:'rh:'+x.d,name:x.n+' Raid Hour',s:x.d+'T18:00',e:x.d+'T19:00',scope:'worldwide_local',featured:[{name:x.n,methods:['raid']}]}));
 batch('rotation',data.rotation,x=>({...x,id:x.id||'rotation:'+x.s,name:'Raid rotation',scope:'worldwide_local',featured:[...(x.five?[{name:x.five,methods:['raid']}]:[]),...(x.mega?[{name:x.mega,methods:['raid']}]:[])]}));
 batch('maxBattles',data.maxBattles,x=>Array.isArray(x)?{id:'max:'+x[0],name:'Max Battles',s:x[0],e:x[1],featured:typeof x[2]==='string'?[{name:x[2],methods:['max']}]:[]}:({...x,id:x.id||'max:'+x.s,name:x.t||x.name||'Max Battles'}));
 const referenced=new Set([...out.values()].flatMap(e=>e.internalValidation?.detailRefs||[]));
 Object.entries(details).forEach(([id,d])=>{if(!out.has(id)&&!referenced.has(id)&&d.name)add(d.normalizedEvent||{id,name:d.name,lifecycle:d.lifecycle||'reference',detailIds:[id],sources:d.sources},'source-details');});
 const consumed=new Set([...out.values()].flatMap(e=>e.aliases||[]));
 previous.forEach(e=>{if(!out.has(e.eventId)&&!consumed.has(e.eventId))out.set(e.eventId,e);});
 const events=[...out.values()].sort((a,b)=>a.eventId.localeCompare(b.eventId));
 const checked=Catalogue.validate({schemaVersion:1,events}),conflicts=checked.diagnostics.conflicts;
 if(rejections.length||!checked.valid){const diagnostics={rejectedCount:rejections.length+checked.diagnostics.rejectedCount,rejections:rejections.concat(checked.diagnostics.rejections),conflicts};const error=Error('Catalogue validation failed: '+JSON.stringify(diagnostics));error.diagnostics=diagnostics;throw error;}
 return publicValue({schemaVersion:1,species:input.dex||input.previous?.species||[],costumes:costumeRows,events,coverage,excluded:[{collection:'upcoming',reason:'Pokémon release summaries, not independent event instances; existing release views are preserved'},{collection:'regionals',reason:'Geographic Pokémon availability, not event instances'},{collection:'week',reason:'Static week guidance, not event instances'},{collection:'raidNow',reason:'Derived rotation summary, represented by rotation records'},{collection:'pastFests',reason:'Historical reference list, not announced event instances'}],warnings});
}
async function publish(root=path.resolve(__dirname,'../..')){async function read(name,fallback={}){try{return JSON.parse(await fs.readFile(path.join(root,'public',name+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 const [data,details,info,world,regional,season,previous,dex,costumes]=await Promise.all(['data','event-details','event-info','world-events','regional-events','season','events-v1','dex','costumes'].map(n=>read(n)));
 let aliases={};try{aliases=JSON.parse(await fs.readFile(path.join(root,'data/event-aliases.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=buildCatalogue({data,details,info,world,regional,season,previous,dex,costumes,aliases});
 const target=path.join(root,'public/events-v1.json'),temp=target+'.tmp';await fs.writeFile(temp,JSON.stringify(result,null,1)+'\n');await fs.rename(temp,target);return result;
}
module.exports={buildCatalogue,publish,digest};
if(require.main===module)publish().then(result=>console.log('Validated universal catalogue:',result.events.length,'events across',result.coverage.length,'collections')).catch(error=>{console.error(error);process.exitCode=1;});
