import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const L=require('../public/today-logic.js'), T=require('../public/today.js');
function store(){const raw=new Map();return {getItem:k=>raw.has(k)?raw.get(k):null,setItem:(k,v)=>raw.set(k,String(v))};}
const start='2026-11-13T10:00:00Z', next='2026-11-20T10:00:00Z', end=Date.parse(start)+36e5;
test('Hide is occurrence-specific, survives reload, and does not change Done or collection',()=>{
 const s=store();s.setItem('gofn-dex-v1','own');s.setItem('gofn-us-v1','marks');
 const r=L.tryHideToday(s,'raid-hour',start,end,Date.parse(start));
 assert.equal(r.ok,true);assert.equal(L.isHiddenToday(L.readHidden(s),'raid-hour',start),true);
 assert.equal(L.isHiddenToday(L.readHidden(s),'raid-hour',next),false);
 assert.equal(L.isHiddenToday(L.readHidden(s),'other',start),false);
 assert.equal(s.getItem(L.DONE_KEY),null);
 assert.equal(s.getItem('gofn-dex-v1'),'own');assert.equal(s.getItem('gofn-us-v1'),'marks');
 assert.equal(L.tryRestoreHidden(s,r.key).restored,true);
 assert.equal(L.isHiddenToday(L.readHidden(s),'raid-hour',start),false);
});
test('Done persists independently while Hide is added or undone',()=>{
 const s=store();L.tryMarkDone(s,'event',start,end,Date.parse(start));
 const done=s.getItem(L.DONE_KEY), r=L.tryHideToday(s,'other',start,end,Date.parse(start));
 assert.equal(r.ok,true);assert.equal(s.getItem(L.DONE_KEY),done);
 assert.equal(L.tryRestoreHidden(s,r.key).ok,true);assert.equal(s.getItem(L.DONE_KEY),done);
});
test('Corrupt hide storage is backed up; refused writes never signal success',()=>{
 const s=store();s.setItem(L.HIDE_KEY,'{bad');
 assert.equal(L.tryHideToday(s,'event',start,end,Date.parse(start)).ok,true);
 assert.equal(s.getItem(L.HIDE_KEY+'-corrupt'),'{bad');
 const blocked={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
 assert.equal(L.tryHideToday(blocked,'event',start,end,Date.parse(start)).ok,false);
 assert.equal(L.tryRestoreHidden(blocked,'x').ok,false);
 const noWrite={getItem(){return null},setItem(){}};
 assert.equal(L.tryHideToday(noWrite,'event',start,end,Date.parse(start)).ok,false);
});
test('Today offers distinct Hide, Done, Undo and Restore with no Track or Follow',async()=>{
 const fs=await import('node:fs');
 const dash=fs.readFileSync(new URL('../public/dash.js',import.meta.url),'utf8');
 const ctx={now:new Date(Date.parse(start)),live:[],soon:[],week:[],regLive:[],regSoon:[],regWeek:[],boosts:{live:[],upcoming:[]},seasons:[],ending:[],done:[],
  hidden:[{key:'x@'+new Date(start).toISOString(),name:'In-person event',when:'Live now'}],kindOf:()=>['Event','#aaa'],monArt:()=>'',fallbackArt:()=>'',overseas:()=>false};
 const html=T.render(ctx);
 assert.match(html,/Hidden by you/);assert.match(html,/data-t1-unhide=/);
 assert.doesNotMatch(html,/data-track|data-follow/);
 assert.match(dash,/data-t1-hide/);assert.match(dash,/data-t1-done/);assert.match(dash,/function t1Restore/);
});

test('in-person Today rows expose the same occurrence actions as regular cards',()=>{
 const now=new Date(Date.parse(start)), event={
  id:'venue:overseas',name:'International GO Event',place:'Tokyo, Japan',
  start:Date.parse(start),end:Date.parse(start)+36e5,openId:'cur:international',overseas:true,inPerson:true
 };
 const ctx={now,live:[],soon:[],week:[],regLive:[event],regSoon:[],regWeek:[{...event,start:Date.parse(next),end:Date.parse(next)+36e5}],
  boosts:{live:[],upcoming:[]},seasons:[],ending:[],done:[],hidden:[],
  kindOf:()=>['In person','#aaa'],monArt:()=>'',fallbackArt:()=>'',overseas:()=>true,
  dayLabel:()=> 'Fri 20 Nov'};
 const html=T.render(ctx);
 assert.equal((html.match(/data-t1-menu="venue:overseas"/g)||[]).length,2,
  'both current and upcoming regional cards expose the occurrence action menu');
 assert.match(html,/data-id="venue:overseas" data-start="2026-11-13T10:00:00\.000Z"/,
  'live in-person card carries its own exact start');
 assert.match(html,/data-id="venue:overseas" data-start="2026-11-20T10:00:00\.000Z"/,
  'next occurrence of the same regional ID is a distinct action target');
 assert.match(html,/International GO Event/);
 assert.doesNotMatch(html,/data-track|data-follow/);
});


test('long hidden and done titles keep their venue/type metadata as a separate wrapping line',async()=>{
  const {readFileSync}=await import('node:fs');
  const css=readFileSync(new URL('../public/today.css',import.meta.url),'utf8');
  const ux=readFileSync(new URL('../public/ux-finish.css',import.meta.url),'utf8');
  const title='Pokémon GO City Safari – An exceptionally long localized event name in Osaka and Tohoku';
  const when='In person · Osaka, Japan · Overseas · 13 November 2026';
  const ctx={now:new Date(Date.parse(start)),live:[],soon:[],week:[],regLive:[],regSoon:[],regWeek:[],boosts:{live:[],upcoming:[]},seasons:[],ending:[],
    done:[{key:'done@'+new Date(start).toISOString(),name:title,when}],
    hidden:[{key:'hidden@'+new Date(start).toISOString(),name:title,when}],
    kindOf:()=>['In person','#aaa'],monArt:()=>'',fallbackArt:()=>'',overseas:()=>true};
  const html=T.render(ctx);
  assert.equal(html.split('<small>'+when+'</small>').length-1,2);
  assert.equal((html.match(/data-t1-(?:unhide|undo)=/g)||[]).length,2);
  assert.match(html,/data-t1-unhide=/);
  assert.match(html,/data-t1-undo=/);
  assert.ok(css.includes('.t1-done-list li > span:first-child{display:grid;'), 'label container must be grid');
  assert.ok(css.includes('.t1-done-list li > span:first-child small{display:block;'), 'secondary label has its own line');
  assert.ok(css.includes('.t1-done-list li > .t1-restore{flex:0 0 auto'), 'Restore stays touch-sized');
  assert.doesNotMatch(html,/data-track|data-follow/);
  assert.ok(ux.includes('#tab-now .t1-major > .t1-major-art{grid-column:1;grid-row:1;'), 'artwork occupies row one');
  assert.ok(ux.includes('#tab-now .t1-major > .t1-open{grid-column:1;grid-row:2;position:relative;z-index:1;'), 'event details occupy row two above art');
});
