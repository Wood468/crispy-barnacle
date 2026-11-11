/* Source-verified hourly habitat and day-specific Mighty Pokémon display.
   Reusable across future events: this module does not branch on event IDs,
   edit source/Collection records, infer shiny rates, or add follow controls. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GOEventEncounterRotations=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function esc(raw){return String(raw==null?'':raw).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function norm(v){return String(v||'').trim().replace(/\s+/g,' ').toLowerCase();}
function isDay(v){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;
 var date=new Date(v+'T12:00:00Z');
 return Number.isFinite(+date)&&date.toISOString().slice(0,10)===v;
}
function isIanaZone(zone){
 if(typeof zone!=='string'||!zone.trim())return false;
 try{new Intl.DateTimeFormat('en',{timeZone:zone});return true;}catch(error){return false;}
}
function isTime(v){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(v||''));}
function clockMinutes(value){return Number(value.slice(0,2))*60+Number(value.slice(3,5));}
function validate(entry){
 var errors=[];
 if(!entry||typeof entry!=='object')return ['An event rotation must be an object'];
 if(!entry.id||!Array.isArray(entry.eventIds)||!entry.eventIds.length)errors.push('A stable id and eventIds are required');
 if(!Array.isArray(entry.dates)||!entry.dates.length||entry.dates.some(function(d){return !isDay(d);}))errors.push('Explicit ISO local event dates are required');
 if(entry.timeBasis!=='player-local'&&entry.timeBasis!=='venue-local')errors.push('timeBasis must be player-local or venue-local');
 if(entry.timeBasis==='venue-local'&&!isIanaZone(entry.timeZone))errors.push('venue-local events must identify a valid IANA timezone');
 var seen={};
 (entry.habitats||[]).forEach(function(h){
  if(!h.id||!h.label||!Array.isArray(h.pokemon)||!h.pokemon.length)errors.push('Habitat needs id, label, and Pokémon');
  if(!Number.isInteger(h.durationMinutes)||h.durationMinutes<1||h.durationMinutes>1440)errors.push('Invalid habitat duration');
  if(!Array.isArray(h.startHours)||!h.startHours.length)errors.push('Habitat startHours required');
  (h.startHours||[]).forEach(function(hour){
   if(!Number.isInteger(hour)||hour<0||hour>23||hour*60+h.durationMinutes>1440)errors.push('Habitat starts outside a local calendar day');
   else for(var m=hour*60;m<hour*60+h.durationMinutes;m++){
    if(seen[m]&&seen[m]!==h.id)errors.push('Conflicting habitat minutes: '+h.id+' and '+seen[m]);
    seen[m]=h.id;
   }
  });
  if(new Set((h.pokemon||[]).map(norm)).size!==(h.pokemon||[]).length)errors.push('Duplicate Pokémon in habitat '+h.id);
 });
 if(!(entry.habitats||[]).length&&!(entry.mightyDays||[]).length&&!(entry.mightyShared||[]).length)errors.push('At least one dated Mighty lineup, shared Mighty group, or hourly habitat required');
 (entry.mightyDays||[]).forEach(function(day){
  if(!isDay(day.date)||!(entry.dates||[]).includes(day.date))errors.push('Mighty date not in event days');
  if(!Array.isArray(day.pokemon)||!day.pokemon.length)errors.push('Mighty day has no Pokémon');
  if(day.method!=='wild')errors.push('Mighty lineup needs an explicit wild encounter method');
  if(new Set((day.pokemon||[]).map(norm)).size!==(day.pokemon||[]).length)errors.push('Duplicate Mighty Pokémon on '+day.date);
 });
 (entry.mightyShared||[]).forEach(function(group){
  if(!group.id||!group.title||!Array.isArray(group.pokemon)||!group.pokemon.length)errors.push('Shared Mighty group needs id, title and Pokémon');
  if(!['incense','wild','route'].includes(group.method)||!group.access)errors.push('Shared Mighty method and access required');
  if(!Array.isArray(group.dates)||!group.dates.length||group.dates.some(function(d){return !(entry.dates||[]).includes(d);}))errors.push('Shared Mighty published event dates required');
  if(new Set((group.pokemon||[]).map(norm)).size!==(group.pokemon||[]).length)errors.push('Duplicate shared Mighty Pokémon');
 });
 if((entry.habitats||[]).length&&(!entry.activeWindow||!isTime(entry.activeWindow.start)||!isTime(entry.activeWindow.end)||clockMinutes(entry.activeWindow.start)>=clockMinutes(entry.activeWindow.end)))errors.push('Invalid local habitat active window');
 if(!Array.isArray(entry.sources)||!entry.sources.length||entry.sources.some(function(s){return !s.name||!/^https:\/\/[^/@?#]+(?:\/|$)/i.test(s.url||'');}))errors.push('Source URLs must be HTTPS');
 return Array.from(new Set(errors));
}
function find(document,event){
 var entries=Array.isArray(document)?document:(document&&document.entries)||[];
 var ids=Array.isArray(event)?event:(typeof event==='string'?[event]:[event&&event.id,event&&event.eventId].concat(event&&event.aliases||[],event&&event.detailIds||[]));
 var keys=new Set(ids.filter(Boolean).map(norm));
 return entries.find(function(item){return (item.eventIds||[]).some(function(id){return keys.has(norm(id));});})||null;
}
function wall(now,zone){
 var d=now instanceof Date?now:new Date(now==null?Date.now():now);
 if(!Number.isFinite(+d))return null;
 if(!zone){
  return {date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),minute:d.getHours()*60+d.getMinutes()};
 }
 try{
  var parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  var o={};parts.forEach(function(p){if(p.type!=='literal')o[p.type]=p.value;});
  return {date:o.year+'-'+o.month+'-'+o.day,minute:Number(o.hour)*60+Number(o.minute)};
 }catch(error){return null;}
}
function active(entry,options){
 options=options||{};
 var zone=entry.timeBasis==='venue-local'?entry.timeZone:options.viewerZone||'';
 var p=wall(options.now,zone);
 if(!p||(entry.dates||[]).indexOf(p.date)<0)return {date:p&&p.date||null,habitat:null};
 var h=(entry.habitats||[]).find(function(group){
  return (group.startHours||[]).some(function(hour){return p.minute>=hour*60&&p.minute<hour*60+group.durationMinutes;});
 });
 return {date:p.date,habitat:h?h.id:null};
}
function slots(h){
 return (h.startHours||[]).map(function(hour){
  var a=hour*60,b=a+h.durationMinutes;
  function fmt(min){var hh=Math.floor(min/60),amp=hh>=12?'pm':'am';return ((hh%12)||12)+':'+String(min%60).padStart(2,'0')+amp;}
  return fmt(a)+'–'+fmt(b);
 });
}
function dayLabel(iso){
 return new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'}).format(new Date(iso+'T12:00:00Z'));
}
function pokemonCards(names,ctx,prefix){
 return '<div class="uer-pokemon">'+(names||[]).map(function(name){
  var art=ctx.art?ctx.art({n:name},'sm'):'';
  return '<div class="uer-pokemon-tile" data-pokemon="'+esc(name)+'"><span class="uer-pokemon-art">'+art+'</span><span class="uer-pokemon-name">'+esc(name)+'</span></div>';
 }).join('')+'</div>';
}
function render(entry,ctx){
 ctx=ctx||{};
 if(!entry||validate(entry).length)return '';
 var now=active(entry,ctx),html='';
 if((entry.habitats||[]).length){
 html+='<section class="uer-section uer-habitats" aria-label="Rotating wild habitats"><h3>Wild Pokémon by hour</h3>';
 html+='<p class="uer-intro">'+esc(entry.display&&entry.display.habitatsSummary||'Wild Pokémon alternate between the following habitats.')+'</p>';
 html+='<div class="uer-habitat-grid">';
 (entry.habitats||[]).forEach(function(h){
  var live=now.habitat===h.id;
  html+='<article class="uer-habitat uer-habitat-'+esc(h.type||h.id)+'" data-habitat="'+esc(h.id)+'"'+(live?' data-active="true"':'')+'>';
  html+='<h4>'+esc(h.label)+(live?' <span class="uer-live">Active now</span>':'')+'</h4>';
  html+='<p class="uer-hours">'+esc(slots(h).join(' · '))+'</p>';
  html+=pokemonCards(h.pokemon,ctx);html+='</article>';
 });
 html+='</div></section>';
 }
 if((entry.mightyDays||[]).length||(entry.mightyShared||[]).length){
 html+='<section class="uer-section uer-mighty" aria-label="Mighty Pokémon by day"><h3>Mighty Pokémon by day</h3>';
 html+='<p class="uer-intro">'+esc(entry.display&&entry.display.mightySummary||'Mighty Pokémon have a separate day-specific lineup.')+'</p>';
 html+='<div class="uer-day-grid">';
 (entry.mightyDays||[]).forEach(function(day){
  var today=now.date===day.date;
  html+='<article class="uer-mighty-day" data-mighty-date="'+esc(day.date)+'"'+(today?' data-current-day="true"':'')+'>';
  html+='<h4>'+esc(dayLabel(day.date))+(today?' <span class="uer-live">Today</span>':'')+'</h4>';
  html+=pokemonCards(day.pokemon,ctx);html+='</article>';
 });
 html+='</div>';
 (entry.mightyShared||[]).forEach(function(group){
  html+='<article class="uer-mighty-shared" data-shared-id="'+esc(group.id)+'"><h4>'+esc(group.title)+'</h4>';
  html+='<p class="uer-hours">Available '+esc((group.dates||[]).map(dayLabel).join(' and '))+'</p>';
  html+=pokemonCards(group.pokemon,ctx);
  html+='</article>';
 });
 html+='</section>';
 }
 var sources=(entry.sources||[]).filter(function(s){return /^https:\/\/[^/@?#]+(?:\/|$)/i.test(s.url||'');});
 if(sources.length)html+='<p class="uer-sources">Sources: '+sources.map(function(s){return '<a href="'+esc(s.url)+'" rel="noopener noreferrer" target="_blank">'+esc(s.name)+'</a>';}).join(' · ')+'</p>';
 return '<div class="uer-root" data-rotation-id="'+esc(entry.id)+'">'+html+'</div>';
}
/* Source-format ownership remains unchanged. Only hide *duplicate flat
   display edges* when exact sourced habitat/Mighty groups supersede them.
   Ticket-labelled Incense, raid, egg and research edges are preserved. */
function withoutDuplicateFlatEncounters(model,entry){
 if(!model||!entry)return model;
 var wild=new Set(),mighty=new Set(),shared=new Set();
 (entry.habitats||[]).forEach(function(h){(h.pokemon||[]).forEach(function(n){wild.add(norm(n));});});
 (entry.mightyDays||[]).forEach(function(d){(d.pokemon||[]).forEach(function(n){mighty.add(norm(n));});});
 (entry.mightyShared||[]).forEach(function(d){(d.pokemon||[]).forEach(function(n){shared.add(norm(n));});});
 var byKey={};(model.pokemon||[]).forEach(function(p){byKey[p.key]=norm(p.name);});
 function keep(e){
  var name=byKey[e.identityKey];
  if(!name)return true;
  if(e.method==='incense'&&shared.has(name))return false;
  var access=norm(e.access);
  if(access&&access!=='unknown'&&access!=='all')return true;
  return !((e.method==='wild'&&wild.has(name))||((e.method==='incense'||e.method==='wild')&&mighty.has(name)));
 }
 var out=Object.assign({},model,{encounters:(model.encounters||[]).filter(keep)});
 if(model.groups){
  var groups={};Object.keys(model.groups).forEach(function(k){groups[k]=(model.groups[k]||[]).filter(keep);});out.groups=groups;
 }
 return out;
}
return {validate:validate,find:find,active:active,slots:slots,render:render,withoutDuplicateFlatEncounters:withoutDuplicateFlatEncounters};
}));