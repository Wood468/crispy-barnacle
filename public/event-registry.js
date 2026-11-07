/* Read-only catalogue registry. Legacy IDs and saved keys remain unchanged. */
(function(root){
 'use strict';
 var models=[],index=new Map(),catalogueIndex=null,settled=false;
 function find(id){return catalogueIndex&&catalogueIndex.resolve(id)||index.get(String(id))||null;}
 function display(model){
  var range=null,zone;try{zone=root.GOEventClock.viewerZone();range=root.GOEventClock.range(model.schedule,zone);}catch(e){}
  var legacy=model.internalValidation&&model.internalValidation.legacyDates||{},published=!model.schedule&&!!(root.GOEventClock.valid(legacy.start,/(?:Z|[+-]\d{2}:\d{2})$/.test(legacy.start||''))&&root.GOEventClock.valid(legacy.end,/(?:Z|[+-]\d{2}:\d{2})$/.test(legacy.end||''))&&Date.parse(legacy.start)<Date.parse(legacy.end));
  var kinds={'community-day':'cd','raid-day':'raid','raid-hour':'raid','max-battles':'max','spotlight-hour':'spot'};
  return {id:model.eventId,name:model.title,dateText:model.lifecycle==='postponed'?'Postponed · New dates to be announced':model.dateText||'',kind:model.attendance==='in-person'?'person':kinds[model.family]||'event',start:root.GOEventClock.parseDate(range?range.start:published?legacy.start:NaN),end:root.GOEventClock.parseDate(range?range.end:published?legacy.end:NaN),sourceStart:published?legacy.start:'',sourceEnd:published?legacy.end:'',instantKnown:!!range&&model.lifecycle!=='postponed',datesKnown:!!range||published,scope:model.schedule&&model.schedule.timeBasis==='player-local'?'worldwide_local':'',utc:!!(model.schedule&&model.schedule.timeBasis==='instant'),region:typeof model.location==='string'?model.location:'',link:(model.sources.find(function(s){return s.url;})||{}).url||'',img:model.image||'',featured:model.pokemon.map(function(p){return {name:root.GOEventAdapter.collectionName(p)||(p.name+(p.formId?' ('+p.formId+')':'')),costume:!!p.costumeId,label:p.label,formId:p.formId,identity:p};}),notes:model.notes,bonuses:model.bonuses.map(function(b){return typeof b==='string'?b:b.text||b.title||'';}),universalModel:model};
 }
 var diagnostics={rejectedCount:0,rejections:[],conflicts:[]};
 // Public structured data lives separately from player storage and the replaceable PWA shell.
 // Wait for transaction completion: a successful request alone does not guarantee persistence.
 function storedSnapshot(snapshot,write){return new Promise(function(resolve,reject){
  var db=null,done=false,result=null;
  function finish(error){if(done)return;done=true;clearTimeout(timer);if(db)db.close();if(error)reject(error);else resolve(result);}
  var timer=setTimeout(function(){finish(new Error('Catalogue storage timed out'));},3000);
  var request;
  try{if(!root.indexedDB)throw new Error('Catalogue storage unavailable');request=root.indexedDB.open('gofn-event-catalogue-v1',1);}catch(error){finish(error);return;}
  request.onupgradeneeded=function(){request.result.createObjectStore('snapshots');};
  request.onerror=function(){finish(request.error||new Error('Catalogue storage unavailable'));};
  request.onblocked=function(){finish(new Error('Catalogue storage is busy'));};
  request.onsuccess=function(){
   db=request.result;if(done){db.close();return;}
   db.onversionchange=function(){db.close();};
   try{var tx=db.transaction('snapshots',write?'readwrite':'readonly'),store=tx.objectStore('snapshots'),op=write?store.put(snapshot,'current'):store.get('current');
    op.onsuccess=function(){result=write?snapshot:op.result||null;};
    tx.oncomplete=function(){finish();};
    tx.onabort=tx.onerror=function(){finish(tx.error||op.error||new Error('Catalogue storage unavailable'));};
   }catch(error){finish(error);}
  };
 });}
 async function previousSnapshot(){try{return await storedSnapshot(null,false);}catch(error){return null;}}
 async function saveSnapshot(snapshot){try{await storedSnapshot(snapshot,true);}catch(error){diagnostics.cacheUnavailable=true;}}
 var ready=(async function(){
  var previous=await previousSnapshot(),candidate=await root.GOLIB.jsonOrNull('/events-v1.json',{maxAge:600000,init:{cache:'no-cache'}});
  var decision=root.GOEventCatalogue.prepare(candidate,previous);
  diagnostics=decision.diagnostics;
  var data=decision.snapshot||{schemaVersion:1,events:[],species:[],costumes:[]};
  root.GOEventAdapter.configureSpecies(data.species||[]);root.GOEventAdapter.configureCostumes(data.costumes||[]);
  models=decision.events;catalogueIndex=decision.index;
  models.forEach(function(m){if(m.internalValidation&&m.internalValidation.collection==='events')index.set('cur:'+m.eventId,m);});
  if(decision.accepted)await saveSnapshot(data);
  settled=true;document.dispatchEvent(new Event('gofn-catalogue-ready'));return data;
 }()).catch(function(error){diagnostics={rejectedCount:1,rejections:[{eventId:null,error:error.message}],conflicts:[],retained:false};settled=true;document.dispatchEvent(new Event('gofn-catalogue-ready'));return {schemaVersion:1,events:[]};});
 root.GOEventRegistry={ready:ready,find:find,display:display,events:function(){return models.slice();},settled:function(){return settled;},diagnostics:function(){return JSON.parse(JSON.stringify(diagnostics));}};
}(window));
