var MAN={};
/* Keep the primary destinations usable while the initial data request is pending or unavailable. */
(function(){
  var nav=document.getElementById('tabs');if(!nav)return;
  var items=[['now','Today'],['events','Schedule'],['raids','Battle'],['collect','Collection']];
  nav.innerHTML=items.map(function(t,i){return '<button type="button" role="tab" data-boot-tab="'+t[0]+'" aria-controls="tab-'+t[0]+'" aria-selected="'+(i===0?'true':'false')+'"><span>'+t[1]+'</span></button>'}).join('');
  function hide(id){var el=document.getElementById(id);if(el)el.hidden=true}
  function show(id){
    ['now','events','raids','collect','saved'].forEach(function(k){var el=document.getElementById('tab-'+k);if(el)el.hidden=k!==id});
    Array.prototype.forEach.call(nav.querySelectorAll('[data-boot-tab]'),function(b){b.setAttribute('aria-selected',b.getAttribute('data-boot-tab')===id?'true':'false')});
    if(id==='events'){['sub-calendar','sub-leaks'].forEach(hide);var timeline=document.getElementById('sub-timeline');if(timeline)timeline.hidden=false;}
    if(id==='collect'){['sub-opps','sub-megas','sub-guides','sub-forms','sub-import','tab-best','tab-hundo'].forEach(hide);var dex=document.getElementById('sub-mydex');if(dex)dex.hidden=false;var species=document.getElementById('tab-dex');if(species)species.hidden=false;}
    try{localStorage.setItem('gofn-tab',id)}catch(e){}
    window.scrollTo(0,0);
  }
  function click(e){var b=e.target.closest?e.target.closest('[data-boot-tab]'):null;if(!b||!nav.contains(b))return;show(b.getAttribute('data-boot-tab'));}
  nav.addEventListener('click',click);
  window.__GOBootNavClear=function(){nav.removeEventListener('click',click);nav.innerHTML='';};
})();
function withTimeout(p,ms,label){return new Promise(function(resolve,reject){var timer=setTimeout(function(){reject(new Error(label+' timed out'))},ms);Promise.resolve(p).then(function(value){clearTimeout(timer);resolve(value)},function(error){clearTimeout(timer);reject(error)})})}
Promise.all([
  withTimeout(fetch('/data.json').then(function(r){if(!r.ok)throw new Error('data.json HTTP '+r.status);return r.json()}),12000,'Event data'),
  withTimeout(fetch('/art/index.json').then(function(r){return r.ok?r.json():{}}).catch(function(){return {}}),8000,'Artwork index').catch(function(){return {}})
]).then(function(R){var D=R[0];MAN=R[1]||{};
(function(){
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function $(id){return document.getElementById(id)}
  var NOW=new Date();
  // An art entry is a name, or {n:name, shiny:1, costume:1, asset:"COSTUME_ENUM", label:"Top hat"}.
  /* Pokémon Showdown file name for a species/form, e.g. "Alolan Ninetales" -> "ninetales-alola", "Mega Charizard X" -> "charizard-megax". */
  function sdId(name){
    var n=String(name||'').replace(/^(Dynamax|Shadow)\s+/i,'').trim(),sfx='';
    var g=n.match(/^Gigantamax\s+(.+)$/i); if(g){n=g[1];sfx='-gmax'}
    var mg=n.match(/^Mega\s+(.+?)(?:\s+([XY]))?$/i); if(mg){n=mg[1];sfx='-mega'+(mg[2]?mg[2].toLowerCase():'')}
    var pr=n.match(/^Primal\s+(.+)$/i); if(pr){n=pr[1];sfx='-primal'}
    var m=n.match(/^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i);
    if(m){sfx='-'+{alolan:'alola',galarian:'galar',hisuian:'hisui',paldean:'paldea'}[m[1].toLowerCase()]+sfx;n=m[2]}
    n=n.replace(/\(.*?\)/g,'').replace(/♀/g,'f').replace(/♂/g,'m').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    return n?n+sfx:'';
  }
  window.GOSD=sdId;
  /* Pictures are animated (Pokémon Showdown) wherever one exists; the still artwork is the fallback. Costume art is the game's own still icon. */
  var COSTPIC={},COSTSH={},GMX={},GMSH={};try{fetch('/costumes.json').then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.pictures&&Object.keys(j.pictures).length){COSTPIC=j.pictures;COSTSH=j.shiny||{};GMX=j.gmax||{};GMSH=j.gmaxShiny||{};setTimeout(function(){try{var need=[].some.call(document.querySelectorAll('img[data-ck]'),function(i){return COSTPIC[i.getAttribute('data-ck')]})||[].some.call(document.querySelectorAll('img[data-gk]'),function(i){return GMX[i.getAttribute('data-gk')]});if(need&&window.GODASH&&GODASH.renderAll)GODASH.renderAll()}catch(e){}},300)}}).catch(function(){})}catch(e){}
  function art(n,cls){
    var o=typeof n==='string'?{n:n}:n;
    var q='/api/art?n='+encodeURIComponent(o.n)+(o.shiny?'&shiny=1':'')+(o.shadow?'&shadow=1':'')+(o.dynamax?'&dynamax=1':'')+(o.asset?'&c='+encodeURIComponent(o.asset):'');
    var still=MAN[q]&&!o.asset?'/art/'+MAN[q]+'.webp':q;
    var alt=(o.shiny?'Shiny ':'')+(o.shadow&&!/^Shadow\s/i.test(o.n)?'Shadow ':'')+(o.dynamax&&!/^(Dynamax|Gigantamax)\s/i.test(o.n)?'Dynamax ':'')+o.n;
    var sd=''; /* still pictures only: the animated Showdown sprites were switched off */
    /* The still picture is what loads first, from this site, so there is never a blank or broken frame.
       The animated sprite is swapped in only while the picture is on screen (see GOANIM below). */
    var src=still;
    /* Costumes with no game-file picture: use one found and checked by scripts/costumes.mjs (costumes.json), else the plain picture. */
    var cks=String(o.n).toLowerCase()+'|'+String(o.label).toLowerCase();var gk=String(o.n).toLowerCase(),isg=!o.costume&&!o.asset&&/^gigantamax /.test(gk),gm=isg?((o.shiny&&GMSH[gk])||GMX[gk]||''):'';var dbx=(o.costume&&!o.asset&&o.label&&(o.shiny?COSTSH[cks]:COSTPIC[cks]))||gm;
    var cstill=dbx?still:'';if(dbx)src=dbx;
    var ck=(o.costume&&!o.asset&&o.label&&!dbx)?' data-ck="'+esc(String(o.n).toLowerCase()+'|'+String(o.label).toLowerCase())+'"':(isg&&!gm?' data-gk="'+esc(gk)+'"':'');
    var fb=cstill?' data-still="'+esc(cstill)+'" title="'+(gm?'Gigantamax picture: Serebii':'Costume picture: Serebii / Dittobase')+'"':sd?' data-still="'+esc(still)+'" data-gif="https://play.pokemonshowdown.com/sprites/'+(o.shiny?'ani-shiny':'ani')+'/'+sd+'.gif"':'';
    var tg=(o.costume||o.asset)?'':' data-sn="'+esc(o.n)+'"'+(o.shiny?' data-sv="1"':'')+(o.shadow?' data-ss="1"':'')+(o.dynamax?' data-sd="1"':'');
    return '<img class="art'+(sd?' ani':'')+(gm?' gm-real':'')+(cls?' '+cls:'')+'" loading="lazy" alt="'+esc(alt)+'" src="'+src+'"'+fb+tg+ck+' data-err="art"'+(cls==='in'?' data-load="has"':'')+'>';
  }
  /* Tap any Pokémon picture to flip it between its normal and shiny look; tap again to flip back. Costumes have no flip. */
  document.addEventListener('click',function(e){
    var i=e.target&&e.target.closest&&e.target.closest('img.art[data-sn]'); if(!i||i.closest('a,button,summary,select,label')||i.closest('#dexlist'))return;
    var sh=i.getAttribute('data-sv')!=='1', tmp=document.createElement('div');
    tmp.innerHTML=art({n:i.getAttribute('data-sn'),shiny:sh,shadow:i.hasAttribute('data-ss'),dynamax:i.hasAttribute('data-sd')},(i.className.match(/\b(ea|in|lg|sm)\b/)||[''])[0]);
    var n=tmp.firstChild; if(!n)return;
    /* Only swap once the other picture has loaded, so a missing shiny never leaves a blank. */
    var t=new Image(); t.onload=function(){ if(!i.isConnected)return; n.classList.toggle('is-shiny',sh); i.parentNode.replaceChild(n,i); if(window.GOANIM)GOANIM.scan(n.parentNode); }; t.src=n.getAttribute('data-still')||n.getAttribute('src');
  });
  window.GOARTERR=function(i){var s=i.getAttribute('data-still');if(s&&i.getAttribute('src')!==s){i.classList.remove('ani');i.src=s}else i.remove()};
  /* Animated sprites: swap one in only while it is visible, and back to the still when it scrolls away.
     A long list of animated pictures at once is what made the page stutter on phones. */
  (function(){
    var seen=typeof WeakSet!=='undefined'?new WeakSet():null;
    function play(i){
      var g=i.getAttribute('data-gif');if(!g||i.__bad)return;
      if(i.getAttribute('src')===g)return;
      var t=new Image();t.onload=function(){if(i.__vis!==false&&i.isConnected)i.src=g};t.onerror=function(){i.__bad=true};t.src=g;
    }
    function rest(i){var s=i.getAttribute('data-still');if(s&&i.getAttribute('src')!==s)i.src=s}
    var io='IntersectionObserver' in window?new IntersectionObserver(function(es){es.forEach(function(e){var i=e.target;i.__vis=e.isIntersecting;if(e.isIntersecting)play(i);else rest(i)})},{rootMargin:'400px'}):null;
    function watch(i){if(seen){if(seen.has(i))return;seen.add(i)}i.classList.add('ani');if(io)io.observe(i);else play(i)}
    var PHQ='.max-art,.shadow-art,img.art[alt^="Shadow "],img.art[alt^="Dynamax "],img.art[alt^="Gigantamax "]';
    function phase(n){var l=n.matches&&n.matches(PHQ)?[n]:[];if(n.querySelectorAll)l=l.concat([].slice.call(n.querySelectorAll(PHQ)));l.forEach(function(e){if(!e.style.getPropertyValue('--ph'))e.style.setProperty('--ph',(-Math.random()*4).toFixed(2)+'s')})}
    function scan(n){if(!n||n.nodeType!==1)return;phase(n);if(n.matches&&n.matches('img[data-gif]'))watch(n);var l=n.querySelectorAll?n.querySelectorAll('img[data-gif]'):[];for(var k=0;k<l.length;k++)watch(l[k])}
    new MutationObserver(function(ms){ms.forEach(function(m){for(var k=0;k<m.addedNodes.length;k++)scan(m.addedNodes[k])})}).observe(document.documentElement,{childList:true,subtree:true});
    scan(document.body);
    window.GOANIM={scan:scan};
  })();
  function fig(n,cls){
    var o=typeof n==='string'?{n:n}:n;
    var tags=(o.shiny?'<span class="pill p-shiny">Shiny</span>':'')+(o.costume?'<span class="pill p-costume">Costume</span>':'');
    return '<figure class="fig">'+art(o,cls)+(tags?'<span class="ftags">'+tags+'</span>':'')+'<figcaption><b>'+esc(o.n)+'</b>'+(o.label?'<i>'+esc(o.label)+'</i>':'')+'</figcaption></figure>';
  }
  function artRow(list,cls){return list&&list.length?'<div class="arts">'+list.map(function(n){return fig(n,cls)}).join('')+'</div>':''}
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  $('today').textContent=(DOW[NOW.getDay()]+' '+NOW.getDate()+' '+MON[NOW.getMonth()]+' '+NOW.getFullYear()).toUpperCase();

  var TAGKEY={'Community Day':'cd','Raids':'raid','Max Battles':'max','Shiny':'shiny','Debut':'debut','Background':'bg','In person':'person','Costume':'costume','Shadow':'shadow','Mega':'mega','Primal':'primal'};
  var ICONS={
    cd:'<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    raid:'<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
    max:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    shiny:'<path d="M12 3c.6 4.5 2.5 6.4 7 7-4.5.6-6.4 2.5-7 7-.6-4.5-2.5-6.4-7-7 4.5-.6 6.4-2.5 7-7z"/>',
    debut:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    bg:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
    person:'<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    costume:'<path d="M4 18h16M7 18V8h10v10M7 13h10"/>',
    shadow:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 000 16z" fill="currentColor"/>',
    mega:'<path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"/>',
    primal:'<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'
  };
  function icon(t){var k=TAGKEY[t];return k?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS[k]+'</svg>':''}
  function tagHtml(t,label){var k=TAGKEY[t]||'x';return '<span class="pill p-'+k+'">'+icon(t)+esc(label||t)+'</span>'}


  /* ---------- bonus icons (drawn here, no game artwork) ---------- */
  var BI={
    xp:'<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    candy:'<circle cx="12" cy="12" r="5"/><path d="M7.5 9.5L3 7v10l4.5-2.5M16.5 9.5L21 7v10l-4.5-2.5"/>',
    dust:'<circle cx="7" cy="8" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="12" cy="13" r="2" fill="currentColor"/><circle cx="19" cy="14" r="1.4" fill="currentColor"/><circle cx="8" cy="18" r="1.4" fill="currentColor"/>',
    egg:'<path d="M12 3c-3.5 0-6 5-6 9a6 6 0 0012 0c0-4-2.5-9-6-9z"/>',
    trade:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    lure:'<path d="M12 3c3 3 5 5 5 9a5 5 0 01-10 0c0-4 2-6 5-9z"/><path d="M12 14v4"/>',
    incense:'<path d="M9 21h6M12 21V10M12 10c-2.2-2-2.2-4.4 0-7 2.2 2.6 2.2 5 0 7z"/>',
    pass:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 6v12" stroke-dasharray="2 2"/>',
    particle:'<path d="M12 3l7 4v10l-7 4-7-4V7z"/>',
    spawn:'<path d="M5 20c0-6 3-9 7-9s7 3 7 9M12 11V5"/>',
    damage:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    mega:'<path d="M4 19V5l8 8 8-8v14"/>',
    distance:'<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
    time:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    shiny:'<path d="M12 3c.6 4.5 2.5 6.4 7 7-4.5.6-6.4 2.5-7 7-.6-4.5-2.5-6.4-7-7 4.5-.6 6.4-2.5 7-7z"/>',
    star:'<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>'
  };
  function bonusKind(t){
    t=String(t||'');
    if(/shiny/i.test(t))return 'shiny';
    if(/stardust|star\s*dust/i.test(t))return 'dust';
    if(/\bmega energy\b/i.test(t))return 'mega';
    if(/remote raid damage|raid damage|damage dealt|damage increased/i.test(t))return 'damage';
    if(/hatch distance|egg distance|half hatch|egg hatch|\beggs?\b|hatch/i.test(t))return /distance|half/i.test(t)?'distance':'egg';
    if(/\bxp\b|experience/i.test(t))return 'xp';
    if(/candy|transfer bonus/i.test(t))return 'candy';
    if(/trade|special trade/i.test(t))return 'trade';
    if(/incense/i.test(t))return 'incense';
    if(/lure/i.test(t))return 'lure';
    if(/raid pass|free pass|additional pass/i.test(t))return 'pass';
    if(/particle|power spot|max battle/i.test(t))return 'particle';
    if(/spawn|wild encounter/i.test(t))return 'spawn';
    if(/\d\s*(am|pm)|hour/i.test(t))return 'time';
    return 'star';
  }
  /* The game's own icons (type badges, weather, eggs) dropped inline into plain text. Input is already HTML-escaped. */
  var TYPES='normal fighting flying poison ground rock bug ghost steel fire water grass electric psychic ice dragon dark fairy'.split('|').join(' ');
  var WX={sunny:'sunny',clear:'sunny','partly cloudy':'partly',cloudy:'cloudy',overcast:'cloudy',rainy:'rain',rain:'rain',snowy:'snow',snow:'snow',foggy:'fog',fog:'fog',windy:'windy',wind:'windy'};
  function typeImg(t){t=t.toLowerCase();return '<img class="ti" src="/ico/g/type-'+t+'.webp" alt="'+t+'" title="'+t+' type" loading="lazy">'}
  function rich(h){
    h=String(h);
    if(window.GOLIB&&window.GOLIB.audify)h=window.GOLIB.audify(h);
    h=h.replace(/\b(Normal|Fighting|Flying|Poison|Ground|Rock|Bug|Ghost|Steel|Fire|Water|Grass|Electric|Psychic|Ice|Dragon|Dark|Fairy)(-| )types?\b/g,function(m,t){return typeImg(t)+m});
    h=h.replace(/\b(Sunny|Clear|Partly cloudy|Cloudy|Overcast|Rainy|Snowy|Foggy|Windy)(\/(?:Sunny|Clear|Partly cloudy|Cloudy|Overcast|Rainy|Snowy|Foggy|Windy))* weather\b/gi,function(m,w){var k=WX[w.toLowerCase()];return k?'<img class="ti wx" src="/ico/g/wx-'+k+'.webp" alt="" title="Weather boost" loading="lazy">'+m:m});
    h=h.replace(/\b(Power Spots?|Max Particles?)\b/g,function(m){var X=window.GODASH,u=X&&(/Power/.test(m)?X.IMG_POWERSPOT:X.IMG_PARTICLE);return u?'<img class="ti gi-pic" src="'+u+'" alt="" loading="lazy" data-err="rm">'+m:m});
    h=h.replace(/\b(2|5|7|10|12) ?km eggs?\b/gi,function(m,k){return '<img class="ti egg" src="/ico/g/egg-'+k+'km.webp" alt="" loading="lazy">'+m});
    return h;
  }
  window.GORICH=rich;
  var GI={candy:1,dust:1,xp:1,egg:1,trade:1,incense:1,pass:1,shiny:1};
  function giIcons(t,k){
    // Incense and shiny can both apply ("Incense: boosted shiny ..."): show both icons; "boosted" shiny gets a + badge.
    var out='';
    if(/incense/i.test(t))out+='<img class="gi" src="/ico/incense.webp" alt="Incense" loading="lazy">';
    if(/shiny/i.test(t))out+='<span class="gi-wrap"><img class="gi" src="/ico/shiny.webp" alt="Shiny" loading="lazy">'+(/boost|increase|higher|more|better/i.test(t)?'<i class="gi-plus" aria-label="boosted">+</i>':'')+'</span>';
    if(out)return out;
    var km=String(t).match(/\b(2|5|7|10|12) ?km\b/);
    if(km&&/egg|hatch/i.test(t))return '<img class="gi" src="/ico/g/egg-'+km[1]+'km.webp" alt="" loading="lazy">';
    if(/transfer/i.test(t)&&/candy/i.test(t))return '<img class="gi gi-trade" src="/ico/trade.webp" alt="Transfer" loading="lazy"><img class="gi" src="/ico/candy.webp" alt="" loading="lazy">';
    if(/shadow/i.test(t))return '<img class="gi" src="/ico/g/shadow.webp" alt="" loading="lazy">';
    if(/mega energy|mega evol/i.test(t))return '<img class="gi" src="/ico/g/mega.webp" alt="" loading="lazy">';
    if(/raid hour|raid day|raid boss/i.test(t))return '<img class="gi" src="/ico/g/raid.webp" alt="" loading="lazy">';
    return GI[k]?'<img class="gi" src="/ico/'+k+'.webp" alt="" loading="lazy">':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+BI[k]+'</svg>';
  }
  function bonusChip(t){
    var m=String(t).match(/^(\d+(?:\.\d+)?x|half|up to \d+)\s+(.*)$/i);
    var k=bonusKind(t);
    return '<span class="bonus bonus-'+k+'">'+giIcons(t,k)
      +(m?'<b>'+esc(m[1])+'</b><span>'+rich(esc(m[2]))+'</span>':'<span>'+rich(esc(t))+'</span>')+'</span>';
  }
  function bonusRow(list){return list&&list.length?'<div class="bonuses">'+list.map(bonusChip).join('')+'</div>':''}

  /* ---------- tabs: five main sections, some with sub-views ---------- */
  var TABS=[
    ['now','Today','M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z'],
    ['events','Schedule','M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'],
    ['raids','Battle','M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z'],
    ['collect','Collection','M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9']
  ];
  /* Saved is a global utility opened from the header, not a fifth destination in the primary navigation. */
  var PANEL_IDS=['now','events','raids','collect','saved'];
  // Three views per tab. Some views have a second-level filter (MODES) over existing sections.
  var SUBS={
    events:[['calendar','Calendar','sub-calendar'],['timeline','Timeline','sub-timeline'],['leaks','Discoveries','sub-leaks','menu']],
    collect:[['dex','My Dex','sub-mydex'],['opps','Opportunities','sub-opps','menu'],['megas','Megas','sub-megas'],['guides','Guides','sub-guides']],
    saved:[['watch','Watchlist','sub-watch'],['menu','Menu','sub-menu']]
  };
  var MODES={
    'collect/dex':[['species','Species','tab-dex'],['forms','Forms','sub-forms'],['import','Add from screenshots','sub-import']],
    'collect/guides':[['best','Best attackers','tab-best'],['hundo','Hundo guide','tab-hundo']]
  };
  // Old saved locations still open the right place.
  var LEGACY={upcoming:['events','leaks'],person:['events','calendar'],dex:['collect','dex','species'],best:['collect','guides','best'],hundo:['collect','guides','hundo']};
  var LEGACYSUB={'events/world':['calendar'],'events/coming':['calendar'],'collect/forms':['dex','forms'],'collect/import':['dex','import'],'collect/best':['guides','best'],'collect/hundo':['guides','hundo']};
  var tabsEl=$('tabs'),curTab='now',curSub={events:'timeline',collect:'dex',saved:'watch'},curMode={'collect/dex':'species','collect/guides':'best'};
  if(window.__GOBootNavClear)window.__GOBootNavClear();
  TABS.forEach(function(t,i){
    var b=document.createElement('button');
    b.type='button';b.setAttribute('role','tab');b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+t[2]+'"/></svg><span>'+t[1]+'</span>';b.dataset.tab=t[0];
    b.setAttribute('aria-selected',i===0?'true':'false');
    b.addEventListener('click',function(){showTab(t[0])});
    tabsEl.appendChild(b);
  });
  Object.keys(SUBS).forEach(function(k){
    var bar=$('subnav-'+k);if(!bar)return;
    SUBS[k].forEach(function(sv){
      if(sv[3]==='menu')return;
      var b=document.createElement('button');b.type='button';b.textContent=sv[1];b.dataset.sub=sv[0];
      b.addEventListener('click',function(){showTab(k,sv[0])});
      bar.appendChild(b);
    });
  });
  Object.keys(MODES).forEach(function(key){
    var bar=$('mode-'+key.replace('/','-'));if(!bar)return;var p=key.split('/');
    MODES[key].forEach(function(mv){
      var b=document.createElement('button');b.type='button';b.textContent=mv[1];b.dataset.mode=mv[0];
      b.addEventListener('click',function(){showTab(p[0],p[1],mv[0])});
      bar.appendChild(b);
    });
  });
  function showTab(id,sub,mode){
    if(LEGACY[id]){var L=LEGACY[id];id=L[0];sub=L[1];mode=L[2]||mode}
    else if(sub&&LEGACYSUB[id+'/'+sub]){var L2=LEGACYSUB[id+'/'+sub];sub=L2[0];mode=L2[1]}
    if(!$('tab-'+id))id='now';
    curTab=id;if(sub&&SUBS[id]&&SUBS[id].some(function(x){return x[0]===sub}))curSub[id]=sub;
    if(mode&&MODES[id+'/'+curSub[id]])curMode[id+'/'+curSub[id]]=mode;
    PANEL_IDS.forEach(function(panel){var el=$('tab-'+panel);if(el)el.hidden=panel!==id});
    Array.prototype.forEach.call(tabsEl.children,function(b){b.setAttribute('aria-selected',b.dataset.tab===id?'true':'false')});
    $('hwatch').setAttribute('aria-pressed',id==='saved'&&curSub.saved==='watch'?'true':'false');$('hmenu').setAttribute('aria-pressed',id==='saved'&&curSub.saved==='menu'?'true':'false');
    Object.keys(SUBS).forEach(function(k){
      SUBS[k].forEach(function(sv){var el=$(sv[2]);if(el)el.hidden=!(k===id&&curSub[k]===sv[0])});
      var bar=$('subnav-'+k);if(bar)Array.prototype.forEach.call(bar.children,function(b){b.setAttribute('aria-pressed',curSub[k]===b.dataset.sub?'true':'false')});
    });
    Object.keys(MODES).forEach(function(key){
      var p=key.split('/'),on=p[0]===id&&curSub[p[0]]===p[1];
      MODES[key].forEach(function(mv){var el=$(mv[2]);if(el)el.hidden=!(on&&curMode[key]===mv[0])});
      var bar=$('mode-'+key.replace('/','-'));if(bar){bar.hidden=!on;Array.prototype.forEach.call(bar.children,function(b){b.setAttribute('aria-pressed',curMode[key]===b.dataset.mode?'true':'false')})}
    });
    var key2=id+'/'+curSub[id];
    try{localStorage.setItem('gofn-tab',id+(SUBS[id]?'/'+curSub[id]+(MODES[key2]?'/'+curMode[key2]:''):''))}catch(e){}
    document.dispatchEvent(new CustomEvent('gofn-view',{detail:{tab:id,sub:curSub[id]||'',mode:curMode[key2]||''}}));
    if(!sub||arguments.length<3)window.scrollTo(0,0);
  }
  // Back button / swipe-back: stay inside the app. An open detail or infographic closes first; from any other tab Back goes to Now;
  // only from Now does Back leave the site. Tabs use no history entries of their own, so one Back is always one step.
  window.GONAV={depth:0,internal:false,
    push:function(){this.depth++;try{history.pushState({gofn:'overlay',d:this.depth},'')}catch(e){this.depth--}},
    popped:function(){if(this.depth>0){this.depth--;this.internal=true;try{history.back()}catch(e){this.internal=false}}}};
  (function(){
    try{
      var st=history.state;
      if(st&&st.gofn==='overlay')history.replaceState({gofn:'app'},'');
      else if(!(st&&st.gofn==='app')){history.replaceState({gofn:'base'},'');history.pushState({gofn:'app'},'')}
    }catch(e){}
    window.addEventListener('popstate',function(e){
      var N=window.GONAV;
      if(N.internal){N.internal=false;return}
      if(N.depth>0){
        var g=document.getElementById('goinfo'),d=document.getElementById('evd');
        if(g&&!g.hidden&&window.GOINFOGRAPHIC)window.GOINFOGRAPHIC.close(true);
        else if(d&&!d.hidden&&window.GOEVD)window.GOEVD.close(true);
        N.depth--;return;
      }
      var st=e.state||{};
      if(st.gofn==='base'){
        if(curTab!=='now'){showTab('now');try{history.pushState({gofn:'app'},'')}catch(x){}}
        else{try{history.back()}catch(x){}}
      }
    });
  })();
  $('hwatch').addEventListener('click',function(){showTab('saved','watch')});
  $('hmenu').addEventListener('click',function(){showTab('saved','menu')});
  $('menu-leaks').addEventListener('click',function(){showTab('events','leaks')});
  (function(){
    function upd(){var n=document.querySelectorAll('#followed > *, #savedev > *').length,c=$('wlcount');
      var real=document.querySelectorAll('#followed .evc, #followed .drow, #followed .row, #savedev .evc, #savedev article, #savedev .card').length;
      n=real||n;c.textContent=n;c.hidden=!n;$('hwatch').setAttribute('aria-label','Watchlist'+(n?', '+n+' items':''))}
    ['followed','savedev'].forEach(function(id){var el=$(id);if(el)new MutationObserver(upd).observe(el,{childList:true})});upd();
  })();
  var firstTab=null;
  try{var st=localStorage.getItem('gofn-tab');if(st){var pp=st.split('/');firstTab=[pp[0],pp[1],pp[2]]}}catch(e){}
  if(firstTab&&(LEGACY[firstTab[0]]||$('tab-'+firstTab[0])))showTab(firstTab[0],firstTab[1],firstTab[2]);else showTab('now');
  /* Deep links: #planner opens the Purchase planner; #tab=events/calendar (or just #tab=saved) opens that tab. */
  function deepLink(){
    var h=location.hash||'',m=/^#tab=([a-z]+)(?:\/([a-z]+))?(?:\/([a-z]+))?$/.exec(h);
    if(m&&(LEGACY[m[1]]||$('tab-'+m[1])))showTab(m[1],m[2],m[3]);
    else if(h==='#planner'){
      showTab('now');
      var n=0,t=setInterval(function(){var sec=$('buy-sec');
        if((sec&&!sec.hidden)||++n>40){clearInterval(t);if(sec&&!sec.hidden){var d=sec.querySelector('details');if(d)d.open=true;sec.scrollIntoView({block:'start'})}}},250);
    }
  }
  deepLink();window.addEventListener('hashchange',deepLink);

  /* ---------- events ---------- */
  var EVENTS=D.events;
  var SPOT=D.spotlight;
  var RAIDHR=D.raidHour;
  var WEEK=D.week;
  var HERO={cd:['#F76B15','#1A0E04'],raid:['#D7373C','#FFFFFF'],max:['#6E56CF','#FFFFFF'],shiny:['#FFD43B','#1D1700'],debut:['#12A594','#031F1B'],bg:['#C2338F','#FFFFFF'],person:['#3E63DD','#FFFFFF'],costume:['#FF8FB1','#2A0A15']};

  function pd(s){return new Date(s)}
  function fmtD(d){return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]}
  function fmtT(d){var h=d.getHours(),m=d.getMinutes(),ap=h>=12?'pm':'am';h=h%12||12;return h+(m?':'+('0'+m).slice(-2):'')+' '+ap}
  function rangeText(s,e){
    var a=pd(s),b=pd(e);
    var sameDay=a.toDateString()===b.toDateString();
    var allDay=a.getHours()===0&&b.getHours()===23;
    if(sameDay) return allDay?fmtD(a):fmtD(a)+', '+fmtT(a)+' to '+fmtT(b);
    return fmtD(a)+(a.getHours()===0&&a.getMinutes()===0?'':' '+fmtT(a))+' to '+fmtD(b)+(b.getHours()===23?'':' '+fmtT(b));
  }
  function status(ev){
    var s=pd(ev.s),e=pd(ev.e);
    if(NOW>e) return {k:'end',t:'Ended'};
    if(NOW>=s) return {k:'live',t:'Live now'};
    var days=Math.ceil((s-NOW)/864e5);
    var sameDay=s.toDateString()===NOW.toDateString();
    var tmw=new Date(NOW.getFullYear(),NOW.getMonth(),NOW.getDate()+1).toDateString()===s.toDateString();
    return {k:'up',t:sameDay?'Today':tmw?'Tomorrow':'In '+days+' days'};
  }

  var todayDow=NOW.getDay();
  $('week').innerHTML=[1,2,3,4,5,6,0].map(function(i){
    return '<div class="day'+(i===todayDow?' today':'')+'"><b>'+WEEK[i][0]+(i===todayDow?' · today':'')+'</b><span>'+esc(WEEK[i][1])+'</span></div>';
  }).join('');

  var nextSpot=SPOT.filter(function(x){return pd(x.d+'T19:00')>=NOW})[0];
  var nextRH=RAIDHR.filter(function(x){return pd(x.d+'T19:00')>=NOW})[0];
  var cd=EVENTS.filter(function(x){return x.tags.indexOf('Community Day')>-1&&status(x).k!=='end'})[0];
  $('spot').innerHTML=
    '<div class="block"><p class="label">Next Spotlight Hour</p>'+(nextSpot?art(nextSpot.n,'nx')+'<p class="big" style="margin-top:8px">'+esc(nextSpot.n)+'</p><p class="muted" style="margin-top:6px">'+fmtD(pd(nextSpot.d+'T12:00'))+', 6 to 7 pm</p>'+bonusRow([nextSpot.b]):'<p>No more listed this month.</p>')+'</div>'
   +'<div class="block"><p class="label">Next Raid Hour</p>'+(nextRH?art(nextRH.n,'nx')+'<p class="big" style="margin-top:8px">'+esc(nextRH.n)+'</p><p class="muted" style="margin-top:6px">'+fmtD(pd(nextRH.d+'T12:00'))+', 6 to 7 pm</p>':'<p>No more listed this month.</p>')+'</div>'
   +'<div class="block"><p class="label">Next Community Day</p>'+(cd?art(cd.t.replace(' Community Day',''),'nx')+'<p class="big" style="margin-top:8px">'+esc(cd.t.replace(' Community Day',''))+'</p><p class="muted" style="margin-top:6px">'+esc(rangeText(cd.s,cd.e))+'</p>':'<p>None listed.</p>')+'</div>';

  /* Raid and Max Battle schedules are rendered together by dash.js. */

  /* ---------- in person ---------- */
  $('inperson').innerHTML=D.inPerson.map(function(p){
    return '<article class="block" style="display:flex;flex-direction:column;gap:10px"><div class="chips">'+p.tags.map(function(t){return tagHtml(t)}).join('')+'</div><h3 style="font-size:2.4rem">'+esc(p.title)+'</h3>'
     +(p.art?'<div class="arts">'+p.art.map(function(n){return fig(n)}).join('')+'</div>':'')
     +'<p class="mono muted">'+esc(p.when)+'</p><ul class="plain">'+p.bullets.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>'+(p.placesQ?'<p><button type="button" class="pill all" data-places="" data-placesq="'+esc(p.placesQ)+'">📍 Where it is and coordinates</button></p>':'')+'</article>';
  }).join('');
  var WE=(D.worldEvents||[]).slice(),wsel='all';
  function ymd2(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function wdate(s,e){
    var a=new Date(s+'T12:00'),b=e?new Date(e+'T12:00'):null;
    if(!e)return 'From '+MON[a.getMonth()]+' '+a.getDate()+', '+a.getFullYear();
    if(s===e)return MON[a.getMonth()]+' '+a.getDate()+', '+a.getFullYear();
    if(a.getFullYear()!==b.getFullYear()||b-a>40*864e5)return MON[a.getMonth()]+' '+a.getDate()+', '+a.getFullYear()+' to '+MON[b.getMonth()]+' '+b.getDate()+', '+b.getFullYear();
    return MON[a.getMonth()]+' '+a.getDate()+(a.getMonth()===b.getMonth()?' to '+b.getDate():' to '+MON[b.getMonth()]+' '+b.getDate())+', '+b.getFullYear();
  }
  function wcard(e,today){
    var a=new Date(e.s+'T12:00'),days=Math.round((a-new Date(today+'T12:00'))/864e5);
    var tag=e.s<=today&&(!e.e||e.e>=today)?'<span class="st st-a">On now</span>':(days>0?'<span class="st st-n">In '+days+' day'+(days===1?'':'s')+'</span>':'');
    var au=e.region==='Global'?'<span class="st st-d">Play from here</span>':e.region==='Oceania'?'<span class="st st-a">Australia and Oceania</span>':'';
    return '<li><b>'+(e.link?'<a href="'+esc(e.link)+'" target="_blank" rel="noopener noreferrer" style="color:inherit">'+esc(e.t)+'</a>':esc(e.t))+'</b><span class="when">'+esc(wdate(e.s,e.e))+'</span><span class="where">'+esc(e.where)+'</span>'+(e.note?'<i>'+esc(e.note)+'</i>':'')+'<span class="chips" style="margin-top:6px">'+tag+au+'</span></li>';
  }
  function renderWorld(){
    var today=ymd2(new Date());
    var list=WE.filter(function(e){return (e.e||'9999')>=today});
    var ok=function(e){return wsel==='all'||(wsel==='au'?(e.region==='Oceania'||e.region==='Global'):e.region===wsel)};
    var au=list.filter(function(e){return e.region==='Oceania'||e.region==='Global'}).sort(function(x,y){return x.s<y.s?-1:1});
    var live=list.filter(function(e){return e.kind!=='long'&&ok(e)}).sort(function(x,y){return x.s<y.s?-1:1});
    var long=list.filter(function(e){return e.kind==='long'&&ok(e)});
    var h='<div class="block" style="margin-bottom:14px"><h3 class="wreg" style="margin-top:0">Australia and Oceania</h3>'+
      (list.filter(function(e){return e.region==='Oceania'}).length?'<ul class="wlist">'+list.filter(function(e){return e.region==='Oceania'}).map(function(e){return wcard(e,today)}).join('')+'</ul>':'<p class="sub">Nothing on in Australia or Oceania right now.</p>')+
      (au.filter(function(e){return e.region==='Global'}).length?'<p class="sub" style="margin-top:10px">You can still play these from Melbourne: '+au.filter(function(e){return e.region==='Global'}).map(function(e){return esc(e.t)+' ('+esc(wdate(e.s,e.e))+')'}).join(', ')+'.</p>':'')+'</div>';
    h+='<div class="chips" id="wchips" style="margin-bottom:6px">'+[['all','All'],['au','Play from Australia'],['Asia','Asia'],['Americas','Americas'],['Europe','Europe']].map(function(c){return '<button type="button" class="pill '+(wsel===c[0]?'all':'p-x')+'" data-w="'+c[0]+'" aria-pressed="'+(wsel===c[0])+'">'+c[1]+'</button>'}).join('')+'</div>';
    h+=live.length?'<h3 class="wreg">Events</h3><ul class="wlist">'+live.map(function(e){return wcard(e,today)}).join('')+'</ul>':'<p class="sub">Nothing matches.</p>';
    if(long.length)h+='<h3 class="wreg">Long running</h3><ul class="wlist">'+long.map(function(e){return wcard(e,today)}).join('')+'</ul>';
    $('world').innerHTML=h;
  }
  $('world').addEventListener('click',function(ev){var b=ev.target.closest('[data-w]');if(!b)return;wsel=b.dataset.w;renderWorld()});
  renderWorld();
  fetch('/api/world').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(R){
    var have={};WE.forEach(function(e){if(e.link)have[e.link]=1});var added=0;
    (R.events||[]).forEach(function(e){
      if(have[e.link]||new Date(e.e||e.s)<new Date())return;
      WE.push({t:e.t.replace(/^Pokémon GO /,''),where:'See the event page for the place',region:'Other',s:e.s.slice(0,10),e:(e.e||e.s).slice(0,10),link:e.link,note:'Added automatically from Leek Duck. The date is the start in UTC, so it may be a day out locally.',kind:'event'});added++;
    });
    if(added)renderWorld();
  }).catch(function(){});
  $('worldnote').textContent=D.worldNote||'';
  $('fests').innerHTML=D.pastFests.map(function(f){return '<tr><td>'+esc(f[0])+'</td><td>'+esc(f[1])+'</td><td>'+esc(f[2])+'</td></tr>'}).join('');


  /* ---------- calendar subscription ---------- */
  (function(){
    var url=location.origin+'/api/calendar.ics';
    $('calurl').value=url;$('calsub').href=url.replace(/^https?:/,'webcal:');
    $('calurl').addEventListener('focus',function(){this.select()});
    try{localStorage.removeItem('gofn-daily')}catch(e){}
  })();

  /* ---------- upcoming ---------- */
  var U=D.upcoming;
  var KP={Mega:'mega',Dynamax:'max',Gigantamax:'giga'};
  var actualDebuts=U.announced.filter(function(x){var note=String(x.note||'');return /\bdebut(?:s|ed)?\b/i.test(note)&&!/\bnot a debut\b/i.test(note);});
  $('up-announced').innerHTML=actualDebuts.length?actualDebuts.map(function(x){
    return '<article class="block" style="display:flex;flex-direction:column;gap:10px"><div class="chips"><span class="pill p-'+(KP[x.kind]||'x')+'">'+esc(x.kind)+'</span></div>'
      +'<h3 style="font-size:2rem">'+esc(x.name)+'</h3>'+artRow(x.art)+'<p class="mono muted">'+esc(x.when)+'</p><p>'+esc(x.note)+'</p></article>';
  }).join(''):'<p class="empty">No confirmed Pokémon debuts are listed yet.</p>';
  var STC={'Released':'r','Announced':'a','Datamined':'d','Not announced':'n'};
  var OVER={};
  function tile(x,leak){
    var arts=x.art===undefined?[x.n]:x.art;
    var im=arts.length?art(arts[0]):'';
    var note=x.note||'';
    if(x.when)note=(note?note+' ':'')+'('+fmtTs(x.when)+')';
    var src=x.srcUrl?'<i><a href="'+esc(x.srcUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(x.srcLabel||'Source')+'</a></i>':(x.srcLabel?'<i>'+esc(x.srcLabel)+'</i>':'');
    return '<div class="ut'+(!arts.length||note.length>60||src?' wide':'')+(leak?' lk':'')+'">'+im+'<span class="tx"><b>'+esc(x.n)+'</b>'+(leak?'<u class="lkt">'+esc(leak)+', not confirmed</u>':'')+(note?'<i>'+esc(note)+'</i>':'')+src+'</span></div>';
  }
  function renderDD(){
    $('up-dd').innerHTML=U.dd.map(function(s){
      var items=[],blurb={},empty={};
      s.groups.forEach(function(g){
        if(g.blurb)blurb[g.status]=g.blurb;if(g.empty)empty[g.status]=g.empty;
        (g.items||[]).forEach(function(i){items.push({i:i,g:'',base:g.status})});
        (g.groups||[]).forEach(function(sub){sub.items.forEach(function(i){items.push({i:i,g:sub.label,base:g.status,sb:sub.blurb})})});
      });
      var body=['Released','Announced','Datamined','Not announced'].map(function(st){
        var list=items.filter(function(x){var o=OVER[s.id+'|'+x.i.n];return ((o&&o.status)||x.base)===st});
        if(!list.length&&(st==='Released'||st==='Not announced'))return '';
        var h='<div><h4><span class="st st-'+STC[st]+'">'+(st==='Released'?'Now in GO':esc(st))+'</span><span class="mono muted">'+list.length+'</span></h4>';
        if(blurb[st])h+='<p class="sub">'+esc(blurb[st])+'</p>';
        if(!list.length)return h+'<p class="sub">'+esc(empty[st]||'None.')+'</p></div>';
        var labels=[];list.forEach(function(x){if(labels.indexOf(x.g)<0)labels.push(x.g)});
        labels.forEach(function(L){
          var sub=list.filter(function(x){return x.g===L});
          if(L)h+='<p class="lab">'+esc(L)+'</p>'+(sub[0].sb?'<p class="sub">'+esc(sub[0].sb)+'</p>':'');
          h+='<div class="utiles">'+sub.map(function(x){var o=OVER[s.id+'|'+x.i.n]||{};return tile(Object.assign({},x.i,o.status==='Released'?{note:'Now in Pokémon GO',srcLabel:o.srcLabel}:{when:o.when,srcLabel:o.srcLabel,srcUrl:o.srcUrl}),(st==='Datamined'||st==='Not announced')?st:'')}).join('')+'</div>';
        });
        return h+'</div>';
      }).join('');
      return '<details class="dd" data-id="'+esc(s.id)+'"><summary>'+esc(s.title)+' <span class="cnt">'+items.length+'</span></summary><div class="body"><p class="sub" style="margin:0">'+esc(s.blurb)+'</p>'+body+'</div></details>';
    }).join('');
  }
  renderDD();
  // "This week": what changed in the last 7 days, from the status log, the game-file finds, datamine posts and the Discord datamine feed.
  var W={};
  function weekDraw(){
    if(!W.R&&!W.M&&!W.N)return;
    var host=$('up-watch');if(!host)return;
    var now=Date.now(),wk=7*864e5,box=$('up-week');
    if(!box){box=document.createElement('details');box.id='up-week';box.className='dd';box.open=true;box.innerHTML='<summary>This week <span class="cnt"></span></summary><div class="body"></div>';host.insertBefore(box,host.firstChild)}
    var ch=((W.R&&W.R.changes)||[]).filter(function(c){return c.at>=now-wk}).sort(function(a,b){return b.at-a.at});
    var rel=ch.filter(function(c){return c.to==='Released'}),up=ch.filter(function(c){return c.to!=='Released'});
    var KIND={pokemon:'New Pokémon or form',mega:'New Mega or Primal data',move:'New move'};
    var finds=((W.M&&W.M.items)||[]).filter(function(x){return x.seen>=now-wk}).sort(function(a,b){return b.seen-a.seen});
    var posts=[];
    ((W.M&&W.M.posts)||[]).forEach(function(p){if(p.date&&p.date>=now-wk)posts.push({t:p.title,l:p.link,d:p.date,src:'Pokémon GO Hub'})});
    ((W.N&&W.N.items)||[]).forEach(function(p){var d=Date.parse(p.date);if(d>=now-wk)posts.push({t:p.title,l:p.link,d:d,src:p.src==='events'?'PokéMiners event info':p.src==='reports'?'PokéMiners report':'PokéMiners game data'})});
    posts.sort(function(a,b){return b.d-a.d});posts=posts.slice(0,6);
    function link(u,t){return /^https?:\/\//i.test(u||'')?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer"><b>'+esc(t)+'</b></a>':'<b>'+esc(t)+'</b>'}
    function sec(title,cls,rows){return rows.length?'<div><h4><span class="st '+cls+'">'+esc(title)+'</span><span class="mono muted">'+rows.length+'</span></h4><ul class="wlist">'+rows.join('')+'</ul></div>':''}
    var h='<p class="sub" style="margin:0">The last 7 days. Datamined items are unconfirmed and may never ship.</p>';
    h+=sec('Now in Pokémon GO','st-a',rel.map(function(c){return '<li><b>'+esc(c.n)+'</b><span class="when">'+fmtTs(c.at)+'</span>'+(c.label?'<span class="where">'+esc(c.label)+'</span>':'')+'</li>'}));
    h+=sec('Moved up','st-n',up.map(function(c){return '<li><b>'+esc(c.n)+'</b><span class="when">'+fmtTs(c.at)+'</span><span class="where">'+esc(c.from)+' to '+esc(c.to)+(c.label?' · '+esc(c.label):'')+'</span></li>'}));
    h+=sec('New in the game files','st-d',finds.map(function(x){return '<li><b>'+esc(x.name)+'</b><span class="when">'+fmtTs(x.seen)+'</span><span class="where">'+esc(KIND[x.kind]||'New data')+'</span></li>'}));
    h+=sec('Datamine posts','st-d',posts.map(function(p){return '<li>'+link(p.l,p.t)+'<span class="when">'+fmtTs(p.d)+'</span><span class="where">'+esc(p.src)+'</span></li>'}));
    var n=rel.length+up.length+finds.length+posts.length;
    if(!n)h+='<p class="sub">Nothing new this week.</p>';
    box.querySelector('.cnt').textContent=n+' new';box.querySelector('.body').innerHTML=h;
  }
  fetch('/api/unreleased').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(R){
    W.R=R;weekDraw();
    if(!R.items||!R.items.length)return;
    var open={};Array.prototype.forEach.call(document.querySelectorAll('#up-dd details'),function(d){open[d.dataset.id]=d.open});
    R.items.forEach(function(x){OVER[x.s+'|'+x.n]=x});
    renderDD();
    Array.prototype.forEach.call(document.querySelectorAll('#up-dd details'),function(d){d.open=!!open[d.dataset.id]});
    var el=$('up-updated');if(el&&R.updated)el.textContent='Statuses last worked out '+fmtTs(R.updated)+'.';
  }).catch(function(){});
  function fmtTs(ms){var d=new Date(ms);return d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear()}
  fetch('/api/datamine').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(M){
    W.M=M;weekDraw();
    var h='<p class="sub" style="margin:0">Checked automatically every morning: new Pokémon, forms, Megas and moves appearing in the game data the PokéMiners publish, plus Pokémon GO Hub\'s datamine posts. Finding something here does not mean it is coming. All of it is unconfirmed.</p>';
    if(!M.checked)h+='<p class="sub">It has not run yet. The first run records what is in the game data now, then it reports what is new.</p>';
    else{
      h+='<p class="sub">Last checked '+fmtTs(M.checked)+'. Watching since '+fmtTs(M.since||M.checked)+'.</p>';
      var kinds=[['pokemon','New Pokémon and forms'],['mega','New Mega and Primal data'],['move','New moves']];
      if(!M.items.length)h+='<p class="sub">Nothing new in the game data since then.</p>';
      kinds.forEach(function(k){
        var list=M.items.filter(function(x){return x.kind===k[0]});if(!list.length)return;
        h+='<div><h4><span class="st st-d">'+esc(k[1])+'</span><span class="mono muted">'+list.length+'</span></h4><div class="utiles">'+list.map(function(x){
          return tile({n:x.name,note:'Dex '+x.dex+' · seen '+fmtTs(x.seen),art:k[0]==='move'?[]:[x.name]},'Datamined')}).join('')+'</div></div>';
      });
    }
    if(M.posts&&M.posts.length)h+='<div><h4><span class="st st-n">Pokémon GO Hub datamine posts</span></h4><ul class="wlist">'+M.posts.slice(0,6).map(function(p){
      return '<li><a href="'+esc(p.link)+'" target="_blank" rel="noopener noreferrer"><b>'+esc(p.title)+'</b></a>'+(p.date?'<span class="when">'+fmtTs(p.date)+'</span>':'')+'</li>'}).join('')+'</ul></div>';
    var el=document.createElement('details');el.className='dd';el.innerHTML='<summary>Datamine watch <span class="cnt">'+(M.items?M.items.length:0)+' new</span></summary><div class="body">'+h+'</div>';
    $('up-watch').appendChild(el);
  }).catch(function(){});
  // Datamine news: PokeMiners' datamining channels, read from Discord by a GitHub job (community datamining, never announced).
  fetch('/datamine-news.json').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(N){
    W.N=N;weekDraw();
    var items=(N&&N.items)||[];if(!items.length)return;
    var SRC=[['all','All'],['events','Events'],['reports','Reports'],['gamedata','Game data']],sel='all',shown=15;
    var el=document.createElement('details');el.className='dd';
    function safe(u){return /^https?:\/\//i.test(u||'')?u:''}
    function draw(){
      var list=items.filter(function(i){return sel==='all'||i.src===sel});
      var chips='<div class="chips" style="display:flex;gap:8px;overflow-x:auto">'+SRC.map(function(c){return '<button type="button" class="fchip" data-dmsrc="'+c[0]+'" aria-pressed="'+(sel===c[0])+'">'+c[1]+'</button>'}).join('')+'</div>';
      var rows=list.slice(0,shown).map(function(i){
        var u=safe(i.link),t=u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer"><b>'+esc(i.title)+'</b></a>':'<b>'+esc(i.title)+'</b>';
        return '<li>'+t+(i.date?'<span class="when">'+fmtTs(Date.parse(i.date))+'</span>':'')+(i.text?'<span class="where">'+esc(i.text.length>220?i.text.slice(0,220)+'…':i.text)+'</span>':'')+'</li>'}).join('');
      el.querySelector('.body').innerHTML='<p class="sub" style="margin:0">What the PokéMiners datamining team is finding, read from their update channels. Community datamining: nothing here is announced, and some of it never ships.</p>'+chips
        +(rows?'<ul class="wlist">'+rows+'</ul>':'<p class="sub">Nothing in this group yet.</p>')
        +(list.length>shown?'<button type="button" class="fchip" data-dmmore="1">Show more</button>':'');
    }
    el.innerHTML='<summary>Datamine news <span class="cnt">'+items.length+'</span></summary><div class="body"></div>';
    el.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('button');if(!b)return;
      if(b.dataset.dmsrc){sel=b.dataset.dmsrc;shown=15;draw()}else if(b.dataset.dmmore){shown+=15;draw()}
    });
    draw();$('up-watch').appendChild(el);
  }).catch(function(){});
  $('asof').textContent=D.asOf;

  /* ---------- best pokemon ---------- */
  var TCOL={Normal:['#9099A1','#0C0F14'],Fighting:['#B8305A','#FFFFFF'],Flying:['#8FA8DD','#0C0F14'],Poison:['#AB6AC8','#0C0F14'],Ground:['#D97746','#0C0F14'],Rock:['#C5B78C','#0C0F14'],Bug:['#91C12F','#0C0F14'],Ghost:['#5269AC','#FFFFFF'],Steel:['#5A8EA2','#0C0F14'],Fire:['#FF9D55','#0C0F14'],Water:['#5090D6','#0C0F14'],Grass:['#63BB5B','#0C0F14'],Electric:['#F4D23C','#0C0F14'],Psychic:['#FA7179','#0C0F14'],Ice:['#73CEC0','#0C0F14'],Dragon:['#0B6DC3','#FFFFFF'],Dark:['#5A5465','#FFFFFF'],Fairy:['#EC8FE6','#0C0F14']};
  var RAW=D.best, META={};
  /* Event-only moves (public/event-moves.json): while an event's window is open the move is shown as available, not as "needs an Elite TM". Never added to a normal moveset. */
  var EVM=[];
  function evmNow(name,mt){
    var base=String(name).replace(/^(Mega|Shadow|Primal|Alolan|Galarian|Hisuian|Paldean) /,'').replace(/ \(.*\)/,'').toLowerCase(),now=Date.now(),need=(mt&&mt.needs||[]).map(function(n){return String(n.move).toLowerCase()});
    return EVM.filter(function(m){var end=m.windowEnd?new Date(m.windowEnd).getTime():0,st=m.windowStart?new Date(m.windowStart).getTime():0;
      return (!st||st<=now)&&end>now&&need.indexOf(String(m.move).toLowerCase())>=0&&[m.pokemon,m.evolutionTarget].some(function(x){return x&&String(x).toLowerCase()===base})})[0]||null;
  }
  try{fetch('/event-moves.json').then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.moves&&j.moves.length){EVM=j.moves;if(typeof buildBest==='function'&&META){buildBest();if(typeof syncRows==='function')syncRows();if(typeof refreshMoves==='function')refreshMoves()}}}).catch(function(){})}catch(e){}
  var RAIDNOW=D.raidNow;
  var TYPES=Object.keys(RAW);
  var all={};

  var dex={have:{},hundo:{},m:{},bt:{}};
  try{var raw=localStorage.getItem('gofn-dex-v1');if(raw){var o=JSON.parse(raw);dex.have=o.have||{};dex.hundo=o.hundo||{};dex.m=o.m||{};dex.bt=o.bt||{}}}catch(e){}

  var list=$('list');
  var typeSel='All';
  var tc=$('typechips');
  function moveLine(name,fast,charged){
    var G=window.GOMOVE;if(!G||!G.loaded())return esc(fast)+' + '+esc(charged.join(' + '));
    return '<span class="mvl">'+G.html(fast,'',name)+'<span class="mvp" aria-hidden="true">+</span>'+charged.map(function(c){return G.html(c,'',name)}).join('')+'</span>';
  }
  function refreshMoves(){
    Array.prototype.forEach.call(document.querySelectorAll('#list .irow'),function(row){var m=row.querySelector('.mv');if(m&&row.dataset.f)m.innerHTML=moveLine(row.dataset.key,row.dataset.f,[row.dataset.c,row.dataset.c2].filter(Boolean))});
    if(typeof renderPvp==='function'&&PV)renderPvp();
  }
  document.addEventListener('gomoves',refreshMoves);
  if(window.GOMOVE)GOMOVE.ready.then(function(){setTimeout(refreshMoves,0)});   // covers moves.json finishing before this script ran
  function buildBest(){
  var previousTypeSel = typeSel;
  TYPES=Object.keys(RAW);all={};
  TYPES.forEach(function(t){RAW[t].forEach(function(r){all[r.split('|')[0]]=1})});
  $('cAll').textContent=Object.keys(all).length;
  tc.innerHTML='';list.innerHTML='';
  typeSel = previousTypeSel === 'All' ? 'All' : Array.isArray(previousTypeSel) ? previousTypeSel.filter(function(t,i,a){return TYPES.indexOf(t)>-1&&a.indexOf(t)===i}) : (TYPES.indexOf(previousTypeSel)>-1 ? previousTypeSel : 'All');
  ['All'].concat(TYPES).forEach(function(t){
    var b=document.createElement('button');b.type='button';
    b.className='pill '+(t==='All'?'all':'');
    if(t!=='All'){b.style.background=TCOL[t][0];b.style.color=TCOL[t][1]}
    b.innerHTML=(t==='All'?'':'<img class="ti" src="/ico/g/type-'+t.toLowerCase()+'.webp" alt="">')+t;
    b.setAttribute('aria-pressed',(t==='All' ? typeSel==='All' : isBestTypeSelected(t,typeSel))?'true':'false');
    b.addEventListener('click',function(){
      typeSel=t;
      Array.prototype.forEach.call(tc.children,function(c){c.setAttribute('aria-pressed',c===b?'true':'false')});
      applyFilters();
    });
    tc.appendChild(b);
  });

  TYPES.forEach(function(t){
    var g=document.createElement('div');g.className='group';g.dataset.type=t;
    var h='<h3><span class="sw" style="background:'+TCOL[t][0]+'"></span>'+t+'</h3>';
    RAW[t].forEach(function(r,i){
      var f=r.split('|'),name=f[0],mt=META[t+'|'+name]||null;
      var form=/^Mega /.test(name)?'Mega':/^Shadow /.test(name)?'Shadow':/^Primal /.test(name)?'Primal':'';
      var base=name.replace(/^(Mega|Shadow|Primal|Alolan|Galarian|Hisuian|Paldean) /,'').replace(/ \(.*\)/,'');
      var kind=mt&&mt.needs&&mt.needs.length?(mt.needs.some(function(n){return n.kind==='legacy'})?'legacy':'elite'):'';
      var evm=kind?evmNow(name,mt):null;
      var evNote=evm?'<div class="bneed"><b>Available now:</b> '+esc(evm.move)+' from '+esc(evm.eventName)+(evm.acquisition==='EVOLVE'?' (evolve '+esc(evm.pokemon)+')':'')+' <span>until '+esc(new Date(evm.windowEnd).toLocaleString('en-AU',{weekday:'short',hour:'numeric',minute:'2-digit'}))+'</span></div>':'';
      var need=kind?'<div class="bneed"><b>'+(kind==='legacy'?'Needs a legacy move':'Needs an Elite TM')+':</b> '+esc(mt.needs.map(function(n){return n.move}).join(', '))+(mt.without?' <span>Without it: '+esc(mt.without.fast)+' + '+esc(mt.without.charged)+' ('+mt.without.dps+' DPS)</span>':'')+'</div>'+evNote:'';
      var sel=kind?'<select class="bmv" aria-label="Move progress for '+esc(name)+'"><option value="0">Move: not started</option><option value="1">'+(kind==='legacy'?'Waiting for legacy move':'Waiting on Elite TM')+'</option><option value="2">'+(kind==='legacy'?'Legacy move learned':'Elite TM used')+'</option></select>':'';
      h+='<div class="irow" data-key="'+esc(name)+'" data-kind="'+kind+'" data-f="'+esc(f[1])+'" data-c="'+esc(f[2])+'" data-c2="'+esc(f[4]||'')+'" data-search="'+esc((name+' '+f[1]+' '+f[2]+' '+(f[4]||'')).toLowerCase())+'">'
        +'<span class="mon" style="--tb:'+TCOL[t][0]+';--tf:'+TCOL[t][1]+'" aria-hidden="true">'+'<b>'+esc(base.slice(0,2))+'</b>'+art(name,'in')+'</span>'
        +'<div style="min-width:0"><div class="nm">'+esc(name)+'</div><div class="mv">'+esc(f[1])+' + '+esc(f[2])+(f[4]?' + '+esc(f[4]):'')+'</div>'
        +'<div class="meta">'+(form?tagHtml(form):'')+(RAIDNOW[name]?tagHtml('Raids',RAIDNOW[name]):'')+'<span class="dps">'+f[3]+' DPS</span></div>'+need
        +'<div class="bx"><button type="button" class="tg x s" aria-pressed="false">Shiny</button><button type="button" class="tg x m" aria-pressed="false">Maxed out</button>'+sel+'</div></div>'
        +'<div class="toggles"><button type="button" class="tg o" aria-pressed="false">Obtained</button><button type="button" class="tg h" aria-pressed="false">Hundo</button></div></div>';
    });
    g.innerHTML=h;
    list.appendChild(g);
  });
  }
  buildBest();
  fetch('/best-by-type.json').then(function(r){return r.ok?r.json():null}).then(function(j){
    if(!j||!j.types)return;
    var R={},M={};
    Object.keys(j.types).forEach(function(t){R[t]=j.types[t].map(function(x){M[t+'|'+x.name]=x;return [x.name,x.fast,x.charged,x.dps,x.charged2||''].join('|')})});
    RAW=R;META=M;buildBest();syncRows();refreshMoves();
    var n=$('bnote');if(n)n.textContent='Top ten for each attack type. '+j.method+' Updated '+j.generated+'.';
  }).catch(function(){});
  function syncRows(){
    Array.prototype.forEach.call(document.querySelectorAll('#list .irow'),function(row){
      var k=row.dataset.key,own=!!dex.have[k],hu=!!dex.hundo[k];
      row.querySelector('.o').setAttribute('aria-pressed',own?'true':'false');
      row.querySelector('.h').setAttribute('aria-pressed',hu?'true':'false');
      var b=bt(k);row.querySelector('.x.s').setAttribute('aria-pressed',b.s?'true':'false');row.querySelector('.x.m').setAttribute('aria-pressed',b.x?'true':'false');
      var sl=row.querySelector('.bmv');if(sl)sl.value=String(b.v||0);
    });
    var nS=0,nX=0,nW=0;Object.keys(all).forEach(function(k){var b=dex.bt[k];if(!b)return;if(b.s)nS++;if(b.x)nX++;if(b.v===1)nW++});
    var sm=$('btSum');if(sm)sm.textContent='Shiny '+nS+' · Maxed out '+nX+' · Waiting on a move '+nW;
    var ownN=Object.keys(all).filter(function(k){return dex.have[k]}).length;
    var huN=Object.keys(all).filter(function(k){return dex.hundo[k]}).length;
    $('cOwn').textContent=ownN;$('cHundo').textContent=huN;
    $('barOwn').style.width=(ownN/Object.keys(all).length*100)+'%';
    applyFilters();
  }
  function isBestTypeSelected(type, selected){
    return selected!=='All'&&(Array.isArray(selected)?selected.indexOf(type)>-1:type===selected);
  }
  function matchesBestType(groupType, selected){
    return selected==='All'||(Array.isArray(selected)?selected.indexOf(groupType)>-1:groupType===selected);
  }
  function applyFilters(){
    var q=$('q').value.trim().toLowerCase(),sv=$('status').value,shown=0;
    Array.prototype.forEach.call(document.querySelectorAll('#list .group'),function(g){
      var vis=0,typeOk=matchesBestType(g.dataset.type,typeSel);
      Array.prototype.forEach.call(g.querySelectorAll('.irow'),function(row){
        var k=row.dataset.key,own=!!dex.have[k],hu=!!dex.hundo[k];
        var ok=typeOk&&(!q||row.dataset.search.indexOf(q)>-1);
        if(ok&&sv==='missing')ok=!own;
        if(ok&&sv==='own')ok=own;
        if(ok&&sv==='nohundo')ok=!hu;
        if(ok&&sv==='hundo')ok=hu;
        var bb=bt(k);
        if(ok&&sv==='shiny')ok=!!bb.s;
        if(ok&&sv==='noshiny')ok=own&&!bb.s;
        if(ok&&sv==='maxed')ok=!!bb.x;
        if(ok&&sv==='notmaxed')ok=own&&!bb.x;
        if(ok&&sv==='movewait')ok=bb.v===1;
        if(ok&&sv==='moveneeded')ok=row.dataset.kind!==''&&bb.v!==2;
        row.hidden=!ok;if(ok)vis++;
      });
      g.hidden=vis===0;shown+=vis;
    });
    $('none').hidden=shown>0;
  }
  window.GOBEST = { showTypes:function(types){
    var valid = Array.isArray(types) ? types.filter(function(t,i,a){return TYPES.indexOf(t)>-1&&a.indexOf(t)===i}) : [];
    typeSel = valid.length ? valid : 'All';
    $('q').value = ''; $('status').value = 'all';
    Array.prototype.forEach.call(tc.children,function(c){var t=c.textContent.trim();c.setAttribute('aria-pressed',(t==='All'?typeSel==='All':isBestTypeSelected(t,typeSel))?'true':'false')});
    applyFilters();
  } };
  $('q').addEventListener('input',applyFilters);
  $('status').addEventListener('change',applyFilters);
  function bt(k){return dex.bt[k]||{}}
  function setBt(k,f,v){var o=dex.bt[k]||(dex.bt[k]={});if(v)o[f]=v;else delete o[f];if(!Object.keys(o).length)delete dex.bt[k]}
  list.addEventListener('change',function(ev){
    var sl=ev.target.closest('.bmv');if(!sl)return;
    var k=sl.closest('.irow').dataset.key,v=+sl.value;
    setBt(k,'v',v);if(v){dex.have[k]=1}
    syncRows();persist();
  });
  list.addEventListener('click',function(ev){
    var b=ev.target.closest('.tg');if(!b)return;
    var k=b.closest('.irow').dataset.key;
    if(b.classList.contains('x')){
      var f=b.classList.contains('s')?'s':'x',on=!bt(k)[f];
      setBt(k,f,on?1:0);if(on)dex.have[k]=1;
      syncRows();persist();return;
    }
    if(b.classList.contains('o')){
      if(dex.have[k]){delete dex.have[k];delete dex.hundo[k];delete dex.bt[k]}else dex.have[k]=1;
    } else {
      if(dex.hundo[k])delete dex.hundo[k];else{dex.hundo[k]=1;dex.have[k]=1}
    }
    syncRows();persist();
  });

  /* ---------- pokedex checklist ---------- */
  var DEXCATS=['own','shiny','lucky','shadow','purified','hundo'];
  var DLAB={own:'Own',shiny:'Shiny',lucky:'Lucky',shadow:'Shadow',purified:'Purified',hundo:'100%'};
  var DEXLIST=[],NOTGO={},dshown=60;
  function dm(c){return dex.m[c]||(dex.m[c]={})}
  function norm(s){return String(s).toLowerCase().replace(/[^a-z0-9]/g,'')}
  var DUN=[];
  (U.dd||[]).forEach(function(sec){if(sec.id!=='unreleased')return;(function walk(g){(g.items||[]).forEach(function(i){DUN.push(norm(i.n))});(g.groups||[]).forEach(walk)})({groups:sec.groups})});
  fetch('/dex.json').then(function(r){return r.json()}).then(function(L){
    DEXLIST=L;
    L.forEach(function(p){if(DUN.indexOf(norm(p[1]))>-1)NOTGO[p[0]]=1});
    fetch('/release-status.json').then(function(r){return r.ok?r.json():null}).then(function(R){
      if(!R||!R.unreleased)return;var today=new Date().toISOString().slice(0,10),ch=false;
      R.unreleased.forEach(function(u){if(u.type!=='pokemon'||(u.available&&u.available<=today))return;L.forEach(function(p){if(norm(p[1])===norm(u.name)&&!NOTGO[p[0]]){NOTGO[p[0]]=1;ch=true}})});
      if(ch)renderDex();
    }).catch(function(){});
    $('dTotal').textContent=L.length;
    var gs={};L.forEach(function(p){gs[p[2]]=1});
    var ROM={1:'Kanto',2:'Johto',3:'Hoenn',4:'Sinnoh',5:'Unova',6:'Kalos',7:'Alola',8:'Galar and Hisui',9:'Paldea'};
    Object.keys(gs).forEach(function(g){var o=document.createElement('option');o.value=g;o.textContent='Gen '+g+' · '+(ROM[g]||'');$('dgen').appendChild(o)});
    (function(){var h=$('genchips');if(!h)return;h.innerHTML='<button type="button" class="fchip" data-gen="0" aria-pressed="true">All</button>'+Object.keys(gs).map(function(g){return '<button type="button" class="fchip" data-gen="'+g+'" aria-pressed="false">'+g+'<small> '+(ROM[g]||'')+'</small></button>'}).join('');h.addEventListener('click',function(e){var b=e.target.closest('[data-gen]');if(!b)return;$('dgen').value=b.getAttribute('data-gen');$('dgen').dispatchEvent(new Event('change'))});$('dgen').addEventListener('change',function(){Array.prototype.forEach.call(h.children,function(c){c.setAttribute('aria-pressed',String(c.getAttribute('data-gen')===$('dgen').value))})})})();
    renderDex();renderPvp();renderShiny();
  }).catch(function(){$('dexlist').innerHTML='<p class="note">Could not load the Pokédex list.</p>'});
  function dexMatch(p){
    var q=$('dq').value.trim().toLowerCase(),g=+$('dgen').value,sv=$('dstat').value,id=p[0];
    if(!$('dunrel').checked&&NOTGO[id]&&!q)return false;
    if(g&&p[2]!==g)return false;
    if(q&&p[1].toLowerCase().indexOf(q)<0&&String(id)!==q.replace('#',''))return false;
    var own=!!dm('own')[id],sh=!!dm('shiny')[id],lu=!!dm('lucky')[id],hu=!!dm('hundo')[id];
    var gc=!!(window.GODASH&&GODASH.genConfirmed(p[2]));
    if(sv==='missing')return !own&&gc;if(sv==='untracked')return !own&&!gc;if(sv==='own')return own;if(sv==='noshiny')return !sh;if(sv==='shiny')return sh;if(sv==='nolucky')return !lu;if(sv==='nohundo')return !hu;
    return true;
  }
  function rowState(p){
    if(!window.GODASH)return '';
    var own=!!dm('own')[p[0]];
    return own?'<span class="own own-have">Have</span>':GODASH.genConfirmed(p[2])?'<span class="own own-need">Need</span>':'';
  }
  function confirmedCount(){var n=0,o=0;if(!window.GODASH)return [0,0];DEXLIST.forEach(function(p){if(NOTGO[p[0]])return;if(GODASH.genConfirmed(p[2])){n++;if(dm('own')[p[0]])o++}});return [n,o]}
  function renderDex(){
    if(!DEXLIST.length)return;
    renderReg();
    var inGo=DEXLIST.filter(function(p){return !NOTGO[p[0]]}).length;
    $('dTotal').textContent=inGo;
    function cnt(c){return DEXLIST.filter(function(p){return dm(c)[p[0]]&&!NOTGO[p[0]]}).length}
    var own=cnt('own');
    $('dOwn').textContent=own;$('dShiny').textContent=cnt('shiny');$('dBar').style.width=(inGo?own/inGo*100:0)+'%';
    $('dMini').innerHTML=['lucky','shadow','purified','hundo'].map(function(c){return '<span>'+DLAB[c]+' <b>'+cnt(c)+'</b></span>'}).join('');
    var list=DEXLIST.filter(dexMatch);
    $('dnone').hidden=list.length>0;
    $('dmore').hidden=list.length<=dshown;
    $('dexlist').innerHTML=list.slice(0,dshown).map(function(p){
      var id=p[0],un=NOTGO[id];
      return '<div class="drow'+(un?' un':'')+'" data-id="'+id+'"><img src="/dex/'+id+'.webp" alt="" loading="lazy" width="58" height="58">'
        +'<div><div class="nm"><small>#'+String(id).padStart(4,'0')+'</small>'+esc(p[1])+(un?'<span class="pill p-x">Not in GO yet</span>':'')+rowState(p)+'</div></div>'
        +'<div class="dtog">'+DEXCATS.map(function(c){return '<button type="button" class="tg'+(c==='shiny'?' s':'')+'" data-c="'+c+'" aria-pressed="'+(dm(c)[id]?'true':'false')+'">'+DLAB[c]+'</button>'}).join('')+'</div></div>';
    }).join('');
  }
  function renderReg(){
    var R=D.regionals||[];if(!R.length||!DEXLIST.length)return;
    var m=$('rsel').value;
    var list=R.filter(function(r){
      if(m==='all')return true;
      var ok=r[3]==='yes'||r[3]==='likely';
      return m==='miss'?ok&&!dm('own')[r[0]]:ok;
    });
    $('regcnt').textContent=R.filter(function(r){return r[3]!=='no'}).length+' here';
    $('regnote').textContent=D.regionalNote||'';
    var BD={yes:['st-a','Melbourne'],likely:['st-d','Likely'],no:null};
    $('reglist').innerHTML=list.map(function(r){
      var b=BD[r[3]],own=dm('own')[r[0]];
      return '<div class="drow" style="grid-template-columns:3.6rem minmax(0,1fr)"><img src="/dex/'+r[0]+'.webp" alt="" loading="lazy" width="58" height="58">'
        +'<div><div class="nm"><small>#'+String(r[0]).padStart(4,'0')+'</small>'+esc(r[1])+'</div>'
        +'<div class="meta" style="display:flex;flex-wrap:wrap;gap:6px 8px;margin-top:4px;align-items:center">'+(b?'<span class="st '+b[0]+'">'+b[1]+'</span>':'')+(own?'<span class="pill p-x">Owned</span>':'')+'<span class="muted" style="font-size:.82rem">'+esc(r[2])+'</span></div></div></div>';
    }).join('')||'<p class="note">Nothing to show.</p>';
  }
  $('rsel').addEventListener('change',renderReg);
  ['dq','dgen','dstat','dunrel'].forEach(function(i){$(i).addEventListener(i==='dq'?'input':'change',function(){dshown=60;renderDex()})});
  $('dmore').addEventListener('click',function(){dshown+=60;renderDex()});
  $('dexlist').addEventListener('click',function(ev){
    var b=ev.target.closest('.tg');if(!b)return;
    var row=b.closest('.drow'),id=row.dataset.id,c=b.dataset.c;
    if(NOTGO[id]){return}
    if(dm(c)[id]){
      delete dm(c)[id];
      if(c==='own')DEXCATS.forEach(function(x){delete dm(x)[id]});
    } else {dm(c)[id]=1;dm('own')[id]=1}
    persist();renderReg();renderShiny();
    var chip=row.querySelector('.nm .own'),pp=DEXLIST.filter(function(q){return String(q[0])===String(id)})[0];
    if(chip&&pp)chip.outerHTML=rowState(pp);
    DEXCATS.forEach(function(x){var t=row.querySelector('[data-c="'+x+'"]');t.setAttribute('aria-pressed',dm(x)[id]?'true':'false')});
    var keep=$('dstat').value==='all';
    if(keep){var n=0;DEXLIST.forEach(function(p){if(dm('own')[p[0]]&&!NOTGO[p[0]])n++});$('dOwn').textContent=n;$('dBar').style.width=((+$('dTotal').textContent)?(n/(+$('dTotal').textContent)*100):0)+'%';$('dShiny').textContent=DEXLIST.filter(function(p){return dm('shiny')[p[0]]&&!NOTGO[p[0]]}).length}
    else renderDex();
  });

  /* ---------- counters and pvp ---------- */
  var CHART={Normal:{Rock:.625,Steel:.625,Ghost:.390625},Fire:{Grass:1.6,Ice:1.6,Bug:1.6,Steel:1.6,Fire:.625,Water:.625,Rock:.625,Dragon:.625},Water:{Fire:1.6,Ground:1.6,Rock:1.6,Water:.625,Grass:.625,Dragon:.625},Electric:{Water:1.6,Flying:1.6,Electric:.625,Grass:.625,Dragon:.625,Ground:.390625},Grass:{Water:1.6,Ground:1.6,Rock:1.6,Fire:.625,Grass:.625,Poison:.625,Flying:.625,Bug:.625,Dragon:.625,Steel:.625},Ice:{Grass:1.6,Ground:1.6,Flying:1.6,Dragon:1.6,Fire:.625,Water:.625,Ice:.625,Steel:.625},Fighting:{Normal:1.6,Ice:1.6,Rock:1.6,Dark:1.6,Steel:1.6,Poison:.625,Flying:.625,Psychic:.625,Bug:.625,Fairy:.625,Ghost:.390625},Poison:{Grass:1.6,Fairy:1.6,Poison:.625,Ground:.625,Rock:.625,Ghost:.625,Steel:.390625},Ground:{Fire:1.6,Electric:1.6,Poison:1.6,Rock:1.6,Steel:1.6,Grass:.625,Bug:.625,Flying:.390625},Flying:{Grass:1.6,Fighting:1.6,Bug:1.6,Electric:.625,Rock:.625,Steel:.625},Psychic:{Fighting:1.6,Poison:1.6,Psychic:.625,Steel:.625,Dark:.390625},Bug:{Grass:1.6,Psychic:1.6,Dark:1.6,Fire:.625,Fighting:.625,Poison:.625,Flying:.625,Ghost:.625,Steel:.625,Fairy:.625},Rock:{Fire:1.6,Ice:1.6,Flying:1.6,Bug:1.6,Fighting:.625,Ground:.625,Steel:.625},Ghost:{Psychic:1.6,Ghost:1.6,Dark:.625,Normal:.390625},Dragon:{Dragon:1.6,Steel:.625,Fairy:.390625},Dark:{Psychic:1.6,Ghost:1.6,Fighting:.625,Dark:.625,Fairy:.625},Steel:{Ice:1.6,Rock:1.6,Fairy:1.6,Fire:.625,Water:.625,Electric:.625,Steel:.625},Fairy:{Fighting:1.6,Dragon:1.6,Dark:1.6,Fire:.625,Poison:.625,Steel:.625}};
  function mult(att,def){var m=1;def.forEach(function(d){m*=(CHART[att]&&CHART[att][d])||1});return m}
  function fx(m){return (Math.round(m*100)/100)+'x'}
  var TD={boss:{},species:{}};
  function baseName(n){return norm(String(n).replace(/\s*\(.*\)/,'').replace(/^(Mega|Shadow|Primal|Gigantamax|Dynamax|Origin Forme|Alolan|Galarian|Hisuian|Paldean)\s+/i,'').replace(/\s+[XY]$/,''))}
  function dexIdOf(n){
    if(!DEXLIST.length)return 0;var b=baseName(n);
    for(var i=0;i<DEXLIST.length;i++)if(norm(DEXLIST[i][1])===b)return DEXLIST[i][0];return 0;
  }
  function dimg(n){var id=dexIdOf(n);return id?'<img src="/dex/'+id+'.webp" alt="" width="46" height="46" loading="lazy">':''}
  function bossTypes(n){
    if(TD.boss[n])return TD.boss[n];
    var id=dexIdOf(n);return id&&TD.species[id]?TD.species[id]:null;
  }
  /* Type facts for boss cards (types and weaknesses only; no counter recommendations). */
  function bossFacts(n){
    var ts=bossTypes(n);if(!ts)return null;
    var weak=Object.keys(TCOL).filter(function(t){return t!=='All'}).map(function(t){return [t,mult(t,ts)]}).filter(function(x){return x[1]>1}).sort(function(a,b){return b[1]-a[1]});
    return {types:ts,weak:weak.map(function(w){return w[0]})};
  }
  window.GOTYPES={facts:bossFacts};
  fetch('/types.json').then(function(r){return r.json()}).then(function(t){TD=t;document.dispatchEvent(new Event('gotypes'))}).catch(function(){});

  var PV=null;
  function renderPvp(){
    if(!PV)return;
    var lg=$('pvplg').value,list=PV.leagues[lg]||[];
    $('pvpcnt').textContent='top '+list.length;
    $('pvpnote').textContent='Top picks from PvPoke\'s rankings, refreshed every night. Updated '+fmtTs(PV.updated)+'. Rankings change with every balance update. "Owned" means you have ticked that species on the Dex tab.';
    $('pvplist').innerHTML=list.map(function(x,i){
      var id=dexIdOf(x.name),own=id&&dm('own')[id];
      return '<div class="drow" style="grid-template-columns:3rem minmax(0,1fr)">'+(dimg(x.name)||'<span></span>')+'<div><div class="nm"><small>#'+(i+1)+'</small>'+esc(x.name)+(own?'<span class="pill p-x">Owned</span>':'')+'</div><div class="muted" style="font-size:.82rem">'+moveLine(x.name,x.fast,x.charged)+' · score '+x.score+'</div></div></div>';
    }).join('');
  }
  $('pvplg').addEventListener('change',renderPvp);
  fetch('/api/pvp').then(function(r){if(!r.ok)throw 0;return r.json()}).catch(function(){return fetch('/pvp.json').then(function(r){return r.json()})}).then(function(p){PV=p;renderPvp()}).catch(function(){});

  /* ---------- shiny hunting ---------- */
  var SHF=[];
  function shinyDate(a,b){var x=new Date(a),y=b?new Date(b):null;var s=x.getDate()+' '+MON[x.getMonth()];return y&&(y.getDate()!==x.getDate()||y.getMonth()!==x.getMonth())?s+' to '+y.getDate()+' '+MON[y.getMonth()]:s}
  function renderShiny(){
    var today=ymd2(new Date()),limit=ymd2(new Date(Date.now()+21*864e5)),items=[],seen={};
    D.events.forEach(function(e){
      if(e.e.slice(0,10)<today||e.s.slice(0,10)>limit)return;
      var cd=e.tags.indexOf('Community Day')>-1;
      (e.art||[]).forEach(function(a){
        if(!a||!a.shiny)return;
        var boosted=/boost/i.test(a.label||'')||cd;
        items.push({n:a.n,boost:boosted,why:a.label||(cd?'Community Day odds':''),src:e.t,s:e.s,e:e.e,link:''});seen[a.n]=1;
      });
    });
    SHF.forEach(function(x){
      if(seen[x.n]||(x.e||x.s).slice(0,10)<today)return;seen[x.n]=1;
      items.push({n:x.n,boost:false,why:'',src:x.src,s:x.s,e:x.e,link:x.link});
    });
    items.forEach(function(x){var id=dexIdOf(x.n);x.have=!!(id&&dm('shiny')[id])});
    var hide=$('shhide').checked,all=items.length;
    if(hide)items=items.filter(function(x){return !x.have});
    items.sort(function(a,b){return (b.boost-a.boost)||(a.have-b.have)||(a.s<b.s?-1:1)});
    $('shcnt').textContent=items.length+(hide&&all>items.length?' of '+all:'');
    $('shlist').innerHTML=items.length?items.map(function(x){
      return '<div class="drow" style="grid-template-columns:3rem minmax(0,1fr)">'+(dimg(x.n)||'<span></span>')+'<div><div class="nm">'+esc(x.n)+'</div>'
        +'<div class="meta" style="display:flex;flex-wrap:wrap;gap:6px 8px;margin-top:4px;align-items:center">'+(x.boost?'<span class="st st-a">Boosted odds</span>':'<span class="st st-n">Can be shiny</span>')+(x.have?'<span class="pill p-x">You have it</span>':'')
        +'<span class="muted" style="font-size:.82rem">'+(x.link?'<a href="'+esc(x.link)+'" target="_blank" rel="noopener noreferrer" style="color:inherit">'+esc(x.src)+'</a>':esc(x.src))+' · '+esc(shinyDate(x.s,x.e))+(x.why&&!/^Boosted odds$/.test(x.why)?' · '+esc(x.why):'')+'</span></div></div></div>';
    }).join(''):'<p class="note">Nothing to show. '+(hide?'Untick the box to see ones you already have.':'')+'</p>';
  }
  $('shhide').addEventListener('change',renderShiny);
  fetch('/api/shinies').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(R){SHF=R.items||[];renderShiny()}).catch(function(){});

  /* ---------- saving: this device, plus the server when a sync PIN is entered ---------- */
  var timer=null,writing=false,dirty=false,online=false,pin='',stamp=0,baseUpdated=0,baselineDex=null;
  try{pin=localStorage.getItem('gofn-pin')||'';stamp=+localStorage.getItem('gofn-stamp')||0;baseUpdated=+localStorage.getItem('gofn-dex-base-v1')||0;var savedBase=localStorage.getItem('gofn-dex-baseline-v1');if(savedBase)baselineDex=JSON.parse(savedBase)}catch(e){}
  function acct(){try{return localStorage.getItem('gofn-acct')||''}catch(e){return''}}
  function hdr(){var h={'content-type':'application/json'};if(pin)h['x-pin']=pin;return h}
  var MSG={
    local:'Saved on this device only.',
    synced:'Saved to your account and this device.',
    error:'Could not reach the server just now. Marks are kept on this device.',
    badpin:'That sync PIN was not accepted. Marks are kept on this device.',
    signedout:'You have been signed out. Sign in again to sync. Marks are kept on this device.',
    off:'Saved on this device. Account sync is not switched on for this site yet.',
    update:'Please refresh GO Field Notes before syncing, so older open tabs cannot overwrite newer marks.'
  };
  function setSync(k){
    $('sync').textContent=MSG[k]||'';$('dsync').textContent=MSG[k]||'';
    $('pinform').hidden=(k==='synced'||k==='off'||k==='update');
  }
  function has(o){return Object.keys(o.have).length||Object.keys(o.bt||{}).length||Object.keys(o.hundo).length||DEXCATS.some(function(c){return o.m&&o.m[c]&&Object.keys(o.m[c]).length})}
  function saveLocal(){try{localStorage.setItem('gofn-dex-v1',JSON.stringify(dex));localStorage.setItem('gofn-stamp',String(stamp));localStorage.setItem('gofn-dex-base-v1',String(baseUpdated));if(baselineDex)localStorage.setItem('gofn-dex-baseline-v1',JSON.stringify(baselineDex));else localStorage.removeItem('gofn-dex-baseline-v1')}catch(e){}document.dispatchEvent(new Event('gofn-marks'))}
  function req(method,body){
    return fetch('/api/dex',{method:method,headers:hdr(),body:body?JSON.stringify(body):undefined});
  }
  function persist(){
    stamp=Date.now();saveLocal();
    if(!online)return;
    dirty=true;clearTimeout(timer);timer=setTimeout(flush,600);
  }
  async function flush(){
    if(writing||!online)return;
    writing=true;
    try{
      var attempts=0;
      while(dirty&&attempts<5){
        dirty=false;attempts++;
        var sentDex=JSON.parse(JSON.stringify(dex));
        var r=await req('PUT',{have:sentDex.have,hundo:sentDex.hundo,m:sentDex.m,bt:sentDex.bt,updated:stamp,baseUpdated:baseUpdated});
        if(r.status===409){
          var conflict=await r.json();
          var remote={have:conflict.have||{},hundo:conflict.hundo||{},m:conflict.m||{},bt:conflict.bt||{}};
          dex=window.GOLOCAL.mergeDexSnapshot(dex,remote,stamp,Number(conflict.updated)||0,baselineDex);
          baselineDex=remote;
          baseUpdated=Number(conflict.updated)||0;
          stamp=Math.max(stamp,Date.now());
          saveLocal();syncRows();renderDex();renderShiny();
          dirty=JSON.stringify(dex)!==JSON.stringify(remote);continue;
        }
        if(r.status===428){online=false;setSync('update');return}
        if(r.status===401){online=false;setSync(pin?'badpin':'signedout');return}
        if(!r.ok)throw new Error('http '+r.status);
        var ack=await r.json();
        baselineDex=JSON.parse(JSON.stringify(sentDex));
        baseUpdated=Number(ack.updated)||baseUpdated;
        stamp=Math.max(stamp,baseUpdated);
        saveLocal();
      }
      if(dirty)throw new Error('sync conflict retry limit');
      setSync('synced');
    }catch(e){setSync('error')}
    finally{writing=false}
  }
  async function pull(){
    if(!pin&&!acct()){setSync('local');return}
    try{
      var r=await req('GET');
      if(r.status===404){setSync('off');return}
      if(r.status===401){online=false;setSync(pin?'badpin':'signedout');return}
      if(r.status===429){setSync('error');return}
      if(!r.ok)throw new Error('http '+r.status);
      var d=await r.json();
      online=true;
      var remote={have:d.have||{},hundo:d.hundo||{},m:d.m||{},bt:d.bt||{}};
      var merged=window.GOLOCAL.mergeDexSnapshot(dex,remote,stamp,Number(d.updated)||0,baselineDex);
      var needsUpload=JSON.stringify(merged)!==JSON.stringify(remote);
      dex=merged;baselineDex=remote;baseUpdated=Number(d.updated)||0;stamp=Math.max(stamp,baseUpdated);
      saveLocal();syncRows();renderDex();renderShiny();
      if(needsUpload){dirty=true;await flush();return}
      setSync('synced');
    }catch(e){setSync('error')}
  }
  $('pinform').addEventListener('submit',function(ev){
    ev.preventDefault();
    pin=$('pin').value.trim();$('pin').value='';
    try{localStorage.setItem('gofn-pin',pin)}catch(e){}
    document.dispatchEvent(new Event('gofn-identity-change'));
    location.reload();
  });
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&online&&!dirty&&!writing)pull()});
  setSync('local');
  syncRows();
  pull();
  function markOwn(ids){var m=dm('own'),added=[];ids.forEach(function(id){if(!m[id]){m[id]=1;added.push(id)}});if(added.length){persist();renderDex()}return added}
  function unmarkOwn(ids){var m=dm('own');ids.forEach(function(id){delete m[id]});persist();renderDex()}
  window.GO={refreshDex:function(){if(DEXLIST.length)renderDex()},markOwn:markOwn,unmarkOwn:unmarkOwn,D:D,MAN:MAN,esc:esc,art:art,fig:fig,bonusRow:bonusRow,bonusChip:bonusChip,MON:MON,DOW:DOW,dex:function(){return dex},showTab:showTab,HERO:HERO,TAGKEY:TAGKEY,tagHtml:tagHtml};
  var ds=document.createElement('script');ds.src='/dash.js?v=20261031a';document.body.appendChild(ds);
})();

}).catch(function(){var panel=document.getElementById('load-error');if(panel)panel.hidden=false;var retry=document.getElementById('load-retry');if(retry)retry.addEventListener('click',function(){window.location.reload()},{once:true})});

/* Offline / connection notice: the app keeps working from its saved copy; say so, and say when it is back. */
(function(){
  function bar(){var b=document.getElementById('netbar');if(b)return b;b=document.createElement('div');b.id='netbar';b.className='envbar';b.hidden=true;b.setAttribute('role','status');var e=document.getElementById('envbar');if(e&&e.parentNode)e.parentNode.insertBefore(b,e.nextSibling);else document.body.insertBefore(b,document.body.firstChild);return b}
  function upd(){var b=bar();if(navigator.onLine===false){b.hidden=false;b.innerHTML='<b>You are offline</b><span>Showing the last saved copy. Changes you make sync when you are back online.</span>'}else if(!b.hasAttribute('data-fail'))b.hidden=true}
  window.GONET={fail:function(msg){var b=bar();b.setAttribute('data-fail','1');b.hidden=false;b.innerHTML='<b>'+msg+'</b><button type="button" class="pill" data-netretry>Try again</button>'}};
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-netretry]'))location.reload()});
  window.addEventListener('online',upd);window.addEventListener('offline',upd);upd();
})();
