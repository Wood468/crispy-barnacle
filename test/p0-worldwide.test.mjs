import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Clock=require('../public/event-clock.js'),C=require('../public/event-contract.js'),UI=require('../public/event-components.js'),Catalogue=require('../public/event-catalogue.js');
const {buildCatalogue}=require('../scripts/event-experience/build-catalogue.cjs');
const event=(extra={})=>C.normalize({schemaVersion:1,eventId:'synthetic-p0',title:'Synthetic contract fixture',...extra});
const schedule={timeBasis:'instant',start:'2027-01-01T10:00Z',end:'2027-01-01T11:00Z'};
const context={clock:Clock,viewerZone:'UTC'};
test('viewer defaults to device and ignores invalid overrides without changing device-zone selection',()=>{
 assert.equal(Clock.effectiveViewerTimeZone('', 'Asia/Tokyo'),'Asia/Tokyo');
 assert.equal(Clock.effectiveViewerTimeZone('America/Los_Angeles','Asia/Tokyo'),'America/Los_Angeles');
 assert.equal(Clock.effectiveViewerTimeZone('Invalid/Zone','Asia/Tokyo'),'Asia/Tokyo');
 assert.equal(Clock.effectiveViewerTimeZone('','Europe/London'),'Europe/London');
});
test('saved override and reset are device-local and do not rewrite collection storage',()=>{
 const data=new Map([['gofn-dex-v1','EXISTING_COLLECTION']]);
 const fakeIntl={DateTimeFormat:function(locale,options){return new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',...options});}};
 const sandbox={Intl:fakeIntl,Date,Map,Set,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/event-clock.js',import.meta.url),'utf8'),sandbox);
 const clock=sandbox.GOEventClock;assert.equal(clock.viewerZone(),'Australia/Melbourne');clock.setViewerZone('America/New_York');assert.equal(clock.viewerZone(),'America/New_York');clock.setViewerZone('');assert.equal(clock.viewerZone(),'Asia/Tokyo');
 data.set('gofn-timezone','Invalid/Zone');assert.equal(clock.viewerZone(),'Australia/Melbourne');assert.throws(()=>clock.setViewerZone('Invalid/Zone'));assert.equal(data.get('gofn-dex-v1'),'EXISTING_COLLECTION');
});
test('player-local publication never depends on Melbourne DST, at event or activity level',()=>{
 const local={timeBasis:'player-local',start:'2026-10-04T02:30',end:'2026-10-04T03:30'};
 const m=event({schedule:local,activities:[{id:'slot',presentation:'rotation',schedule:local}]});assert.deepEqual(m.schedule,local);
 assert.ok(Clock.range(m.schedule,'Asia/Tokyo'));assert.throws(()=>Clock.range(m.schedule,'Australia/Melbourne'),/Nonexistent/);
 const ny={timeBasis:'player-local',start:'2027-03-14T02:30',end:'2027-03-14T03:30'};assert.ok(event({schedule:ny}));assert.throws(()=>Clock.range(ny,'America/New_York'),/Nonexistent/);
});
test('publication still rejects bad civil dates and reversed player-local intervals',()=>{
 for(const s of [{start:'2027-02-30T12:00',end:'2027-03-01T12:00'},{start:'2027-01-02T12:00',end:'2027-01-01T12:00'}])assert.throws(()=>event({schedule:{...s,timeBasis:'player-local'}}));
});
test('ambiguous player-local times remain globally valid but require an explicit viewer resolution',()=>{
 const s={timeBasis:'player-local',start:'2026-11-01T01:15',end:'2026-11-01T01:45'};assert.ok(event({schedule:s}));assert.throws(()=>Clock.range(s,'America/New_York'),/Ambiguous/);
 assert.equal(Clock.range({...s,disambiguation:'later'},'America/New_York').start-Clock.range({...s,disambiguation:'earlier'},'America/New_York').start,3600000);
});
test('calendar day boundaries follow the selected zone across a 23-hour DST day',()=>{
 const start=Clock.calendarDate(2027,2,14,0,0,'America/New_York'),next=Clock.addDays(start,1,'America/New_York');assert.equal(+next-+start,23*3600000);
 const instant=new Date('2027-01-01T01:00Z');assert.equal(Clock.dayKey(instant,'Asia/Tokyo'),'2027-01-01');assert.equal(Clock.dayKey(instant,'America/Los_Angeles'),'2026-12-31');
});
test('unknown and minor conflicts stay out of the hero, while schedule/access conflicts warn once',()=>{
 for(const field of ['cosmetic','bonuses','shiny','new-unclassified-field'])assert.doesNotMatch(UI.render(event({internalValidation:{conflicts:[{field}]}}),context),/Some event details conflict/);
 const m=event({internalValidation:{conflicts:[{field:'bonuses'},{field:'dates'},{field:'eligibility'}]}});assert.equal((UI.render(m,context).match(/Some event details conflict/g)||[]).length,1);
 assert.match(UI.render(event({lifecycle:'cancelled'}),context),/Event cancelled/);
 assert.throws(()=>event({internalValidation:{conflicts:[{field:'dates',impact:'anything'}]}}),/impact/);
});
test('research and ticket windows are retained under their own sections, never invented rotations',()=>{
 const m=event({activities:[{id:'research',kind:'research',title:'Timed task window',schedule},{id:'ticket',kind:'ticket',title:'Purchase window',schedule}]});
 const html=UI.render(m,context);assert.match(html,/Timed task window/);assert.match(html,/Purchase window/);assert.match(html,/id="evd-research-title"/);assert.match(html,/id="evd-tickets"/);assert.doesNotMatch(html,/id="evd-rotations"|href="#evd-rotations"/);
});
test('explicit top-level and nested rotations render once, ordinary schedules remain ordinary',()=>{
 const m=event({activities:[{id:'first',presentation:'rotation',title:'Top-level rotation',schedule},{id:'second',parentId:'first',presentation:'rotation',title:'Nested rotation',schedule},{id:'other',title:'Other event window',schedule}]});
 const html=UI.render(m,context);assert.equal((html.match(/data-activity="first"/g)||[]).length,1);assert.equal((html.match(/data-activity="second"/g)||[]).length,1);assert.match(html,/id="evd-schedule"/);
});
test('same-titled distinct activities preserve encounter cards, times, regions and shared ownership identity',()=>{
 const p={speciesId:'25',name:'Pikachu'},key=C.identity(p);
 const m=event({pokemon:[p],activities:[{id:'tokyo',presentation:'rotation',title:'Raid rotation',region:'Tokyo',schedule},{id:'sendai',presentation:'rotation',title:'Raid rotation',region:'Sendai',schedule:{...schedule,start:'2027-01-02T10:00Z',end:'2027-01-02T11:00Z'}}],encounters:[{identityKey:key,method:'raid',activityId:'tokyo'},{identityKey:key,method:'raid',activityId:'tokyo'},{identityKey:key,method:'raid',activityId:'sendai'}]});
 const html=UI.render(m,context);assert.equal((html.match(/data-identity="25:base:none"/g)||[]).length,2);assert.match(html,/Tokyo/);assert.match(html,/Sendai/);assert.match(html,/1 Jan/);assert.match(html,/2 Jan/);
 assert.equal(C.normalize({...m,activities:m.activities.map(a=>({...a,title:'Edited title'}))}).pokemon[0].key,key);
});
test('an invalid new encounter holds the entire candidate and reports its ID without shrinking the old catalogue',()=>{
 const old={schemaVersion:1,events:[event()]};const next={schemaVersion:1,events:[event(),{...event({eventId:'bad-announcement',pokemon:[{speciesId:'25'}]}),encounters:[{identityKey:'25:base:none',method:'wiild'}]}]};
 const result=Catalogue.prepare(next,old);assert.equal(result.accepted,false);assert.equal(result.events.length,1);assert.equal(result.events[0].eventId,'synthetic-p0');assert.equal(result.diagnostics.rejectedCount,1);assert.equal(result.diagnostics.rejections[0].eventId,'bad-announcement');assert.equal(result.diagnostics.retained,true);
});
test('colliding aliases hold the candidate rather than choosing an identity winner',()=>{
 const old={schemaVersion:1,events:[event({aliases:['old-link']})]},candidate={schemaVersion:1,events:[event({aliases:['shared']}),event({eventId:'other-region',aliases:['shared']})]};
 const result=Catalogue.prepare(candidate,old);assert.equal(result.accepted,false);assert.equal(result.index.resolve('old-link').eventId,'synthetic-p0');assert.equal(result.index.resolve('shared'),null);assert.equal(result.diagnostics.conflicts[0].type,'alias-collision');
});
test('empty and truncated publications cannot replace a populated last-good catalogue',()=>{
 const previous={schemaVersion:1,events:Array.from({length:208},(_,i)=>event({eventId:'history:'+i}))};
 for(const events of [[],previous.events.slice(0,2)]){
  const result=Catalogue.prepare({schemaVersion:1,events},previous);
  assert.equal(result.accepted,false);assert.equal(result.events.length,208);assert.ok(result.diagnostics.rejectedCount);assert.equal(result.diagnostics.retained,true);
 }
 assert.equal(Catalogue.prepare({schemaVersion:1,events:[]},null).accepted,false);
});
test('event continuity accepts cancellations, expired history and canonical replacements with stable aliases',()=>{
 const old=event({aliases:['historic-link'],schedule}),previous={schemaVersion:1,events:[old]};
 assert.equal(Catalogue.prepare({schemaVersion:1,events:[event({...old,lifecycle:'cancelled'})]},previous).accepted,true);
 const replacement=event({eventId:'replacement',aliases:[old.eventId,'historic-link'],schedule});
 const result=Catalogue.prepare({schemaVersion:1,events:[replacement]},previous);
 assert.equal(result.accepted,true);assert.equal(result.index.resolve('historic-link').eventId,'replacement');
 assert.equal(Catalogue.prepare({schemaVersion:1,events:[event({eventId:'replacement',aliases:[old.eventId],schedule})]},previous).accepted,false);
});
test('publisher retains published identity history when source discovery is empty',()=>{
 const previous={schemaVersion:1,events:[event({aliases:['saved-link'],schedule})]};
 const result=buildCatalogue({data:{events:[]},previous});assert.equal(result.events.length,1);assert.equal(result.events[0].eventId,'synthetic-p0');assert.ok(result.events[0].aliases.includes('saved-link'));
});
test('optional Sources navigation always has one real safe section or no link',()=>{
 const without=UI.render(event(),context);assert.doesNotMatch(without,/data-sec="details"/);
 const trusted=event({sources:[{name:'Published announcement',url:'https://leekduck.com/events/synthetic/'}],internalValidation:{conflicts:[{field:'cosmetic'}]}});
 const html=UI.render(trusted,context);assert.match(html,/data-sec="details"/);assert.equal((html.match(/id="evd-sources"/g)||[]).length,1);assert.doesNotMatch(html,/Some event details conflict/);
 const supplied=UI.render(trusted,{...context,sources:'<details id="evd-sources"><summary>Sources</summary></details>'});assert.equal((supplied.match(/id="evd-sources"/g)||[]).length,1);
 assert.doesNotMatch(UI.render(trusted,{...context,sources:'<p>Unavailable</p>'}),/data-sec="details"/);
 for(const url of ['javascript:alert(1)','https://','https://user:secret@example.invalid/','https://discord.com/channels/1/2'])assert.doesNotMatch(UI.render(event({sources:[{url}]}),context),/data-sec="details"|target="_blank"/);
});
test('publisher reports unsafe normalized records with structured rejection diagnostics',()=>{
 const raw={schemaVersion:1,eventId:'bad-source',title:'Synthetic invalid announcement',pokemon:[{speciesId:'25',methods:['wiild']}]};
 assert.throws(()=>buildCatalogue({data:{events:[raw]}}),error=>{assert.equal(error.diagnostics.rejectedCount,1);assert.equal(error.diagnostics.rejections[0].eventId,'bad-source');return true;});
});
test('failed atomic publication leaves the validated public file byte-for-byte intact',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const {publish}=require('../scripts/event-experience/build-catalogue.cjs'),root=await mkdtemp(path.join(tmpdir(),'gofn-catalogue-p0-'));
 try{
  await mkdir(path.join(root,'public'));
  await writeFile(path.join(root,'public/dex.json'),'[]');
  await writeFile(path.join(root,'public/data.json'),JSON.stringify({events:[event()]}));
  await publish(root);const before=await readFile(path.join(root,'public/events-v1.json'),'utf8');
  await writeFile(path.join(root,'public/data.json'),JSON.stringify({events:[{schemaVersion:1,eventId:'unsafe-new-record',title:'Synthetic malformed source',pokemon:[{speciesId:'25',methods:['wiild']}]}]}));
  await assert.rejects(publish(root),error=>error.diagnostics.rejections[0].eventId==='unsafe-new-record');
  assert.equal(await readFile(path.join(root,'public/events-v1.json'),'utf8'),before);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('new users default to Melbourne and can explicitly choose device time',()=>{
 const previous=globalThis.localStorage;const data=new Map();
 globalThis.localStorage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)};
 try{
  assert.equal(Clock.selectedZone(),'Australia/Melbourne');
  assert.equal(Clock.viewerZone(),'Australia/Melbourne');
  Clock.setViewerZone('');assert.equal(data.get('gofn-timezone'),'device');assert.equal(Clock.selectedZone(),'');
  Clock.setViewerZone('Asia/Tokyo');assert.equal(Clock.viewerZone(),'Asia/Tokyo');
  data.set('gofn-timezone','Invalid/Zone');assert.equal(Clock.viewerZone(),'Australia/Melbourne');
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
