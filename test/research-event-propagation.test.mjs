// Regression: an importer task must reach the reusable event contract AND the
// Event Details presentation. Checking event-details.json alone is insufficient.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {buildCatalogue}=require('../scripts/event-experience/build-catalogue.cjs');
const UI=require('../public/event-components.js');
const View=require('../public/event-view.js');

const load=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const data=load('../public/data.json');
const details=load('../public/event-details.json').events;
const dex=load('../public/dex.json');

for (const id of ['minior','minior2']) {
 test('Minior '+id+' research survives the importer → canonical event → Event Details path',()=>{
  const curated=data.events.find(event=>event.id===id);
  const detail=details[id];
  assert.ok(curated&&detail,'expected a curated event with source details');
  const compiled=buildCatalogue({dex,data:{events:[curated]},details:{events:{[id]:detail}}});
  const matches=compiled.events.filter(event=>event.eventId===id);
  assert.equal(matches.length,1,'a source write-up must not create a duplicate');
  const event=matches[0];
  const tasks=event.research.filter(row=>row&&typeof row.task==='string');
  const sourcedTasks=detail.researchTasks;
  assert.ok(sourcedTasks.length>=2,'expected published source-backed tasks');
  assert.equal(View.researchTaskCount(event.research),sourcedTasks.length,
    'every imported individual task, including optional bonus tracks, reaches the event contract');
  const signature=row=>JSON.stringify([row.category,row.task,(row.rewards||[]).map(reward=>[reward.name,reward.quantity])]);
  assert.deepEqual(tasks.map(signature).sort(),sourcedTasks.map(signature).sort(),
    'the reusable event contract must preserve the imported tasks and rewards');
  for(const [name,reward,quantity] of [['Claim Reward!','Star Piece',1],['Use a Star Piece','Stardust',7740]]) {
   assert.ok(tasks.some(task=>task.task===name&&task.rewards?.some(r=>r.name===reward&&r.quantity===quantity)),
     'missing published research reward '+name);
  }
  for(const task of tasks){
   assert.equal(task.eventId,id);
   assert.equal(task.eventWindow.start,curated.s);
   assert.equal(task.eventWindow.end,curated.e);
   assert.ok(task.sourceRefs?.some(source=>source.id==='hub'&&/^https:\/\/pokemongohub\.net\/post\/event\//.test(source.url)),'original research source must survive');
  }
  const html=UI.render(event,{});
  assert.match(html,/data-sec="research"/,'universal details navigation exposes Research');
  assert.match(html,new RegExp(sourcedTasks.length+' tasks?'),
    'displayed task count is consistent with sourced individual tasks');
  assert.equal((html.match(/<article class="research-task"/g)||[]).length,sourcedTasks.length,
    'the Event Details gallery must not drop optional sourced research tasks');
  assert.match(html,/Claim Reward!/);
  assert.match(html,/Use a Star Piece/);
  assert.match(html,/Star Piece/);
  assert.match(html,/Stardust/);
 });
}

// The same contract must not mistake source notes for parsed research tasks.
test('research prose alone never becomes a structured task or phantom reward',()=>{
 const curated=data.events.find(event=>event.id==='minior2');
 const record={...details.minior2,researchTasks:[]};
 const compiled=buildCatalogue({dex,data:{events:[curated]},details:{events:{minior2:record}}});
 const event=compiled.events.find(event=>event.eventId==='minior2');
 assert.ok(event);
 assert.equal(View.researchTaskCount(event.research),0);
 assert.equal((UI.render(event,{}).match(/<article class="research-task"/g)||[]).length,0);
});
