import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../public/event-components.js',import.meta.url),'utf8');
const begin=src.indexOf('function schedulePreview(model,ctx)');
const end=src.indexOf('function render(model,ctx)',begin);
assert.ok(begin>=0&&end>begin);
const preview=vm.runInNewContext('(function(esc,activityTime){'+src.slice(begin,end)+';return schedulePreview;})')(
  value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  a=>a.schedule.start
);
const activity=(id,date,presentation='schedule')=>({id,title:id,presentation,schedule:{start:date,end:date,timeBasis:'player-local'}});

test('universal preview orders activities by date across event families',()=>{
 const html=preview({activities:[activity('later','2026-12-03T18:00'),activity('earlier','2026-12-01T18:00')]},{});
 assert.ok(html.indexOf('earlier')<html.indexOf('later'));
 assert.match(html,/Event schedule/);
});
test('preview skips unscheduled activities and handles empty events',()=>{
 assert.equal(preview({activities:[]},{}),'');
 assert.equal(preview({activities:[{id:'unconfirmed',title:'No time'}]},{}),'');
});
test('preview limits cards and indicates remaining entries',()=>{
 const html=preview({activities:Array.from({length:7},(_,i)=>activity('Day '+i,'2026-12-0'+(i+1)+'T18:00'))},{});
 assert.equal((html.match(/<li>/g)||[]).length,5);
 assert.match(html,/\+2 more scheduled activities/);
});
test('preview escapes activity titles',()=>{
 const html=preview({activities:[activity('<script>','2026-12-01T18:00')]},{});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});
