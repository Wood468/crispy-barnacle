import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/dash.js',import.meta.url),'utf8');
const start=source.indexOf('var maxRows=(slot.max||[]).map(function(name){');
const end=source.indexOf("          body+='<div class=\"rw-raid rw-event-day\"",start);
assert.ok(start>=0 && end>start,'event-day Max Battle renderer must exist');
const renderer=source.slice(start,end);
function render(name){
  const calls=[];
  const scope={slot:{max:[name]},esc:s=>String(s),monArt:(event,form)=>{calls.push({event,form});return '<img>';}};
  runInNewContext(renderer+';this.OUTPUT=maxRows;',scope);
  return {calls,html:scope.OUTPUT};
}
test('event-day Gigantamax keeps exact form in artwork contract',()=>{
  const {calls,html}=render('Gigantamax Duraludon');
  assert.equal(calls.length,1);
  assert.equal(calls[0].form.name,'Gigantamax Duraludon');
  assert.match(html,/Gigantamax Duraludon/);
});
test('event-day Dynamax keeps explicit form in artwork contract',()=>{
  const {calls}=render('Dynamax Machop');
  assert.equal(calls[0].form.name,'Dynamax Machop');
});
test('unprefixed event-day Max Battle boss retains existing species',()=>{
  const {calls}=render('Bulbasaur');
  assert.equal(calls[0].form.name,'Bulbasaur');
});
