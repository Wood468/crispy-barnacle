const test=require('node:test');
const assert=require('node:assert/strict');
const {todayPlacement,scheduleStatus}=require('./today-visibility.js');
const now='2026-11-07T00:00:00Z';
const zone='Australia/Melbourne';
function event(schedule,more={}){return {eventId:'fixture-global',schedule,...more};}
test('announced overseas in-person event stays visible before opening',()=>{
 const e=event({timeBasis:'local',timeZone:'America/Mexico_City',start:'2026-11-15T10:00',end:'2026-11-15T18:00'},{attendance:'in-person',region:'MX'});
 assert.deepEqual([todayPlacement(e,now,zone).visible,todayPlacement(e,now,zone).section],[true,'upcoming-in-person']);
});
test('regional and global active events are equally visible',()=>{
 const s={timeBasis:'instant',start:'2026-11-06T20:00:00Z',end:'2026-11-07T04:00:00Z'};
 assert.equal(todayPlacement(event(s,{region:'JP'}),now,zone).visible,true);
 assert.equal(todayPlacement(event(s,{region:'AU'}),now,zone).visible,true);
});
test('upcoming global events do not flood happening now',()=>{
 const s={timeBasis:'instant',start:'2026-11-15T00:00:00Z',end:'2026-11-16T00:00:00Z'};
 assert.equal(todayPlacement(event(s),now,zone).visible,false);
});
test('ended overseas events are not permanently pinned',()=>{
 const s={timeBasis:'instant',start:'2026-11-01T00:00:00Z',end:'2026-11-02T00:00:00Z'};
 assert.equal(todayPlacement(event(s,{inPerson:true,region:'US'}),now,zone).visible,false);
});
test('unknown schedule is not silently treated as active',()=>{
 assert.equal(scheduleStatus(null,Date.parse(now)),'unknown');
 assert.equal(todayPlacement(event(null,{inPerson:true}),now,zone).visible,false);
});
test('viewer timezone does not alter overseas event activity status',()=>{
 const s={timeBasis:'local',timeZone:'America/Mexico_City',start:'2026-11-06T17:00',end:'2026-11-06T20:00'};
 assert.equal(todayPlacement(event(s,{inPerson:true}),now,'Pacific/Auckland').status,todayPlacement(event(s,{inPerson:true}),now,'Australia/Melbourne').status);
});
