(function(){
var out=document.getElementById('out');
function h(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function add(p){for(var i=1;i<arguments.length;i++)if(arguments[i])p.appendChild(arguments[i]);return p}
function when(ms){if(!ms)return 'never';var m=Math.round((Date.now()-ms)/60000);return m<2?'just now':m<120?m+' min ago':m<2880?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago'}
var LBL={official_confirmed:'Official confirmed',community_reported:'Community reported',datamined:'Datamined / speculative',conflicting:'Conflicting'};
function get(u){return fetch(u).then(function(r){return r.json()})}
var envBox=document.getElementById('env');
function banner(i){
  if(!i||!i.environment){envBox.className='unk';envBox.textContent='ENVIRONMENT UNKNOWN - do not trust this page';return}
  if(i.environment==='preview'){envBox.className='';envBox.textContent=i.database?'PREVIEW \u2014 STAGING DATABASE':'PREVIEW \u2014 NO DATABASE';
    var sm=h('small',0,i.database?'Test copy of the app. Not your live app.':'Test copy. No database attached, so nothing is stored.');envBox.appendChild(sm);document.title='PREVIEW \u00b7 Sources'}
  else{envBox.className='prod';envBox.textContent='Production'}
}
get('/api/sources').then(banner).catch(function(){banner(null)});
Promise.all([get('/api/pipeline/preview'),get('/api/sources'),get('/api/events')]).then(function(R){
  var pv=R[0],src=R[1],ev=R[2];out.textContent='';
  out.appendChild(h('h2',0,'Live check right now (nothing saved)'));
  var ld=pv.leekduck||{},c=add(h('div','card'));
  var r=add(h('div','row'),h('span','n','Leek Duck (via ScrapedDuck)'),h('span','chip '+(ld.ok?'healthy':'failing'),ld.ok?'data valid':'rejected'));c.appendChild(r);
  if(ld.ok){c.appendChild(h('div','mu',ld.total+' entries · '+ld.valid+' usable · '+ld.undated+' without dates · '+ld.upcoming+' upcoming or running'));
    c.appendChild(h('div','mu','Times: '+ld.utc+' worldwide-simultaneous, '+ld.local+' each-player-local'));
    if(ld.undatedNames&&ld.undatedNames.length)c.appendChild(h('div','mu','No dates yet: '+ld.undatedNames.join(', ')));
    var t=h('div','tags');Object.keys(ld.types||{}).forEach(function(k){t.appendChild(h('span','tag',k+' '+ld.types[k]))});c.appendChild(t);
  }else c.appendChild(h('div','err',ld.reason||'unknown'));
  out.appendChild(c);
  var cu=pv.curated||{};out.appendChild(add(h('div','card'),add(h('div','row'),h('span','n','Hand-curated (data.json)'),h('span','chip '+(cu.ok?'healthy':'failing'),cu.ok?cu.valid+' entries':'invalid')),h('div','mu','Kept as the fallback and cross-check. '+((pv.conflicts||[]).length)+' disagreements with Leek Duck.')));
  (pv.conflicts||[]).forEach(function(k){out.appendChild(add(h('div','card'),h('span','chip conflicting','Conflicting'),h('div','n',k.a+' vs '+k.b),h('div','mu',k.field+': '+k.aVal+'  |  '+k.bVal)))});

  out.appendChild(h('h2',0,'Stored by the pipeline'));
  if(!src.enabled)out.appendChild(add(h('div','card'),h('div','n','Not switched on yet'),h('div','mu','Nothing is stored. The app is still using data.json exactly as before.')));
  (src.sources||[]).forEach(function(s){var c=add(h('div','card'),add(h('div','row'),h('span','n',s.name),h('span','chip '+s.state,s.state)),h('div','mu',s.note),
    h('div','mu','Checked '+when(s.lastChecked)+' · last good '+when(s.lastOk)+' · changed '+when(s.lastChanged)+' · '+s.upcoming+' upcoming'));
    if(s.terms)c.appendChild(h('div','mu',s.terms));out.appendChild(c)});

  out.appendChild(h('h2',0,'Upcoming events'));
  var list=(ev.enabled?ev.events:pv.events.map(function(e){return {id:e.id,name:e.name,type:e.type,start:e.start,end:e.end,tzMode:e.tzMode,scope:e.scope,region:e.region,featured:e.featured,bonuses:e.bonuses,status:e.status,reports:[{source:'leekduck',link:e.link}]}}))||[];
  var types={};list.forEach(function(e){types[e.type]=1});
  var sel=h('select');sel.appendChild(h('option',0,'All types'));sel.firstChild.value='';Object.keys(types).sort().forEach(function(k){var o=h('option',0,k);o.value=k;sel.appendChild(o)});
  out.appendChild(sel);var box=h('div');out.appendChild(box);
  function draw(){box.textContent='';list.filter(function(e){return !sel.value||e.type===sel.value}).slice(0,80).forEach(function(e){
    var c=add(h('div','card'),add(h('div','row'),h('span','n',e.name),h('span','chip '+e.status,LBL[e.status]||e.status)));
    c.appendChild(h('div','mu',e.type+' · '+(e.start||'no date')+(e.end?' → '+e.end:'')+' · '+(e.tzMode==='utc'?'same moment worldwide':e.tzMode==='local'?'local time':'time unknown')+(e.region?' · '+e.region:'')));
    var t=h('div','tags');(e.featured||[]).slice(0,8).forEach(function(f){t.appendChild(h('span','tag',(f.shiny?'✨ ':'')+f.name+(f.role==='title'?' (from title)':'')))});(e.bonuses||[]).slice(0,4).forEach(function(b){t.appendChild(h('span','tag',b))});c.appendChild(t);
    var l=(e.reports||[])[0];if(l&&l.link){var a=h('a',0,'Source: '+l.source);a.href=l.link;a.rel='noopener';c.appendChild(add(h('div','mu'),a))}
    box.appendChild(c)})}
  sel.onchange=draw;draw();
  out.appendChild(h('p','s','Credit: event data by LeekDuck.com, served via ScrapedDuck.'));
}).catch(function(e){out.textContent='Could not load: '+e.message});
})();
