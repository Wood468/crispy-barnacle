/* Canonical event ID reconciliation. Pure; never merges by title alone. */
'use strict';
function clean(v){return typeof v==='string'?v.trim():'';}
function reconcile(events){
 if(!Array.isArray(events)) throw Error('Expected event array');
 const byId=new Map(), aliasToId=new Map(), conflicts=[];
 events.forEach(ev=>{
  const id=clean(ev&&ev.eventId);
  if(!id) throw Error('Missing canonical eventId');
  if(byId.has(id)){conflicts.push({type:'duplicate-canonical',id});return;}
  byId.set(id,ev);
 });
 events.forEach(ev=>{
  const id=clean(ev&&ev.eventId);
  if(!id||byId.get(id)!==ev)return;
  const aliases=new Set([id,...(Array.isArray(ev.aliases)?ev.aliases:[])].map(clean).filter(Boolean));
  aliases.forEach(alias=>{
   const existing=aliasToId.get(alias);
   if((existing&&existing!==id)||(byId.has(alias)&&alias!==id))conflicts.push({type:'alias-collision',alias,ids:[existing||alias,id].sort()});
   else aliasToId.set(alias,id);
  });
 });
 // An alias collision invalidates that alias rather than silently choosing a winner.
 conflicts.filter(c=>c.type==='alias-collision').forEach(c=>{if(byId.has(c.alias))aliasToId.set(c.alias,c.alias);else aliasToId.delete(c.alias);});
 return {resolve(alias){const id=aliasToId.get(clean(alias));return id?byId.get(id)||null:null;},
  conflicts, canonicalCount:byId.size, aliasCount:aliasToId.size};
}
module.exports={reconcile};
