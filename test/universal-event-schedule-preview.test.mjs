import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../public/event-components.js',import.meta.url),'utf8');
const begin=src.indexOf('function schedulePreview(model,ctx)');
const end=src.indexOf('function render(model,ctx)',begin);
assert.ok(begin>=0&&end>begin);
const preview=vm.runInNewContext('(function(esc,activityTime,activityPlace){'+src.slice(begin,end)+';return schedulePreview;})')(
  value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  a=>a.schedule.start,
  a=>typeof a.location==='string'?a.location:(a.location?.name||a.region||'')
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

test('preview displays an explicit location without inferring one',()=>{
 const located=activity('Local raid','2026-12-01T18:00');
 located.location='Melbourne';
 const html=preview({activities:[located,activity('Other raid','2026-12-02T18:00')]},{});
 assert.match(html,/<small>Melbourne<\/small>/);
 assert.equal((html.match(/<small>/g)||[]).length,1);
});

test('preview includes rotation activities and escapes location labels',()=>{
 const rotation=activity('Raid rotation','2026-12-01T18:00','rotation');
 rotation.location='<img src=x onerror=alert(1)>';
 const html=preview({activities:[rotation]},{});
 assert.match(html,/Raid rotation/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img/);
});


const timed=(id,start,end)=>({id,title:id,presentation:'schedule',schedule:{timeBasis:'instant',start,end}});
const realClockContext=now=>({now:Date.parse(now),viewerZone:'Australia/Melbourne',clock:{range:s=>({start:Date.parse(s.start),end:Date.parse(s.end)})}});

test('Overview schedule prefers live and upcoming activities over expired hours',()=>{
 const past=timed('Old raid hour','2027-01-01T18:00:00Z','2027-01-01T19:00:00Z');
 const live=timed('Live Max hour','2027-01-03T10:00:00Z','2027-01-03T12:00:00Z');
 const next=timed('Next raid hour','2027-01-04T18:00:00Z','2027-01-04T19:00:00Z');
 const html=preview({activities:[past,next,live]},realClockContext('2027-01-03T11:00:00Z'));
 assert.match(html,/Current &amp; upcoming activities/);
 assert.doesNotMatch(html,/Old raid hour/);
 assert.ok(html.indexOf('Live Max hour')<html.indexOf('Next raid hour'));
 assert.equal((html.match(/Live now/g)||[]).length,1);
});

test('schedule preview sorts different published ISO offsets by actual instant',()=>{
 const first=timed('Melbourne first','2027-01-02T13:00:00+11:00','2027-01-02T14:00:00+11:00');
 const second=timed('UTC second','2027-01-02T03:00:00Z','2027-01-02T04:00:00Z');
 const html=preview({activities:[second,first]},realClockContext('2027-01-01T00:00:00Z'));
 assert.ok(html.indexOf('Melbourne first')<html.indexOf('UTC second'));
});

test('after all scheduled hours end, Overview shows the most recent and marks no upcoming times',()=>{
 const acts=Array.from({length:7},(_,i)=>timed('Past '+i,'2027-01-0'+(i+1)+'T18:00:00Z','2027-01-0'+(i+1)+'T19:00:00Z'));
 const html=preview({activities:acts},realClockContext('2027-01-10T00:00:00Z'));
 assert.equal((html.match(/<li>/g)||[]).length,5);
 assert.doesNotMatch(html,/Past 0|Past 1/);
 assert.match(html,/No upcoming timed activities are listed/);
});

test('unresolvable schedules fall back to published order without losing a sourced activity',()=>{
 const bad=timed('Invalid source hour','invalid','invalid');
 const good=timed('Valid source hour','2027-01-03T18:00:00Z','2027-01-03T19:00:00Z');
 const html=preview({activities:[bad,good]},realClockContext('2027-01-04T00:00:00Z'));
 assert.match(html,/Invalid source hour/);
 assert.match(html,/Valid source hour/);
 assert.doesNotMatch(html,/No upcoming timed activities are listed/);
});
