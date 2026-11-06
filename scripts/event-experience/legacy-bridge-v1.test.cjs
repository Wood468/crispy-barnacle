const test=require('node:test');
const assert=require('node:assert/strict');
const {migrateLegacyEvent}=require('./legacy-bridge-v1.cjs');
const legacy={id:'halloween1',detailIds:['halloween1','leekduck:halloween-2026-part-1'],t:'Halloween Part One',s:'2026-10-27T10:00',e:'2026-11-01T10:00',art:[{n:'Pikachu',costume:1,label:'Hat and capelet'},{n:'Pikachu',shiny:1}],bonuses:['Bonus'],p:['Costume in wild'],sourceUrl:'https://example.org/announcement'};
test('legacy IDs, detail aliases and notes survive read-only migration',()=>{
 const before=JSON.stringify(legacy),e=migrateLegacyEvent(legacy);
 assert.equal(JSON.stringify(legacy),before);
 assert.equal(e.eventId,'halloween1');
 assert.deepEqual(e.aliases,['halloween1','leekduck:halloween-2026-part-1']);
 assert.deepEqual(e.legacy.notes,['Costume in wild']);
 assert.equal(e.legacy.start,'2026-10-27T10:00');
 assert.equal(e.bonuses[0],'Bonus');
});
test('art does not invent costume IDs, shiny claims or encounter methods',()=>{
 const e=migrateLegacyEvent(legacy);
 assert.equal(e.pokemon.length,0);
 assert.equal(e.encounters.length,0);
 assert.equal(e.legacy.artRefs[0].costumeUnresolved,true);
 assert.equal(e.legacy.artRefs[1].shinyArtworkFlag,true);
});
test('unknown legacy timezone stays unresolved rather than guessed',()=>{
 const e=migrateLegacyEvent(legacy);
 assert.equal(e.schedule,null);
 assert.equal(e.legacy.end,'2026-11-01T10:00');
});
test('missing legacy identity fails closed',()=>{
 assert.throws(()=>migrateLegacyEvent({t:'Untitled'}),/id and title/);
});
