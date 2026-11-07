// Publish newly discovered event articles even when no curated event or venue exists yet.
import {isAllowedOgImage} from '../../src/image-policy.js';
import {sourceFor} from './sources.mjs';
import {decode} from './text.mjs';
import {extractEncounters,posterFromHtml,methodForHeading} from './encounters.mjs';
import adapter from '../../public/event-adapter.js';
import contract from '../../public/event-contract.js';
import clock from '../../public/event-clock.js';
function eventObjects(html){const events=[];for(const tag of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const visit=value=>{if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;const types=[].concat(value['@type']||[]);if(types.some(t=>typeof t==='string'&&/Event$/.test(t)))events.push(value);else if(value['@graph'])visit(value['@graph']);};visit(JSON.parse(tag[1]));}catch{/* prose fallback only; malformed machine data is never guessed */}}return events;}
export function announcementFromPage(page,options={}){
 const source=sourceFor(page.url);if(!source||source.id!==page.source||!source.pattern.test(page.url))return null;
 const url=new URL(page.url),title=String(page.title||'').trim(),structured=eventObjects(page.html),event=structured.length===1?structured[0]:null;
 const eventPath=source.id==='leekduck'&&url.pathname.startsWith('/events/')||source.id==='hub'&&url.pathname.startsWith('/post/event/');
 const officialEvent=source.id==='official'&&(contract.classify(title)!=='other'||/\bevent\b/i.test(title)||/<h[1-4][^>]*>\s*(?:Event bonuses|Wild encounters|Raids)\s*</i.test(page.html||''));
 if(!event&&!eventPath&&!officialEvent)return null;
 if(!title||/\b(?:monthly events|event calendar|events (?:in|for)|round.?up)\b/i.test(title))return null;
 const slug=url.pathname.split('/').filter(Boolean).pop(),id=source.id+':'+slug;
 const fields=page.fields||{},extracted=extractEncounters(page.html,options);
 const location=event&&event.location,place=typeof location==='string'?location:location&&typeof location.name==='string'?location.name:null;
 const dateText=(fields.dates||[]).find(text=>typeof text==='string'&&text.length<=180)||'';
 const statusDeclared=!!(event&&typeof event.eventStatus==='string');
 const raw={schemaVersion:1,eventId:id,title:event&&typeof event.name==='string'?event.name:title,dateText:dateText,family:contract.classify(title),lifecycle:event&&/EventCancelled$/.test(event.eventStatus||'')?'cancelled':event&&/EventPostponed$/.test(event.eventStatus||'')?'postponed':'announced',attendance:event&&/OfflineEventAttendanceMode$/.test(event.eventAttendanceMode||'')?'in-person':'',location:place,image:posterFromHtml(page.html,page.url),pokemon:extracted.pokemon,encounters:extracted.encounters,activities:[],bonuses:fields.bonuses||[],research:fields.researchTasks||[],tickets:fields.tickets||[],sources:[{id:source.id,name:source.name,trust:source.trust,url:page.url}],internalValidation:{native:true,lifecycleDeclared:statusDeclared,warnings:[],fields:Object.fromEntries(Object.entries(fields).filter(([k,v])=>Array.isArray(v)&&k!=='researchTasks').map(([k,v])=>[k,v.map(text=>({text}))])),legacyDates:{start:event&&typeof event.startDate==='string'?event.startDate:'',end:event&&typeof event.endDate==='string'?event.endDate:''}}};
 if(event&&event.startDate&&event.endDate){const start=String(event.startDate),end=String(event.endDate),zone=event.eventSchedule&&event.eventSchedule.scheduleTimezone;if(/(?:Z|[+-]\d{2}:\d{2})$/.test(start)&&/(?:Z|[+-]\d{2}:\d{2})$/.test(end))raw.schedule={start,end,timeBasis:'instant'};else if(zone)raw.schedule={start,end,timeBasis:'local',timeZone:zone};}
 if(event&&event.subEvent){
  const roster=new Map(raw.pokemon.map(p=>[p.key,p])),specific=[];
  function children(nodes,parent='main'){
   [].concat(nodes||[]).forEach((node,index)=>{
    if(!node||typeof node!=='object')return;
    const identifier=typeof node.identifier==='string'?node.identifier:typeof node['@id']==='string'?node['@id']:parent+':'+index;
    const activity={id:'activity:'+identifier,parentId:parent,title:typeof node.name==='string'?node.name:'Activity',kind:methodForHeading(node.name||'')||'other'};
    if(/\b(?:rotat(?:ion|ions|ing)|habitats?)\b/i.test(activity.title)||node.additionalType==='rotation')activity.presentation='rotation';
    else if(parent!=='main'&&raw.activities.some(a=>a.id===parent&&a.presentation==='rotation'))activity.presentation='rotation';
    if(node.startDate&&node.endDate){const start=String(node.startDate),end=String(node.endDate);if(/(?:Z|[+-]\d{2}:\d{2})$/.test(start)&&/(?:Z|[+-]\d{2}:\d{2})$/.test(end))activity.schedule={start,end,timeBasis:'instant'};else if(raw.schedule&&raw.schedule.timeBasis==='local')activity.schedule={start,end,timeBasis:'local',timeZone:raw.schedule.timeZone};}
    const sub=extractEncounters(typeof node.description==='string'?node.description:'',options);
    for(const p of sub.pokemon){const prior=roster.get(p.key);roster.set(p.key,prior?{...prior,...p,shiny:p.shiny==='unknown'?prior.shiny:p.shiny}:p);}
    const access=typeof node.isAccessibleForFree==='boolean'?(node.isAccessibleForFree?'free':'paid'):'unknown';
    specific.push(...sub.encounters.map(e=>({...e,activityId:activity.id,access})));
    raw.activities.push(activity);children(node.subEvent,activity.id);
   });
  }
  children(event.subEvent);const scoped=new Set(specific.map(e=>e.identityKey+'|'+e.method));raw.pokemon=[...roster.values()];raw.encounters=raw.encounters.filter(e=>!scoped.has(e.identityKey+'|'+e.method)).concat(specific);
 }
 if(event&&event.description)raw.notes=[decode(String(event.description).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()];
 if(event&&event.image){const image=[].concat(event.image).map(v=>typeof v==='string'?v:v&&v.url).find(v=>typeof v==='string'&&isAllowedOgImage(v));if(image)raw.image=image;}
 if(event&&event.offers)raw.tickets=[].concat(event.offers).filter(o=>o&&typeof o==='object').map(o=>({title:typeof o.name==='string'?o.name:'Ticket',url:typeof o.url==='string'?o.url:null,...(o.price!==undefined&&Number.isFinite(Number(o.price))&&Number(o.price)>=0&&/^[A-Z]{3}$/.test(o.priceCurrency||'')?{price:{amount:Number(o.price),currency:o.priceCurrency}}:{})}));
 const ranks=adapter.passFields(raw.tickets);if(ranks.passes.length){raw.passes=ranks.passes;raw.tickets=ranks.tickets;}
 for(const activity of raw.activities){if(activity.schedule){try{clock.validateSchedule(activity.schedule);}catch(error){raw.internalValidation.warnings.push(activity.id+': '+error.message);activity.schedule=null;}}}
 // Invalid dates do not erase a newly announced event or invent an interval.
 try{return contract.normalize(raw);}catch(error){if(!/schedule|IANA|boundary|offset|local/i.test(error.message))throw error;raw.schedule=null;raw.internalValidation.warnings.push(error.message);return contract.normalize(raw);}
}
