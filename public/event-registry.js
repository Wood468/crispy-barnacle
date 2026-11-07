/* Read-only catalogue registry. Legacy IDs and saved keys remain unchanged. */
(function(root){
 'use strict';
 var models=[],index=new Map(),catalogueIndex=null,settled=false;
 function find(id){return catalogueIndex&&catalogueIndex.resolve(id)||index.get(String(id))||null;}
 function display(model){
  var range=null,zone;try{zone=Intl.DateTimeFormat().resolvedOptions().timeZone;range=root.GOEventClock.range(model.schedule,zone);}catch(e){}
  var legacy=model.internalValidation&&model.internalValidation.legacyDates||{},published=!!(root.GOEventClock.valid(legacy.start,/(?:Z|[+-]\d{2}:\d{2})$/.test(legacy.start||''))&&root.GOEventClock.valid(legacy.end,/(?:Z|[+-]\d{2}:\d{2})$/.test(legacy.end||''))&&Date.parse(legacy.start)<Date.parse(legacy.end));
  var kinds={'community-day':'cd','raid-day':'raid','raid-hour':'raid','max-battles':'max','spotlight-hour':'spot'};
  return {id:model.eventId,name:model.title,dateText:model.lifecycle==='postponed'?'Postponed · New dates to be announced':model.dateText||'',kind:model.attendance==='in-person'?'person':kinds[model.family]||'event',start:new Date(range?range.start:published?legacy.start:NaN),end:new Date(range?range.end:published?legacy.end:NaN),sourceStart:published?legacy.start:'',sourceEnd:published?legacy.end:'',instantKnown:!!range&&model.lifecycle!=='postponed',datesKnown:!!range||published,scope:model.schedule&&model.schedule.timeBasis==='player-local'?'worldwide_local':'',utc:!!(model.schedule&&model.schedule.timeBasis==='instant'),region:typeof model.location==='string'?model.location:'',link:(model.sources.find(function(s){return s.url;})||{}).url||'',img:model.image||'',featured:model.pokemon.map(function(p){return {name:root.GOEventAdapter.collectionName(p)||(p.name+(p.formId?' ('+p.formId+')':'')),costume:!!p.costumeId,label:p.label,formId:p.formId,identity:p};}),notes:model.notes,bonuses:model.bonuses.map(function(b){return typeof b==='string'?b:b.text||b.title||'';}),universalModel:model};
 }
 var ready=root.GOLIB.jsonOrNull('/events-v1.json',{maxAge:600000,init:{cache:'no-cache'}}).then(function(data){
  if(data&&data.schemaVersion===1){root.GOEventAdapter.configureSpecies(data.species||[]);root.GOEventAdapter.configureCostumes(data.costumes||[]);models=(data.events||[]).map(function(e){try{return root.GOEventContract.normalize(e);}catch(error){return null;}}).filter(Boolean);catalogueIndex=root.GOEventIdentity.reconcile(models);models.forEach(function(m){if(m.internalValidation&&m.internalValidation.collection==='events')index.set('cur:'+m.eventId,m);});}
  settled=true;document.dispatchEvent(new Event('gofn-catalogue-ready'));return data||{schemaVersion:1,events:[]};
 }).catch(function(){settled=true;return {schemaVersion:1,events:[]};});
 root.GOEventRegistry={ready:ready,find:find,display:display,events:function(){return models.slice();},settled:function(){return settled;}};
}(window));
