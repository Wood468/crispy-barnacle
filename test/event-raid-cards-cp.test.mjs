import test from 'node:test';
import assert from 'node:assert/strict';
import Components from '../public/event-components.js';
function withGameMaster(run){
 const before=globalThis.GODASH;
 globalThis.GODASH={hundoPair(_event,p){return {'Zekrom':{n:2307,b:2884},'Crowned Sword Zacian':{n:2188,b:2735},'Mega Charizard X':{n:1651,b:2064}}[p.name]||null;}};
 try{return run();}finally{if(before===undefined)delete globalThis.GODASH;else globalThis.GODASH=before;}
}
const art=({n})=>'<img src="/mock.png" alt="'+n+'">';
test('dated event raid rosters display known tiers and perfect catch CP, but never label Max as raid',()=>withGameMaster(()=>{
 const html=Components.raidDayRosters([{date:'2026-11-14',five:['Zekrom','Unknown'],three:['Crowned Sword Zacian'],max:['Dynamax Dialga']},{date:'2026-11-15',five:['Mega Charizard X']}],{art});
 assert.match(html,/data-raid-date="2026-11-14"/);
 assert.match(html,/data-raid-date="2026-11-15"/);
 assert.equal((html.match(/class="ue-raid-tier-corner"/g)||[]).length,4);
 assert.match(html,/5★/);assert.match(html,/3★/);
 assert.match(html,/100% 2,307/);assert.match(html,/WB 2,884/);
 assert.match(html,/100% 2,188/);assert.match(html,/WB 2,735/);
 assert.doesNotMatch(html,/Unknown<\/b><span class="ue-raid-cp"/);
 assert.doesNotMatch(html,/Dynamax Dialga<\/b><span class="ue-raid-cp"/);
}));
test('verified published CP pair is respected for unknown species; invalid pair is not fabricated',()=>withGameMaster(()=>{
 const good=Components.raidDayRosters([{date:'2027-01-01',five:['Unknown'],cp:{Unknown:[1800,2250]}}],{art});
 assert.match(good,/100% 1,800/);assert.match(good,/WB 2,250/);
 const bad=Components.raidDayRosters([{date:'2027-01-01',five:['Unknown'],cp:{Unknown:[2250,1800]}}],{art});
 assert.doesNotMatch(bad,/class="ue-raid-cp"/);
}));
test('raid gallery gets separate tier and CP without leaking into Incense',()=>withGameMaster(()=>{
 const mons=[{key:'644:base:none',name:'Zekrom',speciesId:'644',shiny:'unknown'},{key:'201:d:none',name:'Unown D',speciesId:'201',formId:'d',shiny:'unknown'}];
 const model={title:'Future event',pokemon:mons,activities:[{id:'main',title:'Main'}],groups:{raid:[{identityKey:mons[0].key,activityId:'main',access:'all'}],incense:[{identityKey:mons[1].key,activityId:'main',access:'paid'}]},internalValidation:{conflicts:[],fields:{}}};
 const html=Components.gallery(model,{art});
 assert.match(html,/data-method="raid"/);assert.match(html,/Raid encounter; tier not specified/);
 assert.match(html,/100% 2,307/);assert.match(html,/data-method="incense"/);assert.match(html,/ue-incense-corner/);
 assert.equal((html.match(/class="ue-raid-cp"/g)||[]).length,1);
 assert.equal((html.match(/class="ue-raid-tier-corner"/g)||[]).length,1);
}));
