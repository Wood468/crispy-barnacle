/* Universal event presentation. One family-ordered component system for every source record. */
(function(root,factory){var api=factory(typeof module==='object'&&module.exports?require('./lib.js'):root.GOLIB,typeof module==='object'&&module.exports?require('./event-view.js'):root.GOEventView);if(typeof module==='object'&&module.exports)module.exports=api;else root.GOEventComponents=api;}(typeof globalThis!=='undefined'?globalThis:this,function(L,V){
'use strict';
var esc=L.esc;
var METHODS={wild:'In the wild',raid:'Raid encounters',max:'Max Battles',egg:'Egg hatches',incense:'Incense encounters',research:'Research encounters',lure:'Lure encounters',photobomb:'Snapshot encounters',other:'Featured Pokémon'};
function value(row){if(typeof row==='string')return row;var v=row&&(row.text||row.title||row.name||row.task||row.label);return typeof v==='string'?v:'';}
function section(id,title,html){return html?'<section class="ue-section" id="'+esc(id)+'"><h3 class="sec2">'+esc(title)+'</h3>'+html+'</section>':'';}
function rows(items){return '<ul class="ue-facts">'+items.filter(function(x){return value(x);}).map(function(x){return '<li>'+esc(value(x))+'</li>';}).join('')+'</ul>';}

/* Use only a sourced hatch distance. Multiple unassigned distances in one
   event leave individual tiles unlabeled rather than guessing the egg pool. */
function eggKm(model,p,edge,activity){
 var allowed={'2':1,'5':1,'7':1,'10':1,'12':1};
 var exact=[edge.eggDistanceKm,edge.distanceKm,p.eggDistanceKm,activity&&activity.eggDistanceKm];
 for(var i=0;i<exact.length;i++){var num=String(exact[i]||'');if(allowed[num])return num;}
 var match=/\b(2|5|7|10|12)\s*km\b/i.exec([activity&&activity.title,activity&&activity.name,p.label,edge.access].filter(Boolean).join(' '));
 if(match)return match[1];
 var fields=model.internalValidation&&model.internalValidation.fields||{},distances=new Set();
 (fields.eggs||[]).forEach(function(row){
  var t=value(row);if(!/\beggs?\b|\bhatch/i.test(t))return;
  (t.match(/\b(?:2|5|7|10|12)\s*km\b/gi)||[]).forEach(function(item){
   var digits=/\d+/.exec(item);if(digits)distances.add(digits[0]);
  });
 });
 return distances.size===1?Array.from(distances)[0]:'';
}
/* Different feeds spell these two Crowned form IDs with or without a dash.
   Collapse only equivalent raid-gallery aliases; never rewrite encounter or
   Collection keys, nor hide distinct methods, activities or access rules. */
function galleryDisplayIdentity(p){
 var species=String(p.speciesId||''),form=String(p.formId||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!p.costumeId&&((species==='888'&&form==='crownedsword')||(species==='889'&&form==='crownedshield')))return species+':'+form+':none';
 return p.key;
}

/* Event raid cards share Battle's Game Master hundo calculator. A published CP
   pair takes precedence; no unsupported species/form values are invented. */
function eventRaidCp(name,raw){
 var dash=typeof globalThis!=='undefined'&&globalThis.GODASH;
 var pair=dash&&typeof dash.hundoPair==='function'?dash.hundoPair({kind:'raid'},{name:name}):null;
 var ok=function(n){return Number.isSafeInteger(n)&&n>=10&&n<=10000;};
 if(Array.isArray(raw)&&raw.length===2&&ok(raw[0])&&ok(raw[1])&&raw[1]>=raw[0])return {normal:raw[0],boosted:raw[1]};
 if(ok(raw))return {normal:raw,boosted:pair&&pair.n===raw&&ok(pair.b)?pair.b:null};
 return pair&&ok(pair.n)&&ok(pair.b)?{normal:pair.n,boosted:pair.b}:null;
}
function eventRaidCpHtml(name,raw){
 var cp=eventRaidCp(name,raw);if(!cp)return '';
 return '<span class="ue-raid-cp" role="text" aria-label="'+esc('100% IV raid catch CP '+cp.normal+(cp.boosted?', possible weather-boosted 100% IV '+cp.boosted:''))+'"><span class="ue-raid-cp-normal" title="Perfect 15/15/15 raid catch at Level 20">100% '+cp.normal.toLocaleString('en-AU')+'</span>'+(cp.boosted?'<span class="ue-raid-cp-weather" title="Possible weather-boosted perfect raid catch at Level 25">WB '+cp.boosted.toLocaleString('en-AU')+'</span>':'')+'</span>';
}
function eventRaidTierHtml(tier){
 var t=/^(?:[1-9]★|Mega|Primal|Elite|Shadow)$/.test(String(tier||''))?tier:'Raid';
 var a=t==='Raid'?'Raid encounter; tier not specified':t.replace(/([1-9])★/g,'$1 star')+' raid tier';
 return '<span class="ue-raid-tier-corner" aria-label="'+esc(a)+'"><img src="/ico/g/raid.webp" alt="" width="12" height="12" loading="lazy" decoding="async">'+esc(t)+'</span>';
}
function gallery(model,ctx){
 var featOnce=false,byKey={};model.pokemon.forEach(function(p){byKey[p.key]=p;});
 return Object.keys(METHODS).map(function(method){
  var seen=new Set(),cards=(model.groups[method]||[]).map(function(edge){
   var p=byKey[edge.identityKey];if(!p)return '';
   var activity=model.activities.find(function(a){return a.id===edge.activityId;}),activityLabel=activity&&(activity.title||activity.name);
   var key=galleryDisplayIdentity(p)+'|'+edge.activityId+'|'+(edge.access&&edge.access!=='all'&&edge.access!=='unknown'?edge.access:'');
   if(seen.has(key))return '';seen.add(key);
   var name=ctx.nameFor?ctx.nameFor(p):p.name||p.speciesId,label=p.label;
   var conflict=(model.internalValidation&&model.internalValidation.conflicts||[]).some(function(c){return c.field==='shiny'&&c.identityKey===p.key;});
   var signals=[];
   /* A verified boost supersedes the ordinary shiny chip; do not display two
      contradictory-looking badges for the same encounter. */
   if(!conflict&&p.boostedShiny)signals.push('<span class="ue-signal ue-shiny ue-shiny-boost"><span class="ue-shiny-mark" aria-hidden="true">↑✦</span> Boosted shiny</span>');
   else if(!conflict&&p.shiny==='yes')signals.push('<span class="ue-signal ue-shiny"><span class="ue-shiny-mark" aria-hidden="true">✦</span> Shiny</span>');
   if(p.debut)signals.push('<span class="ue-signal">Debut</span>');
   if(edge.access&&edge.access!=='all'&&edge.access!=='unknown')signals.push('<span class="ue-signal">'+esc(edge.access)+'</span>');
   var art=ctx.artFor?ctx.artFor(p):ctx.art?ctx.art({n:name,costume:!!p.costumeId,label:label,asset:p.assetKey},'ea'):'';
   var meta=[p.costumeId&&label?label:'',activityLabel,activity&&activity.schedule?activityTime(activity,ctx):'',activityPlace(activity)].filter(Boolean);
   var kind=ctx.artKind?ctx.artKind(p):'',stars=method==='raid'?((/(\d)-star/i.exec(model.title||'')||[])[1]||''):'',km=method==='egg'?eggKm(model,p,edge,activity):'';
   /* Egg and Incense section headings plus compact corner icons carry their visual method;
      retain exact distance in the accessible tile label and details only. */
   var badge=(method==='egg'||method==='incense')?'':'<span class="ue-badge ue-b-'+method+'">'+(method==='raid'&&stars?stars+'★ Raid':({wild:'Wild',raid:'Raid',max:'Max',incense:'Incense',research:'Research',lure:'Lure',photobomb:'Snapshot',other:'Featured'})[method])+'</span>';
   var mighty=method==='incense'&&edge.mighty===true;
   var raidTier=method==='raid'?eventRaidTierHtml(stars?stars+'★':'Raid'):'';
   var raidCp=method==='raid'?eventRaidCpHtml(name,null):'';
   if(mighty)signals.unshift('<span class="ue-signal">Mighty Pokémon</span>');
   var short=({wild:'Wild',raid:'Raid',max:'Max Battle',egg:'Egg',incense:'Incense',research:'Research',lure:'Lure',photobomb:'Snapshot',other:'Featured'})[method];var info={name:name,method:short,badge:km?km+' km egg':stars?stars+'-star raid':'',meta:meta,signals:signals.map(function(x){return x.replace(/<[^>]+>/g,'');}),form:kind};
   var feat=!!(p.debut||p.boostedShiny),tag=feat&&!featOnce;if(tag)featOnce=true;return '<button type="button" class="ue-mon'+(feat?' ue-mon-featured':'')+'" data-identity="'+esc(p.key)+'" data-info="'+esc(JSON.stringify(info))+'" aria-haspopup="dialog" aria-label="'+esc((mighty?'Mighty ':'')+name+(p.costumeId&&label?' ('+label+')':'')+', '+(info.badge||short)+'. Show details')+'">'+(tag?'<span class="ue-feat-tag">Featured</span>':'')+(mighty?'<span class="ue-mighty-corner" aria-hidden="true">!!!</span>':'')+raidTier+(method==='egg'&&km?'<span class="ue-egg-corner ue-egg-'+esc(km)+'" aria-hidden="true"><img src="/ico/g/egg-'+esc(km)+'km.webp" alt="" loading="lazy" decoding="async" width="20" height="20"></span>':method==='incense'?'<span class="ue-incense-corner" aria-hidden="true"><img src="/ico/incense.webp" alt="" loading="lazy" decoding="async" width="20" height="20"></span>':'')+'<span class="ue-mon-art">'+art+'</span><b>'+esc(name)+'</b>'+raidCp+(p.costumeId&&label?'<small class="ue-costume">'+esc(label)+'</small>':'')+badge+(signals.length?'<span class="ue-signals">'+signals.join('')+'</span>':'')+'</button>';
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
function researchTask(r,ctx){return '<article class="research-task"><h4>'+esc(value(r))+'</h4>'+(r.access&&r.access!=='unknown'?'<p>'+esc(r.access)+'</p>':'')+(Array.isArray(r.rewards)?'<div class="research-rewards">'+r.rewards.map(function(x){return reward(x,ctx);}).join('')+'</div>':'')+'</article>';}
/* Parsed tasks are the countable unit. Source prose lines are shown as notes underneath and never counted as tasks. */
function research(items,ctx){var list=items.filter(function(r){return value(r);}),tasks=list.filter(function(r){return V.researchTaskCount([r]);}),notes=list.filter(function(r){return !V.researchTaskCount([r]);});
 return tasks.map(function(r){return researchTask(r,ctx);}).join('')+(notes.length?'<ul class="ue-facts ue-research-notes">'+notes.map(function(r){return '<li>'+esc(value(r))+'</li>';}).join('')+'</ul>':'')+(!tasks.length&&notes.length?'<p class="ue-more-note" role="note">No individual research tasks have been published yet.</p>':'');}
/* Only use icons whose published app assets identify the actual reward.
   XP and Candy XL deliberately use category symbols instead of misleading art. */
var PASS_ICONS=[[/^stardust$/i,'/ico/dust.webp'],[/^max potion$/i,'/ico/i/max-potion.webp'],[/^max revive$/i,'/ico/i/max-revive.webp'],[/^golden razz/i,'/ico/i/golden-razz.webp'],[/^silver pinap/i,'/ico/i/silver-pinap.webp'],[/^incense$/i,'/ico/incense.webp'],[/(raid|battle) pass/i,'/ico/g/raidpass.webp']];
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
function passGlyph(item,cat){
 if(/^xp$/i.test(item.name))return 'XP';
 if(/candy xl/i.test(item.name))return 'XL';
 if(/candy/i.test(item.name))return 'C';
 if(cat==='Pokémon')return '?';
 if(cat==='Avatar item')return '👕';
 if(cat==='Box')return '▣';
 if(/stardust|star piece/i.test(item.name))return '✦';
 if(/pok[eé]coin/i.test(item.name))return '◎';
 if(/potion|revive/i.test(item.name))return '+';
 if(/ball/i.test(item.name))return '●';
 if(/berry|pinap|razz/i.test(item.name))return '◉';
 return '◇';
}
function passReward(raw,ctx){
 var item=typeof raw==='string'?{name:raw.trim(),type:'other',quantity:1}:raw;
 if(!item||typeof item.name!=='string'||!item.name||/^[-–—]+$/.test(item.name.trim()))return null;
 if(typeof raw==='string'){var q=/^(.+?)\s*[×x]\s*(\d+)$/i.exec(item.name);if(q){item={name:q[1].trim(),type:'item',quantity:+q[2]};}}
 var cat=passCategory(item),art='',hasArt=false;
 var semantic=typeof globalThis!=='undefined'&&globalThis.GOGoPassRewardArt&&typeof globalThis.GOGoPassRewardArt.resolve==='function'?globalThis.GOGoPassRewardArt.resolve(item):null;
 if(item.type==='encounter'&&ctx.rewardArt){
  art=ctx.rewardArt(item)||'';
  hasArt=/<(img|svg|canvas)\b/i.test(art);
  if(!hasArt)art='';
 }else{
  /* Exact-only semantic art module supersedes ambiguous legacy name matching. */
  var icon=semantic?(semantic.kind==='image'?[/^.*$/,semantic.src]:null):PASS_ICONS.filter(function(r){return r[0].test(item.name);})[0];
  if(icon){art='<img src="'+esc(icon[1])+'" alt="" width="40" height="40" loading="lazy" decoding="async">';hasArt=true;}
 }
 var qty=Number.isInteger(item.quantity)&&item.quantity>1?'×'+esc(item.quantity):'';
 var lvl=item.type==='encounter'&&Number.isInteger(item.level)?' · Level '+esc(item.level):'';
 var symbol=semantic&&semantic.kind==='symbol'?semantic.symbol:passGlyph(item,cat);
 return '<div class="ue-pass-reward" data-cat="'+esc(cat)+'"'+(hasArt?'':' data-art="category"')+'><span class="ue-pass-art" aria-hidden="true">'+(art||'<span class="ue-reward-icon">'+esc(symbol)+'</span>')+'</span><span class="ue-pass-name"><b>'+esc(item.name)+'</b><small>'+(qty?qty+' · ':'')+esc(cat)+lvl+'</small></span></div>';
}
function passLane(label,cls,list,ctx){
 var chips=[].concat(list||[]).map(function(x){return passReward(x,ctx);}).filter(Boolean);
 return chips.length?'<div class="ue-lane ue-lane-'+cls+'"><h5>'+label+'</h5>'+chips.join('')+'</div>':'';
}
/* Stages can combine identified Free/Deluxe tracks with additional published
   rewards whose track has not been attributed. Never silently hide the latter
   or label them Free; avoid double-showing a reward already in a named track. */
function passRewardIdentity(raw){
 var name=typeof raw==='string'?raw:raw&&raw.name;
 if(typeof name!=='string')return '';
 var quantity=raw&&typeof raw==='object'&&Number.isInteger(raw.quantity)&&raw.quantity>0?raw.quantity:1;
 if(typeof raw==='string'){
  var match=/^(.+?)\s*[×x]\s*(\d+)$/i.exec(name);
  if(match){name=match[1];quantity=Number(match[2]);}
 }
 return name.trim().replace(/\s+/g,' ').toLowerCase()+'|'+quantity;
}
function passStageLanes(s,ctx){
 var free=[].concat(s.free||[]),deluxe=[].concat(s.deluxe||[]);
 var identified=new Set(free.concat(deluxe).map(passRewardIdentity).filter(Boolean));
 var unspecified=[].concat(s.rewards||[]).filter(function(item){
  var identity=passRewardIdentity(item);
  return identity&&!identified.has(identity);
 });
 return passLane('Free','free',free,ctx)+passLane('Deluxe','deluxe',deluxe,ctx)+passLane('Track not specified','unspecified',unspecified,ctx);
}
function passStageRewards(s){
 return [].concat(s.free||[],s.deluxe||[],s.rewards||[]).filter(function(x){return x&&typeof x==='object'&&typeof x.name==='string'||typeof x==='string'&&x.trim();});
}
function passHighlightScore(s){
 return passStageRewards(s).reduce(function(score,item){
  var name=typeof item==='string'?item:item.name;
  if(/bottle cap|dynamax meltan|gold bottle cap/i.test(name))return Math.max(score,8);
  if((typeof item==='object'&&item.type==='encounter')||/\b(encounter|lucky trinket)\b/i.test(name))return Math.max(score,6);
  if(/elite (charged|fast) tm|rare candy xl/i.test(name))return Math.max(score,4);
  return score;
 },0);
}
function passes(items,ctx){
 function stage(s){
  var lanes=passStageLanes(s,ctx);
  return '<li class="ue-pass-rank" data-rank="'+esc(s.rank)+'"><b>Rank '+esc(s.rank)+'</b>'+(Number.isFinite(s.points)?'<small>'+esc(s.points)+' points</small>':'')+'<div class="ue-pass-lanes">'+(lanes||'<p class="ue-pass-unlisted">Track rewards not specified for this rank.</p>')+'</div></li>';
 }
 function listWithGaps(list,startPrev){
  var out='',prev=startPrev===undefined?null:startPrev;
  list.forEach(function(s){if(prev!==null&&s.rank>prev+1)out+='<li class="ue-pass-gap" role="note">'+(s.rank-prev===2?'Rank '+(prev+1):'Ranks '+(prev+1)+'–'+(s.rank-1))+': no reward entries published by the source</li>';out+=stage(s);prev=s.rank;});
  return out;
 }
 function highlight(s){
  return '<li class="ue-pass-highlight" data-milestone-rank="'+esc(s.rank)+'"><strong>Rank '+esc(s.rank)+'</strong><div class="ue-pass-lanes">'+passStageLanes(s,ctx)+'</div></li>';
 }
 var meta=ctx.passMeta||{};
 return items.filter(function(p){return value(p);}).map(function(p){
  var stages=(Array.isArray(p.stages)?p.stages:[]).filter(function(s){return s&&Number.isInteger(s.rank)&&s.rank>=0&&passStageRewards(s).some(function(r){return passReward(r,ctx)!==null;});}).slice().sort(function(a,b){return a.rank-b.rank;});
  var content='';
  if(!stages.length)content='<p class="note ue-pass-missing">Rank rewards have not been published by the source yet.</p>';
  else{
   var groups={};stages.forEach(function(s){var key=Math.floor(Math.max(0,s.rank-1)/25);(groups[key]||(groups[key]=[])).push(s);});
   var keys=Object.keys(groups),first=stages[0].rank,last=stages[stages.length-1].rank;
   var head='<p class="ue-pass-count">'+stages.length+' '+(stages.length===1?'rank with a published entry':'ranks with published entries')+' · through Rank '+last+'.'+(first>1?' Ranks 1'+(first>2?'–'+(first-1):'')+' have no track-reward entries published; milestone bonuses are shown under Bonuses.':'')+'</p><p class="ue-pass-legend"><span class="ue-key ue-key-free">Free track</span><span class="ue-key ue-key-deluxe">Deluxe track</span> Deluxe also receives every Free reward.</p>';
   var ranked=stages.map(function(s){return {stage:s,score:passHighlightScore(s)};}).filter(function(x){return x.score>0;});
   ranked.sort(function(a,b){return b.score-a.score||a.stage.rank-b.stage.rank;});
   /* Source-listed reward milestones at the familiar 45/100 thresholds stay visible
      even when an event publishes many other interesting encounter ranks. */
   var pinned=stages.filter(function(s){return (s.rank===45||s.rank===100)&&passStageRewards(s).length>0;});
   var featured=pinned.concat(ranked.filter(function(x){return pinned.indexOf(x.stage)<0;}).slice(0,Math.max(0,4-pinned.length)).map(function(x){return x.stage;}));
   if(!featured.length&&stages.length)featured=[stages[0],stages[Math.floor((stages.length-1)/2)],stages[stages.length-1]].filter(function(s,i,arr){return arr.indexOf(s)===i&&passStageRewards(s).length;});
   featured.sort(function(a,b){return a.rank-b.rank;});
   var overview=featured.length?'<div class="ue-pass-overview"><h5>Published milestones</h5><ul class="ue-pass-highlights">'+featured.map(highlight).join('')+'</ul></div>':'';
   content=head+overview+'<h5 class="ue-pass-all-title">All published rank entries</h5>'+keys.map(function(key,i){var list=groups[key],before=i?groups[keys[i-1]][groups[keys[i-1]].length-1].rank:null;return '<details class="ue-pass-range"><summary>'+'Ranks '+esc(Number(key)*25+1)+'–'+esc((Number(key)+1)*25)+' · '+list.length+' published</summary><ol class="ue-pass-stages">'+listWithGaps(list,before)+'</ol></details>';}).join('');
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
  {label:'Shiny Gimmighoul · Coin Bag',re:/\bshiny gimmighoul\b.*\bcoin bag\b|\bcoin bag\b.*\bshiny gimmighoul\b/i,keys:['bonuses','shiny','featured']},
  {label:'Shiny Meltan · Mystery Box',re:/\bshiny meltan\b.*\bmystery box\b|\bmystery box\b.*\bshiny meltan\b/i,keys:['bonuses','shiny','featured']},
  {label:'Raid access',re:/\bremote raid (?:pass )?limit\b|\bno limit on remote raids\b/i,keys:['bonuses','raids']}
 ];
 var used=new Set(),out=[];
 rules.forEach(function(rule){
  for(var k=0;k<rule.keys.length;k++){
   var rows=(fields[rule.keys[k]]||[]).concat(rule.label.indexOf('Shiny ')===0?(model.notes||[]).map(function(n){return {text:n,status:'single'};}):[]);
   var row=rows.find(function(item){var t=value(item);return rule.re.test(t)&&!used.has(t.toLowerCase())&&t.length<=240&&(!item.status||item.status==='official'||item.status==='corroborated'||item.status==='verified'||item.status==='single');});
   if(!row)continue;
   var message=value(row);used.add(message.toLowerCase());
   out.push('<li><strong>'+esc(rule.label)+'</strong><span>'+esc(message)+'</span></li>');
   break;
  }
 });
 return out.length?'<div class="ue-source-highlights"><h3 class="ue-mini-h">Key event details</h3><ul>'+out.join('')+'</ul></div>':'';
}
// Every event with structured dated activities receives the same compact schedule preview.
// Never infer times from prose; the validated event contract owns time-zone conversion.
function schedulePreview(model,ctx){
 ctx=ctx||{};
 var activities=(model.activities||[]).filter(function(a){return a.schedule&&(a.presentation==='schedule'||a.presentation==='rotation');});
 if(!activities.length)return '';
 var entries=activities.map(function(a){return {a:a,start:String(a.schedule.start||''),end:null};});
 entries.sort(function(x,y){return x.start.localeCompare(y.start)||String(x.a.id||'').localeCompare(String(y.a.id||''));});
 var now=typeof ctx.now==='number'&&Number.isFinite(ctx.now)?ctx.now:Date.now(),allPast=false,hasTimeStatus=false;
 /* Prefer current and upcoming events only when every source-backed schedule
    resolves in the user's time zone. An invalid schedule is shown in published
    order instead of being silently discarded. Full Schedule keeps all entries. */
 if(ctx.clock&&typeof ctx.clock.range==='function'){
  try{
   var zone=ctx.viewerZone||(typeof ctx.clock.viewerZone==='function'?ctx.clock.viewerZone():'');
   if(zone){
    var dated=entries.map(function(item){
     try{
      var r=ctx.clock.range(item.a.schedule,zone);
      return Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start?{a:item.a,start:r.start,end:r.end}:null;
     }catch(error){return null;}
    });
    if(dated.every(Boolean)){
     hasTimeStatus=true;
     dated.sort(function(a,b){return a.start-b.start||String(a.a.id||'').localeCompare(String(b.a.id||''));});
     var remaining=dated.filter(function(item){return item.end>now;});
     if(remaining.length)entries=remaining;
     else{entries=dated.slice(-5);allPast=true;}
    }
   }
  }catch(error){}
 }
 var count=Math.min(entries.length,5);
 var cards=entries.slice(0,count).map(function(item){
  var a=item.a,live=Number.isFinite(item.end)&&item.start<=now&&item.end>now;
  return '<li>'+(live?'<small class="ue-schedule-now">Live now</small>':'')+
   '<strong>'+esc(a.title||a.name||'Scheduled activity')+'</strong><span>'+esc(activityTime(a,ctx))+'</span>'+
   (activityPlace(a)?'<small>'+esc(activityPlace(a))+'</small>':'')+'</li>';
 }).join('');
 return '<div class="ue-schedule-preview"><h3 class="ue-mini-h">Event schedule</h3>'+
  (hasTimeStatus?'<p class="ue-schedule-caption">'+(allPast?'Recent activities':'Current &amp; upcoming activities')+'</p>':'')+
  '<ol>'+cards+'</ol>'+(entries.length>count?'<p class="ue-more-note">+'+(entries.length-count)+' more scheduled activities below</p>':'')+
  (allPast?'<p class="ue-more-note">No upcoming timed activities are listed.</p>':'')+'</div>';
}

/* Generic dated raid/Max rosters from curated published raidDays.
   Bosses remain separated by event day, including different Max battles. */
function raidDayRosters(raidDays,ctx){
 var days=(Array.isArray(raidDays)?raidDays:[]).filter(function(day){
  return day&&/^\d{4}-\d{2}-\d{2}$/.test(String(day.date||''))&&
    ['five','three','max'].some(function(k){return Array.isArray(day[k])&&day[k].length;});
 }).slice().sort(function(a,b){return a.date.localeCompare(b.date);});
 var seen=new Set();days=days.filter(function(day){if(seen.has(day.date))return false;seen.add(day.date);return true;});
 if(!days.length)return '';
 var groups=[['five','5★ Raids'],['three','3★ Raids'],['max','Max Battles']];
 var cards=days.map(function(day){
  var stamp=Date.parse(day.date+'T12:00:00Z'),label=Number.isFinite(stamp)?
    new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',weekday:'long',day:'numeric',month:'short'}).format(new Date(stamp)):day.date;
  var panels=groups.map(function(g){
   var pokemon=(day[g[0]]||[]).filter(function(name){return typeof name==='string'&&name.trim();});
   if(!pokemon.length)return '';
   return '<div class="ue-raid-day-group" data-roster="'+g[0]+'"><h5>'+esc(g[1])+'</h5><ul>'+
    pokemon.map(function(name){var img=ctx.art?ctx.art({n:name,dynamax:/^Dynamax\s/i.test(name)},'sm'):'';
     var isRaid=g[0]!=='max',tier=isRaid?eventRaidTierHtml(g[0]==='five'?'5★':'3★'):'';
     var cp=isRaid?eventRaidCpHtml(name,day.cp&&day.cp[name]):'';
     return '<li><span class="ue-raid-day-art">'+img+tier+'</span><span class="ue-raid-day-info"><b>'+esc(name)+'</b>'+cp+'</span></li>';
    }).join('')+'</ul></div>';
  }).join('');
  return '<article class="ue-raid-day" data-raid-date="'+esc(day.date)+'"><h4>'+esc(label)+'</h4>'+panels+'</article>';
 }).join('');
 return '<div class="ue-raid-days"><h3 class="ue-mini-h">Raids &amp; Max Battles by day</h3><div class="ue-raid-day-grid">'+cards+'</div></div>';
}
function render(model,ctx){ctx=ctx||{};var view=V.project(model),fields=model.internalValidation&&model.internalValidation.fields||{},body={};
 var galleryOnly=!ctx.rotationHtml&&model.encounters.every(function(e){return e.method==='other';});
 body.encounters=section('evd-pokemon',galleryOnly?'Featured Pokémon':'Pokémon',(ctx.rotationHtml||'')+gallery(model,ctx));
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
 if(ctx.rotationHtml&&selected.indexOf('encounters')<0)selected.unshift('encounters');
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
 var overview=(ctx.overview||'')+schedulePreview(model,ctx)+raidDayRosters(ctx.raidDays,ctx)+sourceHighlights(model)+(info.length?'<h3 class="ue-mini-h">Highlights</h3><ul class="ue-facts ue-summary">'+info.filter(function(t){var k=String(t).toLowerCase().slice(0,40);return !model.tickets.some(function(x){return value(x).toLowerCase().indexOf(k)>=0;})&&!model.bonuses.some(function(x){return value(x).toLowerCase().indexOf(k)>=0;});}).slice(0,4).map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul>':'')+(incomplete||(model.completeness==='partial'&&selected.length<2)?'<p class="ue-more-note" role="note">More details to come. Only verified information is shown.</p>':'');
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
 var nav='<nav class="evd-nav" aria-label="Event sections"><div class="evd-nav-scroll">'+sections.map(function(t,i){return '<a class="evd-nav-link" href="#evd-s-'+t.id+'" data-sec="'+t.id+'"'+(i===0?' aria-current="true"':'')+'>'+esc(t.label)+(t.id==='research'&&view.researchTasks?' <span class="evd-nav-count">'+view.researchTasks+'</span>':'')+'</a>';}).join('')+'</div><span class="evd-nav-more" aria-hidden="true">›</span></nav>';
 var secs=sections.map(function(t){return '<section class="evd-sec" id="evd-s-'+t.id+'" aria-labelledby="evd-h-'+t.id+'" data-sec="'+t.id+'"><h2 class="evd-sec-h" id="evd-h-'+t.id+'" tabindex="-1">'+esc(t.label)+(t.id==='research'?' <small class="m evd-count">'+(view.researchTasks?view.researchTasks+(view.researchTasks===1?' task':' tasks'):'no tasks listed yet')+'</small>':'')+'</h2>'+dedupe(t.html)+'</section>';}).join('');
 return (ctx.toolbar||'')+hero+nav+'<div class="evd-sections">'+secs+'</div>';
}
return {render:render,gallery:gallery,rotations:function(model,ctx){return scheduledActivities(model,ctx,'rotation');},raidDayRosters:raidDayRosters,eggKm:eggKm};
}));
