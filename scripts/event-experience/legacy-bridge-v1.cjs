/* Read-only migration bridge. Legacy artwork is NOT encounter evidence. */
'use strict';
const {normalize}=require('./contract-v1.js');
function text(v){return typeof v==='string'?v.trim():'';}
function migrateLegacyEvent(ev,options={}){
 if(!ev || !text(ev.id) || !text(ev.t)) throw new Error('Legacy event requires id and title');
 const aliases=[ev.id,...(Array.isArray(ev.detailIds)?ev.detailIds:[])];
 const sourceUrl=text(ev.sourceUrl);
 // Legacy times have no offset; preserve them without guessing an IANA zone.
 // A caller must supply an independently verified timeBasis/timeZone.
 const schedule=options.schedule || null;
 const art=Array.isArray(ev.art)?ev.art:[];
 const artRefs=art.map(item=>{
  const a=typeof item==='string'?{n:item}:item;
  if(!a || !text(a.n)) return null;
  return {displayName:text(a.n),costumeUnresolved:!!a.costume,legacyLabel:text(a.label)||null,shinyArtworkFlag:!!a.shiny};
 }).filter(Boolean);
 const raw={
  schemaVersion:1,eventId:text(ev.id),aliases,family:text(options.family)||'other',
  title:text(ev.t),schedule,activities:[],pokemon:[],encounters:[],
  bonuses:Array.isArray(ev.bonuses)?ev.bonuses.slice():[],
  research:[],passes:[],tickets:[],
  sources:sourceUrl?[{url:sourceUrl,label:text(ev.source)||null}]:[]
 };
 const result=normalize(raw);
 // Keep original untouched and retain text/art in internal migration metadata.
 // Never infer verified shiny status, costume ID, or encounter method from art.
 result.legacy={id:ev.id,start:text(ev.s)||null,end:text(ev.e)||null,
  notes:Array.isArray(ev.p)?ev.p.slice():[],artRefs,sourceUrl:sourceUrl||null,
  detailIds:Array.isArray(ev.detailIds)?ev.detailIds.slice():[]};
 return result;
}
module.exports={migrateLegacyEvent};
