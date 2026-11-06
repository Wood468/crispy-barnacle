/* Cross-module migration and rendering contracts. Run with node --test. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {migrateLegacyEvent}=require('./legacy-bridge-v1.cjs');
const {reconcile}=require('./identity-index-v1.cjs');
const {normalize,identity}=require('./contract-v1.js');
const {project}=require('./view-v1.js');
test('curated legacy record survives projection without fabricated encounters',()=>{
 const original={id:'legacy-1',t:'Legacy example',s:'2027-01-02T10:00',e:'2027-01-02T13:00',p:['Unverified note'],art:[{n:'Example',shiny:true,costume:true}],detailIds:['leekduck:example']};
 const snapshot=JSON.stringify(original);
 const migrated=migrateLegacyEvent(original);
 assert.equal(JSON.stringify(original),snapshot);
 assert.equal(migrated.legacy.artRefs[0].shinyArtworkFlag,true);
 assert.equal(migrated.legacy.artRefs[0].costumeUnresolved,true);
 assert.equal(migrated.pokemon.length,0);
 assert.deepEqual(project(migrated).sections.map(x=>x.key),['overview']);
 assert.equal(reconcile([migrated]).resolve('leekduck:example'),null);
 assert.equal(reconcile([migrated]).resolve('legacy-1').eventId,'legacy-1');
});
test('synthetic future event renders optional content without event-specific branching',()=>{
 const key=identity({speciesId:'25'});
 const ev=normalize({schemaVersion:1,eventId:'future-synthetic',family:'unannounced-future-family',title:'Synthetic only',
 pokemon:[{speciesId:'25'}],encounters:[{identityKey:key,method:'wild'},{identityKey:key,method:'raid'}],
 activities:[{id:'rotation-1',parentId:'main',schedule:{start:'2027-01-01T10:00:00+11:00',end:'2027-01-01T11:00:00+11:00'}}],
 research:[{title:'Example research'}],passes:[{title:'Example pass'}],tickets:[{title:'Example ticket'}],
 sources:[{url:'https://example.invalid',confidence:0.3}]});
 const view=project(ev);
 assert.equal(view.family,'other');
 assert.deepEqual(view.sections.map(x=>x.key),['overview','encounters','rotations','research','passes','tickets']);
 assert.equal(view.encounterGroups.raid.length,1);
 assert.equal(view.encounterGroups.wild.length,1);
 assert.equal(JSON.stringify(view).includes('confidence'),false);
 assert.equal(JSON.stringify(view).includes('example.invalid'),false);
});
test('same identity remains stable across separately normalized events',()=>{
 const p={speciesId:'25',formId:'base',costumeId:'none'};
 assert.equal(identity(p),identity({...p}));
});
