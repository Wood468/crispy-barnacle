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
  assert.equal(View.researchTaskCount(event.research),2,'only individual tasks count');
  assert.deepEqual(tasks.map(row=>[row.task,row.rewards?.[0]?.name,row.rewards?.[0]?.quantity]),[
   ['Claim Reward!','Star Piece',1],['Use a Star Piece','Stardust',7740]
  ]);
  for(const task of tasks){
   assert.equal(task.eventId,id);
   assert.equal(task.eventWindow.start,curated.s);
   assert.equal(task.eventWindow.end,curated.e);
   assert.ok(task.sourceRefs?.some(source=>source.id==='hub'&&/^https:\/\/pokemongohub\.net\/post\/event\//.test(source.url)),'original research source must survive');
  }
  const html=UI.render(event,{});
  assert.match(html,/data-sec="research"/,'universal details navigation exposes Research');
  assert.match(html,/2 tasks/,'task count is not inflated by source prose or total rewards');
  assert.equal((html.match(/<article class="research-task"/g)||[]).length,2);
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
