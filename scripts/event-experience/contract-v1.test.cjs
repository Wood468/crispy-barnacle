/* Run: node --test scripts/event-experience/contract-v1.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const {identity, normalize} = require('./contract-v1.js');
const pikachu = identity({speciesId:'25'});
const hatA = identity({speciesId:'25',costumeId:'hat-a'});
const hatB = identity({speciesId:'25',costumeId:'hat-b'});
function event(extra={}) {
 return {schemaVersion:1,eventId:'synthetic-future-community-day',family:'community-day',title:'Synthetic test only',pokemon:[{speciesId:'25',shiny:'unknown'}],encounters:[{identityKey:pikachu,method:'wild'}],...extra};
}
test('future event with no research normalizes without event-specific code',()=> {
 const result=normalize(event());
 assert.equal(result.eventId,'synthetic-future-community-day');
 assert.equal(result.groups.wild.length,1);
 assert.equal(result.pokemon[0].shiny,'unknown');
});
test('same identity in wild and raids is in both method groups',()=> {
 const result=normalize(event({encounters:[{identityKey:pikachu,method:'wild'},{identityKey:pikachu,method:'raid'}]}));
 assert.equal(result.groups.wild.length,1);
 assert.equal(result.groups.raid.length,1);
 assert.equal(result.pokemon.length,1);
});
test('distinct costumes remain distinct',()=> {
 const result=normalize(event({pokemon:[{speciesId:'25',costumeId:'hat-a'},{speciesId:'25',costumeId:'hat-b'}],encounters:[{identityKey:hatA,method:'wild'},{identityKey:hatB,method:'wild'}]}));
 assert.equal(result.pokemon.length,2);
 assert.notEqual(hatA,hatB);
});
test('duplicate identical encounter edges are idempotent',()=> {
 const edge={identityKey:pikachu,method:'wild'};
 assert.deepEqual(normalize(event({encounters:[edge,edge]})),normalize(event({encounters:[edge]})));
});
test('invalid identity and dangling encounter are rejected',()=> {
 assert.throws(()=>identity({speciesId:''}),/speciesId/);
 assert.throws(()=>normalize(event({encounters:[{identityKey:'missing',method:'raid'}]})),/unknown Pokémon/);
});
test('event ID is stable across amended schedule metadata',()=> {
 assert.equal(normalize(event({schedule:{start:'2027-01-01'}})).eventId,normalize(event({schedule:{start:'2027-01-02'}})).eventId);
});
