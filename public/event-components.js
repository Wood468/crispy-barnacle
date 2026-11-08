/* Universal event presentation. One family-ordered component system for every source record. */
(function(root,factory){var api=factory(typeof module==='object'&&module.exports?require('./lib.js'):root.GOLIB,typeof module==='object'&&module.exports?require('./event-view.js'):root.GOEventView);if(typeof module==='object'&&module.exports)module.exports=api;else root.GOEventComponents=api;}(typeof globalThis!=='undefined'?globalThis:this,function(L,V){
'use strict';
var esc=L.esc;
var METHODS={wild:'In the wild',raid:'Raid encounters',max:'Max Battles',egg:'Egg hatches',incense:'Incense encounters',research:'Research encounters',lure:'Lure encounters',photobomb:'Snapshot encounters',other:'Featured Pokémon'};
function value(row){if(typeof row==='string')return row;var v=row&&(row.text||row.title||row.name||row.task||row.label);return typeof v==='string'?v:'';}
function section(id,title,html){return html?'<section class="ue-section" id="'+esc(id)+'"><h3 class="sec2">'+esc(title)+'</h3>'+html+'</section>':'';}
function rows(items){return '<ul class="ue-facts">'+items.filter(function(x){return value(x);}).map(function(x){return '<li>'+esc(value(x))+'</li>';}).join('')+'</ul>';}
function gallery(model,ctx){var byKey={};model.pokemon.forEach(function(p){byKey[p.key]=p;});return Object.keys(METHODS).map(function(method){var edges=model.groups[method]||[],seen=new Set();var cards=edges.map(function(edge){var p=byKey[edge.identityKey];if(!p)return '';var activity=model.activities.find(function(a){return a.id===edge.activityId;}),activityLabel=activity&&(activity.title||activity.name);var k=p.key+'|'+edge.activityId+'|'+(edge.access&&edge.access!=='all'&&edge.access!=='unknown'?edge.access:'');if(seen.has(k))return '';seen.add(k);var name=ctx.nameFor?ctx.nameFor(p):p.name||p.speciesId,label=p.label,collection=p.collectionName||name;if(p.costumeId&&label&&collection.toLowerCase().indexOf(label.toLowerCase())<0)collection+=' ('+label+')';var shinyConflict=(model.internalValidation&&model.internalValidation.conflicts||[]).some(function(c){return c.field==='shiny'&&c.identityKey===p.key;});var tag=p.shiny==='yes'&&!shinyConflict?'<span class="ue-signal ue-shiny">Shiny available</span>':'';if(p.boostedShiny&&!shinyConflict)tag+='<span class="ue-signal ue-shiny">Boosted shiny chance</span>';if(p.debut)tag+='<span class="ue-signal">Debut</span>';if(edge.access&&edge.access!=='all'&&edge.access!=='unknown')tag+='<span class="ue-signal">'+esc(edge.access)+'</span>';return '<article class="ue-mon evd-f" data-identity="'+esc(p.key)+'"><div class="ue-mon-art">'+(ctx.artFor?ctx.artFor(p):ctx.art?ctx.art({n:name,costume:!!p.costumeId,label:label,asset:p.assetKey},'ea'):'')+'</div><div class="evd-fm"><b>'+esc(name)+'</b>'+(p.costumeId&&label?'<small>'+esc(label)+'</small>':'')+(activityLabel?'<small>'+esc(activityLabel)+'</small>':'')+(activity&&activity.schedule?'<small>'+esc(activityTime(activity,ctx))+'</small>':'')+(activityPlace(activity)?'<small>'+esc(activityPlace(activity))+'</small>':'')+(tag?'<div class="ue-signals">'+tag+'</div>':'')+'</div></article>';}).join('');return cards?'<div class="ue-method" data-method="'+method+'">'+(method==='other'&&Object.keys(model.groups).every(function(k){return k==='other'||!model.groups[k].length;})?'':'<h4>'+METHODS[method]+'</h4>')+'<div class="ue-gallery evd-feat">'+cards+'</div></div>':'';}).join('');}
function reward(item,ctx){
 if(typeof item==='string')return '<div class="research-reward"><span class="ue-reward-art"><span class="ue-reward-icon" aria-hidden="true">★</span></span><span><b>'+esc(item)+'</b></span></div>';
 if(!item||typeof item.name!=='string')return '';
 var quantity=Number.isInteger(item.quantity)&&item.quantity>1?esc(item.quantity)+'× ':'';
 var cp=Number.isInteger(item.cpMin)&&Number.isInteger(item.cpMax)&&item.cpMin<=item.cpMax?'<small>CP '+esc(item.cpMin)+'–'+esc(item.cpMax)+'</small>':item.type==='encounter'&&Number.isInteger(item.level)?'<small>Level '+esc(item.level)+'</small>':'';
 var artwork=item.type==='encounter'&&ctx.rewardArt?ctx.rewardArt(item):'';
 var fallback='<span class="ue-reward-icon" aria-hidden="true">'+(item.type==='encounter'?'?':item.type==='item'?'◆':'★')+'</span>';
 var icon='<span class="ue-reward-art">'+(artwork||fallback)+'</span>';
 return '<div class="research-reward">'+icon+'<span><b>'+quantity+esc(item.name)+'</b>'+cp+'</span></div>';
}
function research(items,ctx){return items.filter(function(r){return value(r);}).map(function(r){return '<article class="research-task"><h4>'+esc(value(r))+'</h4>'+(r.access&&r.access!=='unknown'?'<p>'+esc(r.access)+'</p>':'')+(Array.isArray(r.rewards)?'<div class="research-rewards">'+r.rewards.map(function(x){return reward(x,ctx);}).join('')+'</div>':'')+'</article>';}).join('');}
function passes(items,ctx){
 function stage(s){return '<li><b>Rank '+esc(s.rank)+'</b>'+(Number.isFinite(s.points)?'<small>'+esc(s.points)+' points</small>':'')+(s.free?'<div><h5>Free</h5>'+[].concat(s.free).map(function(x){return reward(x,ctx);}).join('')+'</div>':'')+(s.deluxe?'<div><h5>Deluxe</h5>'+[].concat(s.deluxe).map(function(x){return reward(x,ctx);}).join('')+'</div>':'')+(Array.isArray(s.rewards)?s.rewards.map(function(x){return reward(x,ctx);}).join(''):'')+'</li>';}
 return items.filter(function(p){return value(p);}).map(function(p){
  var stages=(Array.isArray(p.stages)?p.stages:[]).filter(function(s){return s&&Number.isInteger(s.rank)&&s.rank>=0;}).slice().sort(function(a,b){return a.rank-b.rank;});
  var content='';
  if(stages.length<=12)content='<ol class="ue-pass-stages">'+stages.map(stage).join('')+'</ol>';
  else{
   var groups={};stages.forEach(function(s){var key=Math.floor(Math.max(0,s.rank-1)/25);(groups[key]||(groups[key]=[])).push(s);});
   content='<p class="ue-pass-count">'+stages.length+' reward ranks · Expand a range to compare rewards.</p>'+Object.keys(groups).map(function(key){var list=groups[key];return '<details class="ue-pass-range"><summary>'+(list.length===1?'Rank '+esc(list[0].rank):'Ranks '+esc(list[0].rank)+'–'+esc(list[list.length-1].rank))+'</summary><ol class="ue-pass-stages">'+list.map(stage).join('')+'</ol></details>';}).join('');
  }
  return '<article class="ue-pass"><h4>'+esc(value(p))+'</h4>'+((p.text&&p.text!==value(p))?'<p>'+esc(p.text)+'</p>':'')+content+'</article>';
 }).join('');
}
function tickets(items,ctx){return items.filter(function(t){return value(t);}).map(function(t){var price='';if(t.price&&Number.isFinite(t.price.amount)&&/^[A-Z]{3}$/.test(t.price.currency))try{price=new Intl.NumberFormat('en-AU',{style:'currency',currency:t.price.currency,currencyDisplay:'code'}).format(t.price.amount);}catch(e){}var url=ctx.safe&&ctx.safe(t.url);return '<article class="ue-ticket"><h4>'+esc(value(t))+'</h4>'+(t.access?'<p>'+esc(t.access)+'</p>':'')+(price?'<b>'+esc(price)+'</b>':'')+(url?'<a class="pill" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">View ticket</a>':'')+'</article>';}).join('');}
function activityTime(a,ctx){
 if(!a||!a.schedule)return '';
 try{var zone=ctx.viewerZone||ctx.clock.viewerZone(),range=ctx.clock.range(a.schedule,zone),format=new Intl.DateTimeFormat('en-AU',{timeZone:zone,weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'});return format.format(new Date(range.start))+' – '+format.format(new Date(range.end))+(a.schedule.timeBasis==='player-local'?' · local time wherever you play':' · your time');}catch(error){return 'Time needs confirmation in your selected time zone.';}
}
function activityPlace(a){var place=a&&(a.location||a.region);return typeof place==='string'?place:place&&typeof place.name==='string'?place.name:'';}
function scheduledActivities(model,ctx,presentation){return model.activities.filter(function(a){return a.schedule&&a.presentation===presentation;}).map(function(a){return '<article class="'+(presentation==='rotation'?'ue-rotation':'ue-activity-window')+'" data-activity="'+esc(a.id)+'"><h4>'+esc(a.title||a.name||'Activity')+'</h4><p>'+esc(activityTime(a,ctx))+'</p>'+(activityPlace(a)?'<small>'+esc(activityPlace(a))+'</small>':'')+(a.access&&a.access!=='unknown'&&a.access!=='all'?'<small>'+esc(a.access)+'</small>':'')+'</article>';}).join('');}
function render(model,ctx){ctx=ctx||{};var view=V.project(model),fields=model.internalValidation&&model.internalValidation.fields||{},body={};
 var galleryOnly=model.encounters.every(function(e){return e.method==='other';});
 body.encounters=section('evd-pokemon',galleryOnly?'Featured Pokémon':'Pokémon',gallery(model,ctx));
 if(!model.bonuses.length&&!ctx.moves)body.encounters=body.encounters.replace('<h3 class="sec2">','<h3 class="sec2" id="evd-highlights">');
 body.bonuses=section('evd-highlights','Event bonuses','<div class="ue-bonuses">'+model.bonuses.filter(function(b){var t=value(b);return t&&!(model.internalValidation&&model.internalValidation.conflicts||[]).some(function(c){return c.a&&c.a.text===t||c.b&&c.b.text===t;});}).map(function(b){return '<div class="ue-bonus">'+(ctx.bonus?ctx.bonus(value(b)):esc(value(b)))+'</div>';}).join('')+'</div>');if(!body.bonuses.includes('class="ue-bonus"'))body.bonuses='';
 body.rotations=section('evd-rotations','Rotations',scheduledActivities(model,ctx,'rotation'));
 body.schedule=section('evd-schedule','Event schedule',scheduledActivities(model,ctx,'schedule'));
 body.research=(ctx.research||section('evd-research-title','Research',research(model.research,ctx)))+section('evd-research-windows','Research availability',scheduledActivities(model,ctx,'research'));
 if(!ctx.research&&!model.research.length&&body.research)body.research=body.research.replace('evd-research-windows','evd-research-title');
 body.passes=ctx.passes||section('evd-pass','GO Pass',passes(model.passes,ctx));
 body.tickets=(ctx.tickets||section('evd-tickets','Tickets & access',tickets(model.tickets,ctx)))+section('evd-ticket-windows','Ticket availability',scheduledActivities(model,ctx,'ticket'));
 if(!ctx.tickets&&!model.tickets.length&&body.tickets)body.tickets=body.tickets.replace('evd-ticket-windows','evd-tickets');
 var conflicts=model.internalValidation&&model.internalValidation.conflicts||[],excluded=new Set();conflicts.forEach(function(c){if(c.a&&c.a.text)excluded.add(c.a.text);if(c.b&&c.b.text)excluded.add(c.b.text);});
 var known=new Set(model.bonuses.map(value)),info=[];(model.notes||[]).forEach(function(n){if(!excluded.has(n)&&!known.has(n)){known.add(n);info.push(n);}});
 (model.internalValidation&&model.internalValidation.info||[]).filter(function(r){return r.status==='published';}).forEach(function(r){if(r.text&&!excluded.has(r.text)&&!known.has(r.text)){known.add(r.text);info.push(r.text);}});
 Object.keys(fields).filter(function(k){return ['bonuses','tickets','research'].indexOf(k)<0;}).forEach(function(k){(fields[k]||[]).forEach(function(r){if(r.text&&!excluded.has(r.text)&&!known.has(r.text)){known.add(r.text);info.push(r.text);}});});
 var detail=info.length?'<details class="ue-guide"><summary>Read the event guide</summary>'+rows(info)+'</details>':'';
 var selected=(view.order||view.sections.map(function(s){return s.key;})).filter(function(key){return key!=='overview'&&body[key];});
 var nav=selected.map(function(key){return {key:key,label:{encounters:'Pokémon',bonuses:'Bonuses',rotations:'Rotations',schedule:'Schedule',research:'Research',passes:'GO Pass',tickets:'Tickets'}[key]};}).map(function(s){var id={encounters:(!model.bonuses.length&&!ctx.moves?'evd-highlights':'evd-pokemon'),bonuses:'evd-highlights',rotations:'evd-rotations',schedule:'evd-schedule',research:'evd-research-title',passes:'evd-pass',tickets:'evd-tickets'}[s.key];return '<a href="#'+id+'">'+esc(s.label)+'</a>';}).join('');
 if(ctx.moves&&!model.bonuses.length)nav+='<a href="#evd-highlights">Moves</a>';
 if(ctx.locations)nav+='<a href="#evd-locations">Locations</a>';
 var content=selected.map(function(key){return body[key];}).join('');
 // Supplemental published legacy panels are reusable components too; none are selected by event ID.
 
 
 
 var warnings=model.internalValidation&&model.internalValidation.conflicts||[];
 var conflict=warnings.some(function(c){return c.impact==='planning-critical';})?'<p class="srcdis" role="status">Some event details conflict. Check Sources & updates before making plans.</p>':'';
 var cancelled=model.lifecycle==='cancelled'?'<p class="srcdis" role="status">Event cancelled</p>':'';
 var hero='<header class="evd-hero ue-hero"><div class="ue-hero-media">'+(ctx.banner||'')+'<div class="evd-art">'+(ctx.heroArt||'')+'</div></div><div class="ue-hero-copy"><h2 id="evd-t">'+esc(model.title)+'</h2><span class="ue-family">'+esc(view.family==='other'?'Event':view.family.replace(/-/g,' '))+'</span>'+(model.location?'<p class="ue-location">'+esc(typeof model.location==='string'?model.location:model.location.name||'')+'</p>':'')+'<p class="evc-when">'+esc(ctx.when||'Dates to be announced')+'</p>'+(ctx.countdown?'<p class="cdn evd-cd">'+esc(ctx.countdown)+'</p>':'')+'</div></header>';
 var more=section('evd-information','Details',detail+(ctx.moves||'')+(ctx.locations||''));
 var sources=ctx.sources||'';
 if(!sources){
  var links=model.sources.filter(function(s){try{var u=new URL(s.url);return u.protocol==='https:'&&!u.username&&!u.password&&!L.isPrivateLink(s.url);}catch(error){return false;}}).map(function(s){return '<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name||'Event source')+'</a></li>';}).join('');
  if(links)sources='<details class="ue-sources" id="evd-sources"><summary>Sources &amp; updates</summary><ul>'+links+'</ul></details>';
 }
 var hasSources=/\bid=["']evd-sources["']/.test(sources);
 var jumps=nav+(more?'<a href="#evd-information">Details</a>':'')+(hasSources?'<a href="#evd-sources">Sources</a>':'');
 return (ctx.toolbar||'')+hero+cancelled+conflict+(jumps?'<nav class="evd-jump" aria-label="Jump to event details">'+jumps+'</nav>':'')+(ctx.actions||'')+content+more+sources;
}
return {render:render,gallery:gallery,rotations:function(model,ctx){return scheduledActivities(model,ctx,'rotation');}};
}));
