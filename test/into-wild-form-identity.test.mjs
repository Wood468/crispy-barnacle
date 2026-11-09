import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const details=JSON.parse(readFileSync(new URL('../public/event-details.json',import.meta.url),'utf8'));
const event=details.events.into;
test('Crowned raid bosses retain exact identities',()=>{
 for(const [speciesId,formId] of [['888','crowned-sword'],['889','crowned-shield']]){
  const p=event.pokemon.find(p=>p.speciesId===speciesId&&p.formId===formId);
  assert.ok(p);
  assert.ok(event.encounters.some(e=>e.identityKey===p.key&&e.method==='raid'));
 }
});
test('Max Battle bosses retain Dynamax rather than ordinary identities',()=>{
 for(const speciesId of ['379','380','381','895']){
  const p=event.pokemon.find(p=>p.speciesId===speciesId&&p.formId==='dynamax');
  assert.ok(p);
  assert.ok(event.encounters.some(e=>e.identityKey===p.key&&e.method==='max'));
  assert.ok(!event.encounters.some(e=>e.identityKey===speciesId+':base:none'&&e.method==='max'));
 }
});
