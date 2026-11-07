/* Validate the whole read model before replacing a known-good catalogue. Shared by publisher and browser. */
(function(root,factory){var api=factory(typeof module==='object'&&module.exports?require('./event-contract.js'):root.GOEventContract,typeof module==='object'&&module.exports?require('./event-identity.js'):root.GOEventIdentity);if(typeof module==='object'&&module.exports)module.exports=api;else root.GOEventCatalogue=api;}(typeof globalThis!=='undefined'?globalThis:this,function(contract,identity){
 'use strict';
 function validate(snapshot){
  var events=[],rejections=[],conflicts=[];
  if(!snapshot||snapshot.schemaVersion!==1||!Array.isArray(snapshot.events))rejections.push({eventId:null,error:'Invalid v1 catalogue'});
  else if(!snapshot.events.length)rejections.push({eventId:null,error:'Empty public catalogue is not a published snapshot'});
  else snapshot.events.forEach(function(raw){try{events.push(contract.normalize(raw));}catch(error){rejections.push({eventId:raw&&raw.eventId||null,error:error.message});}});
  var index=identity.reconcile(events);conflicts=index.conflicts;
  return {valid:!rejections.length&&!conflicts.length,events:events,index:index,diagnostics:{rejectedCount:rejections.length,rejections:rejections,conflicts:conflicts}};
 }
 function prepare(candidate,previous){
  var next=validate(candidate),old=validate(previous);
  // Published history is retained, including expired/cancelled events. Canonical replacements
  // must keep the former ID as an alias so saved links survive. Never infer deletion by count.
  if(next.valid&&old.valid){
   old.events.forEach(function(event){
    var replacement=next.index.resolve(event.eventId);
    [event.eventId].concat(event.aliases||[]).forEach(function(id){
     var target=next.index.resolve(id);
     if(!target||replacement!==target)next.diagnostics.rejections.push({eventId:event.eventId,error:'Published event identity disappeared or changed target: '+id});
    });
   });
   next.diagnostics.rejectedCount=next.diagnostics.rejections.length;
   next.valid=!next.diagnostics.rejectedCount;
  }
  if(next.valid)return {accepted:true,snapshot:Object.assign({},candidate,{events:next.events}),events:next.events,index:next.index,diagnostics:next.diagnostics};
  var snapshot=old.valid?Object.assign({},previous,{events:old.events}):null;
  return {accepted:false,snapshot:snapshot,events:snapshot?old.events:[],index:snapshot?old.index:identity.reconcile([]),diagnostics:Object.assign({retained:!!snapshot,previousValid:old.valid},next.diagnostics)};
 }
 return {validate:validate,prepare:prepare};
}));
