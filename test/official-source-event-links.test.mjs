import test from 'node:test';
import assert from 'node:assert/strict';
import {linkOfficialSourceFacetsToCanonicalEvents as link} from '../scripts/importer/official-source-event-links.mjs';

const official='https://pokemongo.com/en/gowildarea/global';
const short='https://pokemongo.com/gowildarea/global/';
const news='https://pokemongo.com/news/go-pass-november-2026/';
const facets=url=>({schemaVersion:1,sourceUrl:url,benefits:[{
  label:'Up to six free Raid Passes',access:'ticket'
}],featuredMoves:[],researchPrograms:[]});

test('exact official page from curated global event links to one canonical ID',()=>{
 const events=[{id:'wag',t:'GO Wild Area: Global',sourceUrl:official},
               {id:'unrelated',t:'GO Wild Area: Global',sourceUrl:'https://leekduck.com/events/example/'}];
 const {byEvent,report}=link(events,new Map([[short,facets(official)]]));
 assert.equal(report.linkedPages,1);
 assert.equal(byEvent.get('wag')[0].sourceId,'official');
 assert.equal(byEvent.get('wag')[0].sourceUrl,official);// provenance equals facets.sourceUrl
 assert.equal(report.ambiguousPages,0);
 assert.equal(report.publication,'audit-only');
 assert.ok(!byEvent.has('unrelated'));
});

test('explicit source records can link official articles without title inference',()=>{
 const events=[{id:'gopassnov',sources:[{id:'official',url:news}]},
               {id:'same-title',t:'GO Pass: November',sources:[{id:'hub',url:news}]}];
 const {byEvent,report}=link(events,new Map([[news,facets(news)]]));
 assert.equal(report.linkedPages,1);
 assert.equal(byEvent.get('gopassnov').length,1);
 assert.ok(!byEvent.has('same-title'));
});

test('two canonical events claiming one official page remain blocked as ambiguous',()=>{
 const events=[{id:'wag',sourceUrl:official},{id:'venue',link:short}];
 const a=link(events,new Map([[official,facets(official)]]));
 const b=link(events.slice().reverse(),new Map([[official,facets(official)]]));
 assert.deepEqual(a.report,b.report);
 assert.equal(a.report.ambiguousPages,1);
 assert.equal(a.byEvent.size,0);
 assert.deepEqual(a.report.ambiguousExamples[0].candidateIds,['venue','wag']);
});

test('similar names, dates and locations alone never grant official paid extras',()=>{
 const {byEvent,report}=link([
  {id:'wag',t:'GO Wild Area: Global',start:'2026-11-14',location:'worldwide'},
  {id:'mx',t:'GO Wild Area: Mexico City',start:'2026-11-07'}
 ],new Map([[official,facets(official)]]));
 assert.equal(report.unlinkedPages,1);
 assert.equal(byEvent.size,0);
 assert.deepEqual(report.unlinkedExamples,[{sourceUrl:'https://pokemongo.com/gowildarea/global'}]);
});

test('apex, www, English path and trailing slash variants dedupe official source',()=>{
 const url2='https://www.pokemongo.com/gowildarea/global/';
 const {byEvent,report}=link([{id:'wag',sourceUrl:official}],new Map([
  [short,facets(short)],[url2,facets(url2)]
 ]));
 assert.equal(report.eligiblePages,1);
 assert.equal(report.duplicatePages,1);
 assert.equal(report.linkedPages,1);
 assert.equal(byEvent.get('wag').length,1);
});

test('spoofed, HTTP, credentialed, query-only and wrong-source facets are rejected',()=>{
 const bad=[
  'https://pokemongo.com.attacker.example/gowildarea/global',
  'http://pokemongo.com/gowildarea/global',
  'https://evil:password@pokemongo.com/gowildarea/global',
  'https://pokemongo.com/gowildarea/global?hl=en',
  'https://pokemongo.com/news'
 ];
 const map=new Map(bad.map(url=>[url,facets(url)]));
 map.set(official,facets('https://pokemongo.com/news/unrelated'));
 const {byEvent,report}=link([{id:'wag',sourceUrl:official}],map);
 assert.equal(report.rejectedPages,6);
 assert.equal(report.linkedPages,0);
 assert.equal(byEvent.size,0);
});

test('deterministic unresolved evidence report excludes raw benefit descriptions',()=>{
 const urls=Array.from({length:16},(_,i)=>
   'https://pokemongo.com/news/synthetic-article-'+String(i).padStart(2,'0'));
 const a=link([],new Map(urls.map(url=>[url,facets(url)]))).report;
 const b=link([],new Map(urls.slice().reverse().map(url=>[url,facets(url)]))).report;
 assert.deepEqual(a,b);
 assert.equal(a.unlinkedPages,16);
 assert.equal(a.unlinkedExamples.length,12);
 assert.ok(!JSON.stringify(a).includes('Raid Passes'));
});

test('invalid caller data is rejected rather than converted into inferred events',()=>{
 assert.throws(()=>link(null,new Map()),/Verified event array/);
 assert.throws(()=>link([],{}),/Official facet Map/);
 assert.deepEqual(link([],new Map()).report,{
  publication:'audit-only',eligiblePages:0,linkedPages:0,unlinkedPages:0,
  ambiguousPages:0,rejectedPages:0,duplicatePages:0,unlinkedExamples:[],ambiguousExamples:[]
 });
});

test('nonstandard HTTPS ports never establish official identity',()=>{
 const url='https://pokemongo.com:8443/gowildarea/global';
 const {report,byEvent}=link([{id:'wag',sourceUrl:official}],new Map([[url,facets(url)]]));
 assert.equal(report.rejectedPages,1);
 assert.equal(byEvent.size,0);
});
test('conflicting duplicate official claims remain ambiguous independent of order',()=>{
 const alternate='https://www.pokemongo.com/gowildarea/global/';
 const conflicting={...facets(alternate),benefits:[{label:'Different ticket claim',access:'ticket'}]};
 const entries=[[official,facets(official)],[alternate,conflicting]];
 for(const input of [entries,entries.slice().reverse()]){
  const {report,byEvent}=link([{id:'wag',sourceUrl:official}],new Map(input));
  assert.equal(report.ambiguousPages,1);
  assert.equal(report.linkedPages,0);
  assert.equal(byEvent.size,0);
 }
});

// --- Review hardening: look-alike events and contract compatibility ---------
const gp='https://pokemongo.com/news/';
test('look-alike events (region variants, ended vs current, Max Monday vs Community Day) never inherit a page',()=>{
 const page=gp+'go-wild-area-global-2026';
 const events=[
  {id:'wag-mx',t:'GO Wild Area: Global',start:'2026-11-14',sourceUrl:gp+'go-wild-area-mexico-city-2026'},
  {id:'wag-ended',t:'GO Wild Area: Global',start:'2025-11-14',ended:true},
  {id:'wag-nolink',t:'GO Wild Area: Global',start:'2026-11-14'},
  {id:'max-monday',t:'Max Monday',start:'2026-11-16'},
  {id:'cd',t:'Community Day',start:'2026-11-16',link:'https://leekduck.com/events/community-day/'},
  {id:'wag',t:'GO Wild Area: Global',start:'2026-11-14',sourceUrl:page}
 ];
 const {byEvent,report}=link(events,new Map([[page,facets(page)]]));
 assert.deepEqual([...byEvent.keys()],['wag']);
 assert.equal(report.linkedPages,1);
 // Same page with NO exact owner: nothing links regardless of identical titles/dates.
 const none=link(events.filter(e=>e.id!=='wag'),new Map([[page,facets(page)]]));
 assert.equal(none.byEvent.size,0);
 assert.equal(none.report.unlinkedPages,1);
});
test('ended and current events both claiming one page stay blocked',()=>{
 const page=gp+'go-pass-november-2026';
 const {byEvent,report}=link([{id:'old',ended:true,sourceUrl:page},{id:'new',link:page}],new Map([[page,facets(page)]]));
 assert.equal(byEvent.size,0);
 assert.equal(report.ambiguousPages,1);
});
test('region variant and localized paths are different pages, never aliases',()=>{
 const events=[{id:'wag',sourceUrl:'https://pokemongo.com/gowildarea/global'}];
 for(const url of ['https://pokemongo.com/gowildarea/mexico-city','https://pokemongo.com/en-gb/gowildarea/global',
   'https://pokemongo.com/es/gowildarea/global','https://pokemongo.com/gowildarea/global/extra/path']){
  const {byEvent}=link(events,new Map([[url,facets(url)]]));
  assert.equal(byEvent.size,0,url);
 }
});
test('dot segments, backslashes and padded URLs do not normalise into an exact owner',()=>{
 const events=[{id:'wag',sourceUrl:'https://pokemongo.com/gowildarea/global'}];
 for(const url of ['https://pokemongo.com/news/../gowildarea/global',' https://pokemongo.com/gowildarea/global',
   'https://pokemongo.com/gowildarea\\global','https://pokemongo.com/gowildarea/global ']){
  const {byEvent,report}=link(events,new Map([[url,facets(url)]]));
  assert.equal(byEvent.size,0,JSON.stringify(url));
  assert.equal(report.rejectedPages,1,JSON.stringify(url));
 }
 // an event merely carrying a padded/dot-segment URL does not own the page either
 for(const owner of ['https://pokemongo.com/news/../gowildarea/global',' https://pokemongo.com/gowildarea/global']){
  const {byEvent}=link([{id:'x',sourceUrl:owner}],new Map([[official,facets(official)]]));
  assert.equal(byEvent.size,0,JSON.stringify(owner));
 }
});
test('events without a normalisable canonical ID are never link targets',()=>{
 const {byEvent,report}=link([{id:'bad id!',sourceUrl:official},{id:'',sourceUrl:official}],new Map([[official,facets(official)]]));
 assert.equal(byEvent.size,0);
 assert.equal(report.unlinkedPages,1);
});
test('linked records satisfy normalizeEventSourceFacets provenance even for variant keys',async()=>{
 const {normalizeEventSourceFacets}=await import('../scripts/importer/source-facets-contract.mjs');
 const f={...facets(official),benefits:[{label:'Up to six free Raid Passes',kind:'raid-passes',access:'ticket',
   source:{url:official,section:'Ticket bonuses'}}]};
 for(const key of [official,short,'https://www.pokemongo.com/gowildarea/global/']){
  const {byEvent}=link([{id:'wag',sourceUrl:official}],new Map([[key,f]]));
  const out=normalizeEventSourceFacets('wag',byEvent.get('wag'));
  assert.equal(out.benefits.length,1,key);
  assert.deepEqual(out.warnings||[],[],key);
 }
});
test('duplicate page records are chosen deterministically regardless of Map order',()=>{
 const a=[[official,facets(official)],[short,facets(official)]];
 const r1=link([{id:'wag',sourceUrl:official}],new Map(a)).byEvent.get('wag')[0].sourceUrl;
 const r2=link([{id:'wag',sourceUrl:official}],new Map(a.slice().reverse())).byEvent.get('wag')[0].sourceUrl;
 assert.equal(r1,r2);
});
test('linking is read-only: frozen events and facets are never mutated',()=>{
 const deep=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(deep);Object.freeze(o);}return o;};
 const events=deep([{id:'wag',sourceUrl:official,sources:[{id:'official',url:official}]}]);
 const map=new Map([[official,deep(facets(official))]]);
 assert.equal(link(events,map).report.linkedPages,1);
});
