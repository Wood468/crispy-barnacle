/* Universal event presentation. One family-ordered component system for every source record. */
(function(root,factory){var api=factory(typeof module==='object'&&module.exports?require('./lib.js'):root.GOLIB,typeof module==='object'&&module.exports?require('./event-view.js'):root.GOEventView);if(typeof module==='object'&&module.exports)module.exports=api;else root.GOEventComponents=api;}(typeof globalThis!=='undefined'?globalThis:this,function(L,V){
'use strict';
var esc=L.esc;
var METHODS={wild:'In the wild',raid:'Raid encounters',max:'Max Battles',egg:'Egg hatches',incense:'Incense encounters',research:'Research encounters',lure:'Lure encounters',photobomb:'Snapshot encounters',other:'Featured Pokémon'};
function value(row){if(typeof row==='string')return row;var v=row&&(row.text||row.title||row.name||row.task||row.label);return typeof v==='string'?v:'';}
function section(id,title,html){return html?'<section class="ue-section" id="'+esc(id)+'"><h3 class="sec2">'+esc(title)+'</h3>'+html+'</section>':'';}
function rows(items){return '<ul class="ue-facts">'+items.filter(function(x){return value(x);}).map(function(x){return '<li>'+esc(value(x))+'</li>';}).join('')+'</ul>';}
function gallery(model,ctx){
 var featOnce=false,byKey={};model.pokemon.forEach(function(p){byKey[p.key]=p;});
 return Object.keys(METHODS).map(function(method){
  var seen=new Set(),cards=(model.groups[method]||[]).map(function(edge){
   var p=byKey[edge.identityKey];if(!p)return '';
   var activity=model.activities.find(function(a){return a.id===edge.activityId;}),activityLabel=activity&&(activity.title||activity.name);
   var key=p.key+'|'+edge.activityId+'|'+(edge.access&&edge.access!=='all'&&edge.access!=='unknown'?edge.access:'');
   if(seen.has(key))return '';seen.add(key);
   var name=ctx.nameFor?ctx.nameFor(p):p.name||p.speciesId,label=p.label;
   var conflict=(model.internalValidation&&model.internalValidation.conflicts||[]).some(function(c){return c.field==='shiny'&&c.identityKey===p.key;});
   var signals=[];
   if(p.shiny==='yes'&&!conflict)signals.push('<span class="ue-signal ue-shiny">Shiny</span>');
   if(p.boostedShiny&&!conflict)signals.push('<span class="ue-signal ue-shiny">Boosted shiny</span>');
   if(p.debut)signals.push('<span class="ue-signal">Debut</span>');
   if(edge.access&&edge.access!=='all'&&edge.access!=='unknown')signals.push('<span class="ue-signal">'+esc(edge.access)+'</span>');
   var art=ctx.artFor?ctx.artFor(p):ctx.art?ctx.art({n:name,costume:!!p.costumeId,label:label,asset:p.assetKey},'ea'):'';
   var meta=[p.costumeId&&label?label:'',activityLabel,activity&&activity.schedule?activityTime(activity,ctx):'',activityPlace(activity)].filter(Boolean);
   var kind=ctx.artKind?ctx.artKind(p):'',stars=method==='raid'?((/(\d)-star/i.exec(model.title||'')||[])[1]||''):'',km=method==='egg'?((/(\d{1,2})\s?km/i.exec([activityLabel,p.label,edge.access].join(' '))||[])[1]||''):'';
   var badge='<span class="ue-badge ue-b-'+method+(km?' ue-km-'+km:'')+'">'+(km?km+' km':method==='egg'?'Egg':method==='raid'&&stars?stars+'★ Raid':({wild:'Wild',raid:'Raid',max:'Max',incense:'Incense',research:'Research',lure:'Lure',photobomb:'Snapshot',other:'Featured'})[method])+'</span>';
   var short=({wild:'Wild',raid:'Raid',max:'Max Battle',egg:'Egg',incense:'Incense',research:'Research',lure:'Lure',photobomb:'Snapshot',other:'Featured'})[method];var info={name:name,method:short,badge:km?km+' km egg':stars?stars+'-star raid':'',meta:meta,signals:signals.map(function(x){return x.replace(/<[^>]+>/g,'');}),form:kind};
   var feat=!!(p.debut||p.boostedShiny),tag=feat&&!featOnce;if(tag)featOnce=true;return '<button type="button" class="ue-mon'+(feat?' ue-mon-featured':'')+'" data-identity="'+esc(p.key)+'" data-info="'+esc(JSON.stringify(info))+'" aria-haspopup="dialog" aria-label="'+esc(name+(p.costumeId&&label?' ('+label+')':'')+', '+(info.badge||short)+'. Show details')+'">'+(tag?'<span class="ue-feat-tag">Featured</span>':'')+'<span class="ue-mon-art">'+art+'</span><b>'+esc(name)+'</b>'+(p.costumeId&&label?'<small class="ue-costume">'+esc(label)+'</small>':'')+badge+(signals.length?'<span class="ue-signals">'+signals.join('')+'</span>':'')+'</button>';
  }).join('');
  return cards?'<div class="ue-method" data-method="'+method+'">'+(method==='other'&&Object.keys(model.groups).every(function(k){return k==='other'||!model.groups[k].length;})?'':'<h4>'+METHODS[method]+'</h4>')+'<div class="ue-gallery">'+cards+'</div></div>':'';
 }).join('');
}

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
var PASS_ICONS=[[/^xp$/i,'/ico/xp.webp'],[/^stardust$/i,'/ico/dust.webp'],[/candy( xl)?$/i,'/ico/candy.webp'],[/^max potion$/i,'/ico/i/max-potion.webp'],[/^max revive$/i,'/ico/i/max-revive.webp'],[/^golden razz/i,'/ico/i/golden-razz.webp'],[/^silver pinap/i,'/ico/i/silver-pinap.webp'],[/incubator/i,'/ico/egg.webp'],[/incense/i,'/ico/incense.webp'],[/(raid|battle) pass/i,'/ico/g/raidpass.webp']];
function passCategory(item){
 if(item.type==='encounter')return 'Pokémon';
 var n=item.name;
 if(/\bbox\b/i.test(n))return 'Box';
 if(/candy/i.test(n))return 'Candy';
 if(/^(xp|stardust|pok[eé]coins?)$/i.test(n))return 'Resource';
 if(/\b(tee|t-shirt|t shirt|pants|jacket|hat|shirt|pose|sticker|badge|avatar|bag|shoes|glasses|gloves)\b/i.test(n))return 'Avatar item';
 if(/\b(ball|berry|potion|revive|incubator|incense|pinap|razz|tm|lure|pass|egg|mushroom|star piece|nanab|module|particle|charm)\b/i.test(n))return 'Item';
 return 'Reward';
}
function passReward(raw,ctx){
 var item=typeof raw==='string'?{name:raw.trim(),type:'other',quantity:1}:raw;
 if(!item||typeof item.name!=='string'||!item.name||/^[-–—]+$/.test(item.name.trim()))return null;
 if(typeof raw==='string'){var q=/^(.+?)\s*[×x]\s*(\d+)$/i.exec(item.name);if(q){item={name:q[1].trim(),type:'item',quantity:+q[2]};}}
 var cat=passCategory(item),art='',fallback=true;
 if(item.type==='encounter'&&ctx.rewardArt){art=ctx.rewardArt(item)||'';fallback=!/<(img|svg|canvas)\b/i.test(art);if(fallback)art='';}
 else{var icon=PASS_ICONS.filter(function(r){return r[0].test(item.name);})[0];if(icon){art='<img src="'+esc(icon[1])+'" alt="" width="40" height="40" loading="lazy" decoding="async">';fallback=false;}}
 var glyph=cat==='Pokémon'?'?':cat==='Avatar item'?'👕':cat==='Box'?'🎁':'◆';
 var qty=Number.isInteger(item.quantity)&&item.quantity>1?'×'+esc(item.quantity):'';
 var lvl=item.type==='encounter'&&Number.isInteger(item.level)?' · Level '+esc(item.level):'';
 return '<div class="ue-pass-reward" data-cat="'+esc(cat)+'"'+(fallback?' data-art="fallback"':'')+'><span class="ue-pass-art" aria-hidden="true">'+(art||'<span class="ue-reward-icon">'+glyph+'</span>')+'</span><span class="ue-pass-name"><b>'+esc(item.name)+'</b><small>'+(qty?qty+' · ':'')+esc(cat)+lvl+(fallback?' · art unavailable':'')+'</small></span></div>';
}
function passLane(label,cls,list,empty,ctx){
 var chips=[].concat(list||[]).map(function(x){return passReward(x,ctx);}).filter(Boolean);
 return '<div class="ue-lane ue-lane-'+cls+'"><h5>'+label+'</h5>'+(chips.length?chips.join(''):'<p class="ue-lane-empty">'+empty+'</p>')+'</div>';
}
function passes(items,ctx){
 function stage(s){
  var lanes=(s.free||s.deluxe)?passLane('Free','free',s.free,'No free reward',ctx)+passLane('Deluxe','deluxe',s.deluxe,'No extra Deluxe reward',ctx):passLane('Reward','free',s.rewards,'Track not specified by the source',ctx);
  return '<li class="ue-pass-rank" data-rank="'+esc(s.rank)+'"><b>Rank '+esc(s.rank)+'</b>'+(Number.isFinite(s.points)?'<small>'+esc(s.points)+' points</small>':'')+'<div class="ue-pass-lanes">'+lanes+'</div></li>';
 }
 function listWithGaps(list,startPrev){
  var out='',prev=startPrev===undefined?null:startPrev;
  list.forEach(function(s){if(prev!==null&&s.rank>prev+1)out+='<li class="ue-pass-gap" role="note">'+(s.rank-prev===2?'Rank '+(prev+1):'Ranks '+(prev+1)+'–'+(s.rank-1))+': no rewards listed by the source</li>';out+=stage(s);prev=s.rank;});
  return out;
 }
 var meta=ctx.passMeta||{};
 return items.filter(function(p){return value(p);}).map(function(p){
  var stages=(Array.isArray(p.stages)?p.stages:[]).filter(function(s){return s&&Number.isInteger(s.rank)&&s.rank>=0;}).slice().sort(function(a,b){return a.rank-b.rank;});
  var content='';
  if(!stages.length)content='<p class="note ue-pass-missing">Rank rewards have not been published by the source yet.</p>';
  else{
   var groups={};stages.forEach(function(s){var key=Math.floor(Math.max(0,s.rank-1)/25);(groups[key]||(groups[key]=[])).push(s);});
   var keys=Object.keys(groups);
   var first=stages[0].rank,last=stages[stages.length-1].rank;
   var head='<p class="ue-pass-count">'+stages.length+' reward ranks listed'+(last>first?' (Rank '+first+' to '+last+')':'')+'.'+(first>1?' Ranks 1'+(first>2?'–'+(first-1):'')+' list no track reward; milestone bonuses are shown under Bonuses.':'')+'</p><p class="ue-pass-legend"><span class="ue-key ue-key-free">Free track</span><span class="ue-key ue-key-deluxe">Deluxe track</span> Deluxe also receives every Free reward.</p>';
   content=head+keys.map(function(key,i){var list=groups[key],before=i?groups[keys[i-1]][groups[keys[i-1]].length-1].rank:null;return '<details class="ue-pass-range"'+(i===0?" open":"")+'><summary>'+(list.length===1?'Rank '+esc(list[0].rank):'Ranks '+esc(list[0].rank)+'–'+esc(list[list.length-1].rank))+'</summary><ol class="ue-pass-stages">'+listWithGaps(list,before)+'</ol></details>';}).join('');
  }
  var srcs=(model_sources(ctx)||[]).map(function(s){return s;}).join(' · ');
  var foot='<p class="ue-pass-src">'+(srcs?'Source: '+srcs:'Source not listed')+(meta.updated?' · Data checked '+esc(String(meta.updated).slice(0,10)):' · Freshness unknown')+'. Rewards are as published by the source and can change; anything not listed is not confirmed.'+(meta.warning?' '+esc(meta.warning):'')+'</p>';
  return '<article class="ue-pass"><h4>'+esc(value(p))+'</h4>'+((p.text&&p.text!==value(p))?'<p>'+esc(p.text)+'</p>':'')+content+foot+'</article>';
 }).join('');
}
function model_sources(ctx){return (ctx.passMeta&&ctx.passMeta.sources||[]).map(function(s){var u=s.url&&ctx.safe?ctx.safe(s.url):s.url;return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+'</a>':esc(s.name);});}
function tickets(items,ctx){
 var notes=[],cards=[];
 items.filter(function(t){return value(t);}).forEach(function(t){
  var price='';if(t.price&&Number.isFinite(t.price.amount)&&/^[A-Z]{3}$/.test(t.price.currency))try{price=new Intl.NumberFormat('en-AU',{style:'currency',currency:t.price.currency,currencyDisplay:'code'}).format(t.price.amount);}catch(e){}
  var url=ctx.safe&&ctx.safe(t.url);
  if(!price&&!url&&!t.access){notes.push(value(t));return;}
  cards.push('<article class="ue-ticket"><h4>'+esc(value(t))+'</h4>'+(t.access?'<p>'+esc(t.access)+'</p>':'')+(price?'<b>'+esc(price)+'</b>':'')+(url?'<a class="pill" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">View ticket</a>':'')+'</article>');
 });
 var factList=function(list){return '<ul class="ue-ticket-facts">'+list.map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul>';};
 return cards.join('')+(notes.length?'<div class="ue-ticket-guide">'+factList(notes.slice(0,3))+(notes.length>3?'<details class="ue-ticket-more"><summary>More ticket details ('+(notes.length-3)+')</summary>'+factList(notes.slice(3))+'</details>':'')+'</div>':'');
}
var BONUS_ICONS=[[/stardust/i,'/ico/dust.webp'],[/\bxp\b|experience/i,'/ico/xp.webp'],[/candy/i,'/ico/candy.webp'],[/incense/i,'/ico/incense.webp'],[/\btrade|trading/i,'/ico/trade.webp'],[/shiny/i,'/ico/shiny.webp'],[/raid pass/i,'/ico/g/raidpass.webp'],[/lucky/i,'/ico/g/lucky.webp'],[/\b12 ?km|12-km/i,'/ico/g/egg-12km.webp'],[/\b10 ?km|10-km/i,'/ico/g/egg-10km.webp'],[/\b7 ?km/i,'/ico/g/egg-7km.webp'],[/\b5 ?km/i,'/ico/g/egg-5km.webp'],[/\b2 ?km/i,'/ico/g/egg-2km.webp'],[/egg|hatch/i,'/ico/egg.webp'],[/mega/i,'/ico/g/mega.webp'],[/raid/i,'/ico/g/raid.webp'],[/shadow/i,'/ico/g/shadow.webp'],[/ticket|pass\b/i,'/ico/pass.webp'],[/medal|research|avatar|background|power spot|lure/i,'/ico/g/event.webp']];
/* Real bonuses (a gain or multiplier) versus conditions, access rules and disclaimers. Wording is never changed, only grouped. */
var NOTE_RE=/not guaranteed|\bmay\b|subject to|separate(?:ly)?\b|requires?\b|only if|begin when you claim|last through|local time on|ticket holders (?:receive these benefits|at the)|terms|disclaimer|unavailable|while supplies/i;
function bonusClass(t){return NOTE_RE.test(t)?'note':'bonus';}
function bonusIcon(t){for(var i=0;i<BONUS_ICONS.length;i++)if(BONUS_ICONS[i][0].test(t))return BONUS_ICONS[i][1];return '/ico/g/powerup.webp';}
function bonusBody(t){var m=/^(\d+(?:\.\d+)?x|half|up to \d+)\s+(.*)$/i.exec(t);return m?'<b class="ue-bonus-mult">'+esc(m[1])+'</b> <span>'+esc(m[2])+'</span>':'<span>'+esc(t)+'</span>';}
function bonusCard(b,ctx){
 var full=value(b);if(!full)return '';
 var head0=full.split(/[.;:]/)[0],pick=bonusIcon(head0);if(pick==='/ico/g/powerup.webp')pick=bonusIcon(full);
 var ico='<img class="ue-bonus-ico" alt="" loading="lazy" decoding="async" src="'+pick+'" data-err="rm">';
 if(full.length<=125)return '<div class="ue-bonus">'+ico+'<div class="ue-bonus-t">'+bonusBody(full)+'</div></div>';
 var head=full.split(/[.;:]/)[0];if(head.length>95){head=head.slice(0,95);head=head.slice(0,head.lastIndexOf(' '))+'…';}
 return '<details class="ue-bonus ue-bonus-detail"><summary>'+ico+'<span class="ue-bonus-t">'+bonusBody(head)+'</span></summary><p>'+esc(full)+'</p></details>';
}
function activityTime(a,ctx){
 if(!a||!a.schedule)return '';
 try{var zone=ctx.viewerZone||ctx.clock.viewerZone(),range=ctx.clock.range(a.schedule,zone),format=new Intl.DateTimeFormat('en-AU',{timeZone:zone,weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'});return format.format(new Date(range.start))+' – '+format.format(new Date(range.end))+(a.schedule.timeBasis==='player-local'?' · local time wherever you play':' · your time');}catch(error){return 'Time needs confirmation in your selected time zone.';}
}
function activityPlace(a){var place=a&&(a.location||a.region);return typeof place==='string'?place:place&&typeof place.name==='string'?place.name:'';}
function scheduledActivities(model,ctx,presentation){return model.activities.filter(function(a){return a.schedule&&a.presentation===presentation;}).map(function(a){return '<article class="'+(presentation==='rotation'?'ue-rotation':'ue-activity-window')+'" data-activity="'+esc(a.id)+'"><h4>'+esc(a.title||a.name||'Activity')+'</h4><p>'+esc(activityTime(a,ctx))+'</p>'+(activityPlace(a)?'<small>'+esc(activityPlace(a))+'</small>':'')+(a.access&&a.access!=='unknown'&&a.access!=='all'?'<small>'+esc(a.access)+'</small>':'')+'</article>';}).join('');}
// Promote high-value sourced facts from the importer to Overview without inventing dates,
// bonuses or reward tiers. This applies to every event with the same source field structure.
function sourceHighlights(model){
 var fields=model.internalValidation&&model.internalValidation.fields||{};
 var rules=[
  {label:'Daily Raid & Max Battle hours',re:/\b(?:raid hour|max battle hour)\b/i,keys:['dates','raids','bonuses']},
  {label:'GO Pass reward',re:/\bsilver bottle cap\b/i,keys:['featured','tickets','bonuses']},
  {label:'Shiny Gimmighoul · Coin Bag',re:/\\bshiny gimmighoul\\b.*\\bcoin bag\\b|\\bcoin bag\\b.*\\bshiny gimmighoul\\b/i,keys:['bonuses','shiny','featured']},
  {label:'Shiny Meltan · Mystery Box',re:/\\bshiny meltan\\b.*\\bmystery box\\b|\\bmystery box\\b.*\\bshiny meltan\\b/i,keys:['bonuses','shiny','featured']},
  {label:'Raid access',re:/\bremote raid (?:pass )?limit\b|\bno limit on remote raids\b/i,keys:['bonuses','raids']}
 ];
 var used=new Set(),out=[];
 rules.forEach(function(rule){
  for(var k=0;k<rule.keys.length;k++){
   var rows=(fields[rule.keys[k]]||[]).concat(rule.label.indexOf('Shiny ')===0?(model.notes||[]).map(function(n){return {text:n,status:'single'};}):[]);
   var row=rows.find(function(item){var t=value(item);return rule.re.test(t)&&!used.has(t.toLowerCase())&&t.length<=240&&(!item.status||item.status==='corroborated'||item.status==='verified'||item.status==='single');});
   if(!row)continue;
   var message=value(row);used.add(message.toLowerCase());
   out.push('<li><strong>'+esc(rule.label)+'</strong><span>'+esc(message)+'</span></li>');
   break;
  }
 });
 return out.length?'<div class="ue-source-highlights"><h3 class="ue-mini-h">Key event details</h3><ul>'+out.join('')+'</ul></div>':'';
}
function render(model,ctx){ctx=ctx||{};var view=V.project(model),fields=model.internalValidation&&model.internalValidation.fields||{},body={};
 var galleryOnly=model.encounters.every(function(e){return e.method==='other';});
 body.encounters=section('evd-pokemon',galleryOnly?'Featured Pokémon':'Pokémon',gallery(model,ctx));
 if(!model.bonuses.length&&!ctx.moves)body.encounters=body.encounters.replace('<h3 class="sec2">','<h3 class="sec2" id="evd-highlights">');
 var bonusList=model.bonuses.filter(function(b){var t=value(b);return t&&!(model.internalValidation&&model.internalValidation.conflicts||[]).some(function(c){return c.a&&c.a.text===t||c.b&&c.b.text===t;});});
 var realB=bonusList.filter(function(b){return bonusClass(value(b))==='bonus';}),noteB=bonusList.filter(function(b){return bonusClass(value(b))!=='bonus';});
 body.bonuses=section('evd-highlights','Event bonuses',(realB.length?'<div class="ue-bonuses">'+realB.map(function(b){return bonusCard(b,ctx);}).join('')+'</div>':'')+(noteB.length?'<div class="ue-notes"><h4 class="ue-mini-h">Conditions &amp; notes</h4><ul>'+noteB.map(function(b){return '<li class="ue-note">'+esc(value(b))+'</li>';}).join('')+'</ul></div>':''));if(!/class="ue-(bonus|note)/.test(body.bonuses))body.bonuses='';
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
 var hasOverview=!!ctx.overview;
 var hero='<header class="evd-hero ue-hero">'+(ctx.artHtml||'')+'<div class="ue-hero-copy"><div class="ue-hero-chips"><span class="ue-family">'+esc(view.family==='other'?'Event':view.family.replace(/-/g,' '))+'</span>'+(ctx.countdown?'<span class="cdn evd-cd">'+esc(ctx.countdown)+'</span>':'')+'</div><h2 id="evd-t">'+esc(model.title)+'</h2>'+(model.location?'<p class="ue-location">'+esc(typeof model.location==='string'?model.location:model.location.name||'')+'</p>':'')+(hasOverview?'':'<p class="evc-when">'+esc(ctx.when||'Dates to be announced')+'</p>')+'</div></header>';
 var more=section('evd-information','Details',detail+(ctx.moves||'')+(ctx.locations||''));
 var sources=ctx.sources||'';
 if(!sources){
  var links=model.sources.filter(function(s){try{var u=new URL(s.url);return u.protocol==='https:'&&!u.username&&!u.password&&!L.isPrivateLink(s.url);}catch(error){return false;}}).map(function(s){return '<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name||'Event source')+'</a></li>';}).join('');
  if(links)sources='<details class="ue-sources" id="evd-sources"><summary>Sources &amp; updates</summary><ul>'+links+'</ul></details>';
 }
 var hasSources=/\bid=["']evd-sources["']/.test(sources);
 var jumps=nav+(more?'<a href="#evd-information">Details</a>':'')+(hasSources?'<a href="#evd-sources">Sources</a>':'');

 var panels=[],label={encounters:'Pokémon',bonuses:'Bonuses',research:'Research',passes:'GO Pass',tickets:'Tickets'};
 var incomplete=!selected.length&&!info.length;
 var overview=(ctx.overview||'')+sourceHighlights(model)+(info.length?'<h3 class="ue-mini-h">Highlights</h3><ul class="ue-facts ue-summary">'+info.filter(function(t){var k=String(t).toLowerCase().slice(0,40);return !model.tickets.some(function(x){return value(x).toLowerCase().indexOf(k)>=0;})&&!model.bonuses.some(function(x){return value(x).toLowerCase().indexOf(k)>=0;});}).slice(0,4).map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul>':'')+(incomplete||(model.completeness==='partial'&&selected.length<2)?'<p class="ue-more-note" role="note">More details to come. Only verified information is shown.</p>':'');
 panels.push({id:'overview',label:'Overview',html:'<div class="ue-overview">'+(cancelled||'')+conflict+overview+(ctx.actions||'')+'</div>'});
 ['encounters','bonuses','research','passes','tickets'].forEach(function(k){if(selected.indexOf(k)>=0&&body[k]&&(k!=='bonuses'||/class="ue-(bonus|note)/.test(body[k])))panels.push({id:k,label:label[k],html:body[k]});});
 var sched=(selected.indexOf('rotations')>=0?body.rotations:'')+(selected.indexOf('schedule')>=0?body.schedule:'');
 if(sched)panels.splice(Math.min(panels.length,2),0,{id:'schedule',label:'Schedule',html:sched});
 var detailsHtml=more+(hasSources?(sources||''):'').replace('<details class="ue-sources"','<details class="ue-sources" open');
 if(detailsHtml.trim())panels.push({id:'details',label:'Details & sources',html:detailsHtml});
 /* Continuous page: every available section in document order. No hidden panels; the nav only links to headings. */
 var DUP=/^(Pokémon|Event bonuses|Research|Research tasks|GO Pass|Tickets &amp; access|Details)$/;
 function dedupe(html){return String(html).replace(/<h3 class="sec2">([^<]*)<\/h3>/,function(m,t){return DUP.test(t)?'':m;});}
 var sections=panels.filter(function(t){return t.html&&String(t.html).replace(/<[^>]+>/g,'').trim().length>0||/<img|<svg/.test(t.html||'');});
 var nav='<nav class="evd-nav" aria-label="Event sections"><div class="evd-nav-scroll">'+sections.map(function(t,i){return '<a class="evd-nav-link" href="#evd-s-'+t.id+'" data-sec="'+t.id+'"'+(i===0?' aria-current="true"':'')+'>'+esc(t.label)+'</a>';}).join('')+'</div><span class="evd-nav-more" aria-hidden="true">›</span></nav>';
 var secs=sections.map(function(t){return '<section class="evd-sec" id="evd-s-'+t.id+'" aria-labelledby="evd-h-'+t.id+'" data-sec="'+t.id+'"><h2 class="evd-sec-h" id="evd-h-'+t.id+'" tabindex="-1">'+esc(t.label)+'</h2>'+dedupe(t.html)+'</section>';}).join('');
 return (ctx.toolbar||'')+hero+nav+'<div class="evd-sections">'+secs+'</div>';
}
return {render:render,gallery:gallery,rotations:function(model,ctx){return scheduledActivities(model,ctx,'rotation');}};
}));
