/* Universal event renderer regression coverage: synthetic future events, no event-ID branches. */
'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const components=require('../public/event-components.js');

function futureEvent(overrides={}){
 return Object.assign({
  schemaVersion:1,eventId:'future-announcement-2099',title:'Future Global Event',
  family:'wild-area',lifecycle:'announced',location:null,
  pokemon:[],encounters:[],groups:{},activities:[],bonuses:[],notes:[],
  research:[],passes:[],tickets:[],sources:[],internalValidation:{conflicts:[],fields:{},info:[]}
 },overrides);
}
function render(model,ctx={}){
 return components.render(model,Object.assign({when:'Dates to be announced',rewardArt:()=>'<span class="costume-unavailable">Artwork not available for this form</span>'},ctx));
}
test('future event renders research rewards without event-specific code',()=>{
 const html=render(futureEvent({research:[{task:'Catch 10 Pokémon',rewards:[
  {type:'encounter',name:'Example Pokémon',cpMin:100,cpMax:120},
  {type:'item',name:'Golden Razz Berry',quantity:3},
  {type:'item',name:'Stardust',quantity:500}
 ]}]}));
 assert.match(html,/Catch 10 Pokémon/);
 assert.equal((html.match(/class="research-reward"/g)||[]).length,3);
 assert.equal((html.match(/class="ue-reward-art"/g)||[]).length,3);
 assert.match(html,/CP 100–120/);
 assert.match(html,/3× Golden Razz Berry/);
 assert.match(html,/500× Stardust/);
 assert.match(html,/Artwork not available for this form/);
});
test('unknown reward artwork gets compact fallback without fabricated species',()=>{
 const html=render(futureEvent({research:[{task:'Complete a task',rewards:[{type:'encounter',name:'Unconfirmed encounter'}]}]}),{rewardArt:()=>''});
 assert.match(html,/ue-reward-icon/);
 assert.match(html,/Unconfirmed encounter/);
});
test('research names are escaped, and event without sources has no dead Sources link',()=>{
 const html=render(futureEvent({research:[{task:'A <script>alert(1)<\/script>',rewards:['Mystery reward']}]}));
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/Mystery reward/);
 assert.match(html,/<span class="ue-reward-art"><span class="ue-reward-icon" aria-hidden="true">★<\/span><\/span><span><b>Mystery reward<\/b>/);
 assert.doesNotMatch(html,/href="#evd-sources"/);
});
test('gallery preserves independent activities with identical display names',()=>{
 const p={key:'25|default',name:'Pikachu',speciesId:'25',shiny:'unknown'};
 const model=futureEvent({
  pokemon:[p],encounters:[{method:'raid'}],
  groups:{raid:[{identityKey:p.key,activityId:'first'},{identityKey:p.key,activityId:'second'}]},
  activities:[{id:'first',title:'Raid hour'},{id:'second',title:'Raid hour'}]
 });
 const html=components.gallery(model,{});
 assert.equal((html.match(/class="ue-mon evd-f"/g)||[]).length,2);
});

test('text-only rewards escape hostile content inside the contained artwork layout',()=>{
 const html=render(futureEvent({research:[{task:'Spin a PokéStop',rewards:['<img src=x onerror=alert(1)> & 100 Stardust']}]}));
 assert.equal((html.match(/class="ue-reward-art"/g)||[]).length,1);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt; &amp; 100 Stardust/);
});

const view=require('../public/event-view.js');
test('incomplete future ingestion tolerates null activity records without hiding valid schedule',()=>{
 const model=futureEvent({activities:[null,{id:'rotation',presentation:'rotation',schedule:{start:'2099-01-01T10:00:00'}},{id:'research',presentation:'research',schedule:{start:'2099-01-01T11:00:00'}},{id:'ticket',presentation:'ticket',schedule:{start:'2099-01-01T12:00:00'}}]});
 const projected=view.project(model);
 assert.equal(projected.sections.find(s=>s.key==='rotations').count,1);
 assert.equal(projected.sections.find(s=>s.key==='research').count,1);
 assert.equal(projected.sections.find(s=>s.key==='tickets').count,1);
});
