import '../tests/event-view-sparse.test.js';
import '../tests/event-view-activity-schedule.test.js';
import '../tests/event-view-activity-pokemon.test.js';
import '../tests/test-event-reward-layout.js';
// Include the existing contract work in the repository's normal JavaScript CI command.
import '../scripts/event-experience/contract-v1.test.cjs';
import '../scripts/event-experience/view-v1.test.cjs';
import '../scripts/event-experience/legacy-bridge-v1.test.cjs';
import '../scripts/event-experience/identity-index-v1.test.cjs';
import '../scripts/event-experience/today-visibility.test.cjs';
import '../scripts/event-experience/integration-v1.test.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../public/event-contract.js'),A=require('../public/event-adapter.js'),V=require('../public/event-view.js'),UI=require('../public/event-components.js'),Clock=require('../public/event-clock.js');
const {buildCatalogue}=require('../scripts/event-experience/build-catalogue.cjs');
const event=(extra={})=>C.normalize({schemaVersion:1,eventId:'future-fixture',title:'Synthetic future announcement',...extra});
test('future families select reusable components and preserve legacy optional panels',()=>{
 for(const family of V.families){const html=UI.render(event({family}),{research:'RESEARCH_SENTINEL',passes:'PASS_SENTINEL',tickets:'TICKET_SENTINEL'});for(const text of ['RESEARCH_SENTINEL','PASS_SENTINEL','TICKET_SENTINEL'])assert.ok(html.includes(text),family+': '+text);}
});
test('a future festival renders nested rotations, multiple methods, exact forms and paid access',()=>{
 const p={speciesId:'25',name:'Pikachu',costumeId:'moon-crown',label:'Moon crown'},key=C.identity(p);
 const m=event({family:'go-fest',pokemon:[p],activities:[{id:'habitat',title:'Synthetic habitat'},{id:'hour-1',parentId:'habitat',title:'Synthetic hour',kind:'wild',access:'ticket holders',pokemonRefs:[key],schedule:{timeBasis:'instant',start:'2027-01-01T10:00Z',end:'2027-01-01T11:00Z'}}],encounters:[{identityKey:key,method:'raid'}]});
 const html=UI.render(m,{});assert.match(html,/In the wild/);assert.match(html,/Raid encounters/);assert.match(html,/Synthetic hour/);assert.match(html,/ticket holders/);assert.equal(m.pokemon.length,1);
});
test('root scheduled activities render without requiring a parent',()=>{
 const m=event({activities:[{id:'slot',title:'Future activity',schedule:{timeBasis:'instant',start:'2027-01-01T10:00Z',end:'2027-01-01T11:00Z'}}]});assert.match(UI.render(m,{}),/Future activity/);
});
test('DST ambiguity requires explicit policy and cannot regress after fallback',()=>{
 const s={timeBasis:'local',timeZone:'America/New_York',start:'2026-11-01T01:15',end:'2026-11-01T01:45'};assert.throws(()=>event({schedule:s}),/Ambiguous/);
 const earlier={...s,disambiguation:'earlier'};assert.equal(Clock.status(earlier,Date.parse('2026-11-01T05:30Z')),'active');assert.equal(Clock.status(earlier,Date.parse('2026-11-01T06:30Z')),'ended');
 const later={...s,disambiguation:'later'};assert.equal(Clock.status(later,Date.parse('2026-11-01T05:30Z')),'upcoming');assert.equal(Clock.status(later,Date.parse('2026-11-01T06:30Z')),'active');
});
test('nonexistent local times and invalid ISO offsets are rejected',()=>{
 assert.throws(()=>event({schedule:{timeBasis:'local',timeZone:'America/New_York',start:'2026-03-08T02:15',end:'2026-03-08T03:45'}}),/Nonexistent/);
 for(const offset of ['+23:59','+14:01','+99:00'])assert.equal(Clock.valid('2027-01-01T10:00'+offset,true),false);
 assert.equal(Clock.valid('2027-01-01T10:00+14:00',true),true);
});
test('last-known-good retains roster and encounters atomically during a partial update',()=>{
 const p={speciesId:'25',name:'Pikachu'},key=C.identity(p),previous=event({pokemon:[p],encounters:[{identityKey:key,method:'wild'}]});
 const next=event({pokemon:[{speciesId:'133',name:'Eevee'}],encounters:[]});const result=A.retain(previous,next);assert.equal(result.pokemon.length,2);assert.equal(result.groups.wild[0].identityKey,key);
 const replacement=A.retain(previous,event({completeness:'complete',pokemon:[],encounters:[]}));assert.equal(replacement.pokemon.length,0);assert.equal(replacement.encounters.length,0);
});
test('collection identity uses explicit forms and costumes rather than base species ownership',()=>{
 assert.equal(A.collectionName({name:'Raichu',formId:'alola'}),'Alolan Raichu');
 assert.equal(A.collectionName({name:'Pikachu',costumeId:'moon-crown'}),'Pikachu (moon-crown)');
 assert.equal(A.collectionName({name:'Raichu',formId:'unrecognized-new-form'}),null);
});
test('source references do not merge a pass with its parent event',()=>{
 const m=A.adapt({id:'pass',name:'GO Pass: Synthetic',detailIds:['source:parent-halloween']});assert.deepEqual(m.aliases,[]);assert.deepEqual(m.internalValidation.detailRefs,['source:parent-halloween']);
});
test('catalogue publication is idempotent and amendments retain stable IDs',()=>{
 const input={data:{events:[{id:'one',t:'Synthetic Community Day',s:'2027-01-01T14:00',e:'2027-01-01T17:00',scope:'worldwide_local'}]}};
 const first=buildCatalogue(input),second=buildCatalogue({...input,previous:first});assert.deepEqual(second,first);
 const next=structuredClone(input);next.data.events[0].s='2027-01-02T14:00';next.data.events[0].e='2027-01-02T17:00';const amended=buildCatalogue({...next,previous:first});assert.equal(amended.events[0].eventId,'one');assert.equal(amended.events[0].internalValidation.revision,2);assert.equal(amended.events[0].internalValidation.amended,true);
});
test('source outage preserves the last validated catalogue',()=>{const first=buildCatalogue({data:{events:[{id:'retained',t:'Synthetic event',art:['Pikachu']}]}});assert.deepEqual(buildCatalogue({previous:first}).events,first.events);});
test('no provenance or technical timestamps leak into primary presentation',()=>{
 const html=UI.render(event({sources:[{url:'https://example.invalid/private-metadata',confidence:1,updated:'2026-11-07'}],internalValidation:{fields:{bonuses:[{text:'2× Candy',status:'official',sources:['official']}]},warnings:[]}}),{});
 assert.doesNotMatch(html,/confidence|2026-11-07|Official|Single source|Cross-checked/);
 assert.doesNotMatch(html.split('<details class="ue-sources"')[0],/example.invalid/);
});
test('activities reject cycles, dangling parents and dangling encounter references',()=>{
 assert.throws(()=>event({activities:[{id:'one',parentId:'two'},{id:'two',parentId:'one'}]}),/cycle/);
 assert.throws(()=>event({activities:[{id:'one',parentId:'missing'}]}),/parent/);
 assert.throws(()=>event({activities:[{id:'one',kind:'raid',pokemonRefs:['missing']}]}),/unknown Pokémon/);
});

test('source parser accepts exact published encounter lists and does not infer claims from prose',async()=>{
 const {extractEncounters}=await import('../scripts/importer/encounters.mjs');
 const dex=[[25,'Pikachu',1],[26,'Raichu',1]];
 const result=extractEncounters('<h2>Wild encounters</h2><ul><li>Pikachu (Shiny available)</li><li>Raichu</li></ul><h2>Raids</h2><ul><li>Pikachu</li></ul><h2>Notes</h2><p>Shiny Raichu may be coming next year.</p>',{dex});
 assert.equal(result.pokemon.length,2);assert.equal(result.pokemon.find(p=>p.speciesId==='25').shiny,'yes');assert.equal(result.pokemon.find(p=>p.speciesId==='26').shiny,'unknown');assert.equal(result.encounters.filter(e=>e.identityKey==='25:base:none').length,2);assert.ok(result.encounters.every(e=>e.access==='unknown'));
 const empty=extractEncounters('<h2>Wild encounters</h2><p>Pikachu will not appear here.</p>',{dex});assert.equal(empty.pokemon.length,0);
});
test('source encounters keep distinct costumes and unresolved conflicts remain unknown',async()=>{
 const {extractEncounters,mergeEncounters}=await import('../scripts/importer/encounters.mjs');
 const options={dex:[[25,'Pikachu',1]],costumes:[{name:'Pikachu',label:'Test crown'}]};
 const a=extractEncounters('<h2>Wild encounters</h2><li>Pikachu (Test crown)</li><li>Pikachu (Shiny available)</li>',options);
 assert.equal(a.pokemon.length,2);assert.ok(a.pokemon.some(p=>p.costumeId));
 const b=extractEncounters('<h2>Wild encounters</h2><li>Pikachu (not shiny eligible)</li>',options);
 const merged=mergeEncounters([{fields:{eventEncounters:a}},{fields:{eventEncounters:b}},{fields:{eventEncounters:a}}]);assert.equal(merged.pokemon.find(p=>!p.costumeId).shiny,'unknown');assert.equal(merged.encounterConflicts.length,1);
});
test('published poster URL is extracted without authoring or guessing artwork',async()=>{
 const {posterFromHtml}=await import('../scripts/importer/encounters.mjs');
 assert.equal(posterFromHtml('<meta content="https://cdn.leekduck.com/synthetic-banner.jpg?a=1&amp;b=2" property="og:image">','https://example.invalid/event'),'https://cdn.leekduck.com/synthetic-banner.jpg?a=1&b=2');
 assert.equal(posterFromHtml('<meta property="og:image" content="https://pokemongohub.net/unapproved.png">','https://example.invalid/event'),null);
 assert.equal(posterFromHtml('<meta property="og:image" content="javascript:alert(1)">','https://example.invalid/event'),null);
 const {announcementFromPage}=await import('../scripts/importer/announcements.mjs');
 const page={source:'leekduck',url:'https://leekduck.com/events/synthetic-poster/',title:'Synthetic event',fields:{}};
 const announce=image=>announcementFromPage({...page,html:'<script type="application/ld+json">'+JSON.stringify({'@type':'Event',name:page.title,image})+'</script>'});
 assert.equal(announce('https://pokemongohub.net/unapproved.png').image,null);
 assert.equal(announce('https://cdn.leekduck.com/synthetic-banner.jpg').image,'https://cdn.leekduck.com/synthetic-banner.jpg');
});
test('confirmed shared article, title, region and dates reconcile duplicate source IDs',()=>{
 const data={events:[{id:'curated-pass',t:'GO Pass: Synthetic',s:'2027-01-01T10:00',e:'2027-02-01T10:00',detailIds:['source:pass']}]};
 const details={events:{'source:pass':{name:'GO Pass: Synthetic',sources:[{url:'https://example.invalid/go-pass'}]}}};
 const season={items:[{id:'season-pass',name:'GO Pass: Synthetic',s:'2027-01-01T10:00',e:'2027-02-01T10:00',detailId:'source:pass',url:'https://example.invalid/go-pass'}]};
 const first=buildCatalogue({data,details,season});assert.equal(first.events.length,1);assert.deepEqual(first.events[0].aliases,['season-pass']);
 assert.deepEqual(buildCatalogue({data,details,season,previous:first}),first);
});
test('similarly named different-region events and shared parent articles stay separate',()=>{
 const data={events:[{id:'city-a',t:'Synthetic Safari',s:'2027-01-01T10:00',e:'2027-01-01T18:00',location:'City A',sourceUrl:'https://example.invalid/announcement'},{id:'city-b',t:'Synthetic Safari',s:'2027-01-01T10:00',e:'2027-01-01T18:00',location:'City B',sourceUrl:'https://example.invalid/announcement'}]};assert.equal(buildCatalogue({data}).events.length,2);
});
test('official identity rulings preserve provider IDs as aliases',()=>{
 const result=buildCatalogue({data:{events:[{id:'canonical',t:'Synthetic original'},{id:'provider-renamed',t:'Synthetic amended'}]},aliases:{same:[['canonical','provider-renamed']]}});assert.equal(result.events.length,1);assert.ok(result.events[0].aliases.includes('provider-renamed'));
});
test('source references containing private links are not re-published in the universal catalogue',()=>{
 const result=buildCatalogue({data:{events:[{id:'public',t:'Synthetic event',sourceUrl:'https://discord.com/channels/@me/123/456'}]}});assert.doesNotMatch(JSON.stringify(result),/channels\/@me/);assert.equal(result.events.length,1);
});
test('equivalent source form spellings resolve consistently without combining Shadow forms',()=>{
 A.configureSpecies([[487,'Giratina',4]]);
 assert.equal(A.pokemon({name:'Origin Forme Giratina'}).key,A.pokemon({name:'Giratina (Origin Forme)'}).key);
 assert.notEqual(A.pokemon({name:'Shadow Giratina (Origin Forme)'}).key,A.pokemon({name:'Shadow Giratina (Altered Forme)'}).key);
 A.configureSpecies([]);
});
test('conflicting bonuses are withheld from primary content instead of showing both as facts',()=>{
 const model=event({bonuses:['2× Catch Candy','3× Catch Candy'],internalValidation:{conflicts:[{field:'bonuses',a:{text:'2× Catch Candy'},b:{text:'3× Catch Candy'}}]}});const html=UI.render(model,{});assert.doesNotMatch(html,/2× Catch Candy|3× Catch Candy/);assert.doesNotMatch(html,/Some event details conflict/);
});
test('cancellations remain cancelled during an incomplete refresh and render a consequential warning',()=>{
 const cancelled=event({lifecycle:'cancelled'}),partial=event({});assert.equal(A.retain(cancelled,partial).lifecycle,'cancelled');assert.match(UI.render(cancelled,{}),/Event cancelled/);
});
test('native future research, GO Pass stages and prices render without legacy helpers',()=>{
 const model=event({research:[{task:'Catch 5 Pokémon',rewards:[{name:'Rare Candy',quantity:3}]}],passes:[{title:'Future pass',stages:[{rank:2,points:100,free:['1 Candy'],deluxe:['1 Pass']}]}],tickets:[{title:'Future ticket',price:{amount:1000,currency:'JPY'}}]});const html=UI.render(model,{});for(const text of ['Catch 5 Pokémon','Rare Candy','Rank 2','100 points','1 Candy','1 Pass','JPY'])assert.ok(html.includes(text),text);
});
test('all compiled catalogue records validate and render without event-specific branches',()=>{
 const catalogue=require('../public/events-v1.json');
 for(const model of catalogue.events){const normalized=C.normalize(model),html=UI.render(normalized,{});assert.ok(html.includes('id="evd-t"'),model.eventId);assert.ok(html.includes( String(model.title).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')),model.eventId);}
 assert.ok(catalogue.coverage.some(c=>c.collection==='world-events'));assert.ok(catalogue.coverage.some(c=>c.collection==='rotation'));assert.ok(catalogue.excluded.some(c=>c.collection==='regionals'));
});

test('new trusted global announcements publish without a curated event or physical venue',async()=>{
 const {announcementFromPage}=await import('../scripts/importer/announcements.mjs');
 const page={source:'leekduck',url:'https://leekduck.com/events/synthetic-new-announcement-2027/',title:'Synthetic Future Festival',html:'<h2>Wild encounters</h2><li>Pikachu</li>',fields:{bonuses:['2× Catch Candy']}};
 const announcement=announcementFromPage(page,{dex:[[25,'Pikachu',1]]});assert.equal(announcement.eventId,'leekduck:synthetic-new-announcement-2027');assert.equal(announcement.lifecycle,'announced');assert.equal(announcement.schedule,null);assert.equal(announcement.pokemon.length,1);
 const result=buildCatalogue({details:{events:{[announcement.eventId]:{name:announcement.title,normalizedEvent:announcement}}}});assert.equal(result.events.length,1);assert.equal(result.events[0].internalValidation.native,true);assert.match(UI.render(result.events[0],{}),/Synthetic Future Festival/);
 const amended=announcementFromPage({...page,html:page.html+'<p>Amended prose</p>'},{dex:[[25,'Pikachu',1]]});assert.equal(amended.eventId,announcement.eventId);
});
test('source-specific discovery rejects unsupported hosts and generic guide pages',async()=>{
 const {announcementFromPage}=await import('../scripts/importer/announcements.mjs');
 assert.equal(announcementFromPage({source:'official',url:'https://untrusted.invalid/news/event-announced',title:'Event',html:''}),null);
 assert.equal(announcementFromPage({source:'hub',url:'https://pokemongohub.net/post/guide/synthetic-guide-page/',title:'Synthetic guide',html:''}),null);
});
test('machine-readable festival rotations preserve nested schedules and explicit free/paid access',async()=>{
 const {announcementFromPage}=await import('../scripts/importer/announcements.mjs');
 const machine={'@type':'Event',name:'Synthetic Festival',startDate:'2027-01-01T00:00Z',endDate:'2027-01-02T00:00Z',subEvent:[{'@type':'Event',identifier:'habitat-one',name:'Synthetic habitat',subEvent:[{'@type':'Event',identifier:'wild-one',name:'Wild encounters',startDate:'2027-01-01T10:00Z',endDate:'2027-01-01T11:00Z',isAccessibleForFree:false,description:'<h2>Wild encounters</h2><li>Pikachu</li>'}]}]};
 const html='<script type="application/ld+json">'+JSON.stringify(machine)+'</script>';
 const m=announcementFromPage({source:'leekduck',url:'https://leekduck.com/events/synthetic-festival-2027/',title:'Synthetic Festival',html,fields:{}},{dex:[[25,'Pikachu',1]]});assert.equal(m.activities.length,2);assert.equal(m.activities[1].parentId,m.activities[0].id);assert.equal(m.encounters[0].activityId,'activity:wild-one');assert.equal(m.encounters[0].access,'paid');
});
test('malformed announced schedules retain the event while withholding invalid timing',async()=>{
 const {announcementFromPage}=await import('../scripts/importer/announcements.mjs');
 const m=announcementFromPage({source:'leekduck',url:'https://leekduck.com/events/synthetic-invalid-date-2027/',title:'Synthetic invalid date',html:'<script type="application/ld+json">'+JSON.stringify({'@type':'Event',name:'Synthetic invalid date',startDate:'2027-02-30T10:00Z',endDate:'2027-03-01T10:00Z'})+'</script>',fields:{}},{});assert.equal(m.schedule,null);assert.ok(m.internalValidation.warnings.length);assert.equal(m.lifecycle,'announced');
});
test('announced overseas events with unknown schedules stay visible without being marked active',()=>{
 const policy=require('../public/event-policy.js');const result=policy.todayPlacement({lifecycle:'announced',attendance:'in-person',schedule:null},'2026-11-07T00:00Z','Australia/Melbourne');assert.equal(result.visible,true);assert.equal(result.status,'unknown');assert.equal(result.section,'announced-in-person');
});
test('partial updates do not revive a disputed shiny claim',()=>{
 const p={speciesId:'25',name:'Pikachu'},key=C.identity(p);
 const old=event({pokemon:[{...p,shiny:'yes'}]});
 const next=event({pokemon:[{...p,shiny:'unknown'}],internalValidation:{conflicts:[{field:'shiny',identityKey:key}]}});
 assert.equal(A.retain(old,next).pokemon[0].shiny,'unknown');
});
test('malformed child timing is quarantined without losing the new event',async()=>{
 const {announcementFromPage}=await import('../scripts/importer/announcements.mjs');
 const machine={'@type':'Event',name:'Synthetic child dates',subEvent:[{name:'Wild encounters',startDate:'2027-02-30T10:00Z',endDate:'2027-03-01T10:00Z'}]};
 const m=announcementFromPage({source:'leekduck',url:'https://leekduck.com/events/synthetic-child-dates/',title:machine.name,html:'<script type="application/ld+json">'+JSON.stringify(machine)+'</script>',fields:{}},{});
 assert.equal(m.activities.length,1);assert.equal(m.activities[0].schedule,null);assert.ok(m.internalValidation.warnings.length);
});
test('gallery merges visually identical source edges without collapsing encounter methods',()=>{
 const p={speciesId:'25',name:'Pikachu'},key=C.identity(p);
 const m=event({pokemon:[p],encounters:[{identityKey:key,method:'other',access:'all'},{identityKey:key,method:'other',access:'unknown'},{identityKey:key,method:'wild'}]});
 const html=UI.render(m,{});assert.equal((html.match(/data-identity="25:base:none"/g)||[]).length,2);
 const featured=UI.render(event({pokemon:[p],encounters:[{identityKey:key,method:'other'}]}),{});assert.equal((featured.match(/Featured Pokémon/g)||[]).length,1);
});

 test('activity-only references render actual encounter groups after normalization',()=>{
 const raw={schemaVersion:1,eventId:'future-activity-only',title:'Synthetic activity-only event',pokemon:[{speciesId:'25',name:'Pikachu'},{speciesId:'25',name:'Pikachu',costumeId:'test-hat',label:'Test hat'}],activities:[{id:'wild',kind:'wild',pokemonRefs:['25:base:none','25:base:none','25:base:test-hat']},{id:'raid',kind:'raid',pokemonRefs:['25:base:none']}]};
 const before=JSON.stringify(raw),model=C.normalize(raw),html=UI.render(model,{});
 assert.equal(model.groups.wild.length,2);assert.equal(model.groups.raid.length,1);
 assert.match(html,/data-method="wild"/);assert.match(html,/data-method="raid"/);
 assert.equal((html.match(/data-identity="25:base:none"/g)||[]).length,2);
 assert.equal((html.match(/data-identity="25:base:test-hat"/g)||[]).length,1);
 assert.equal(JSON.stringify(raw),before);assert.equal(model.pokemon[0].shiny,'unknown');
 });

test('reviewed source corrections reconcile aliases while retaining published identities and local times',()=>{
 const data={events:[{id:'canonical',t:'Synthetic overseas event'},{id:'source-copy',t:'Synthetic overseas event',aliases:['old-source-link']}]};
 const previous=buildCatalogue({data});
 const corrections={schemaVersion:1,events:{canonical:{aliases:['source-copy'],attendance:'in-person',location:'Tokyo, Japan',schedule:{start:'2027-01-01T10:00',end:'2027-01-01T18:00',timeBasis:'local',timeZone:'Asia/Tokyo'}}}};
 const next=buildCatalogue({data,previous,corrections});
 assert.equal(next.events.length,1);assert.equal(next.events[0].eventId,'canonical');
 for(const id of ['source-copy','old-source-link'])assert.ok(next.events[0].aliases.includes(id));
 assert.equal(next.events[0].schedule.timeZone,'Asia/Tokyo');
 assert.equal(next.events[0].attendance,'in-person');
 const again=buildCatalogue({data,previous:next,corrections});
 assert.deepEqual(again.events.map(e=>e.eventId),['canonical']);
 assert.deepEqual(again.events[0].aliases,next.events[0].aliases);
});
test('nested habitat headings retain wild method until the next peer section',async()=>{
 const {extractEncounters}=await import('../scripts/importer/encounters.mjs');
 const result=extractEncounters('<h2>Spawns</h2><h3>Solid as Steel Hour</h3><li>Pikachu</li><h3>Daring as Dragons Hour</h3><li>Raichu</li><h2>Research</h2><li>Pikachu</li>',{dex:[[25,'Pikachu'],[26,'Raichu']]});
 assert.deepEqual(result.encounters.map(e=>[e.identityKey,e.method]),[['25:base:none','wild'],['26:base:none','wild']]);
});

test('new authoritative schedules take precedence over reviewed fallback corrections',()=>{
 const schedule={timeBasis:'instant',start:'2027-01-02T10:00Z',end:'2027-01-02T18:00Z'};
 const data={events:[{schemaVersion:1,eventId:'native-amendment',title:'Synthetic amended event',schedule,pokemon:[]}]};
 const corrections={schemaVersion:1,events:{'native-amendment':{schedule:{...schedule,start:'2027-01-01T10:00Z',end:'2027-01-01T18:00Z'}}}};
 assert.deepEqual(buildCatalogue({data,corrections}).events[0].schedule,schedule);
});
test('long GO Pass tracks group exact source ranks into compact expandable ranges',()=>{
 const stages=Array.from({length:98},(_,i)=>({rank:i+2,free:['Rare Candy'],deluxe:['Premium Battle Pass']}));
 const html=UI.render(event({passes:[{title:'Synthetic long GO Pass',stages}]}),{});
 assert.equal((html.match(/class="ue-pass-range"/g)||[]).length,4);
 assert.match(html,/Ranks 2–25/);assert.match(html,/Ranks 76–99/);
 assert.equal((html.match(/<li><b>Rank /g)||[]).length,98);
 assert.doesNotMatch(html,/<li><b>Rank 1<\/b>/);
});
