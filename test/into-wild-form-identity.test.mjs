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

test('verified curated activity schedules restore typed bosses when a source icon lost their form', async()=> {
 const {reconcileActivityEncounters} = await import('../scripts/importer/encounters.mjs');
 const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
 const dex=JSON.parse(readFileSync(new URL('../public/dex.json',import.meta.url),'utf8'));
 const row=data.events.find(e=>e.id==='into');
 const base={pokemon:[{key:'379:base:none',speciesId:'379',formId:null,costumeId:null,name:'Registeel',shiny:'unknown'}],
  encounters:[{identityKey:'379:base:none',method:'max',activityId:'main',access:'unknown'}],encounterConflicts:[]};
 const actual=reconcileActivityEncounters(base,row.activities,{dex});
 for(const [id,form,method] of [['888','crowned-sword','raid'],['889','crowned-shield','raid'],['379','dynamax','max'],['380','dynamax','max'],['381','dynamax','max'],['895','dynamax','max']]){
  const p=actual.pokemon.find(p=>p.speciesId===id&&p.formId===form);
  assert.ok(p,id+' '+form);
  assert.ok(actual.encounters.some(e=>e.identityKey===p.key&&e.method===method));
 }
 assert.ok(!actual.encounters.some(e=>e.identityKey==='379:base:none'&&e.method==='max'));
 assert.equal(reconcileActivityEncounters(base,[],{dex}),base,'no unsupported schedule means no invented form');
});

test('a lightweight API event cannot erase exact form schedule from matching curated record', async()=> {
 const {sourceBackedActivitiesFor}=await import('../scripts/importer/run.mjs');
 const {reconcileActivityEncounters}=await import('../scripts/importer/encounters.mjs');
 const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
 const dex=JSON.parse(readFileSync(new URL('../public/dex.json',import.meta.url),'utf8'));
 const curated=new Map(data.events.map(row=>[row.id,row]));
 const feedCopy={id:'into',t:'Into the Wild',activities:[]}; // API events may omit all curated day-specific bosses
 const schedule=sourceBackedActivitiesFor('into',feedCopy,curated);
 assert.equal(schedule.length,5,'must recover every sourced Raid/Max Hour including both variants');
 const flat={pokemon:[{key:'379:base:none',speciesId:'379',name:'Registeel'}],
  encounters:[{identityKey:'379:base:none',method:'max',activityId:'main'}]};
 const corrected=reconcileActivityEncounters(flat,schedule,{dex});
 for(const [speciesId,formId,method] of [
  ['888','crowned-sword','raid'],['889','crowned-shield','raid'],
  ['379','dynamax','max'],['380','dynamax','max'],
  ['381','dynamax','max'],['895','dynamax','max']]){
  const form=corrected.pokemon.find(p=>p.speciesId===speciesId&&p.formId===formId);
  assert.ok(form,speciesId+' '+formId+' missing from a refreshed API event');
  assert.ok(corrected.encounters.some(e=>e.identityKey===form.key&&e.method===method));
 }
 assert.deepEqual(sourceBackedActivitiesFor('unrelated',feedCopy,curated),[],
  'do not borrow a different event\'s bosses from a similar name or date');
});
