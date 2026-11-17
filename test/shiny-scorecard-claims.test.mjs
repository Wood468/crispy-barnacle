import test from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../scripts/shiny-scorecard.mjs';

const now=Date.parse('2026-11-17T00:00:00Z');
const art=(overrides={})=>({n:'Pikachu',label:'Party Hat',costume:true,shiny:true,...overrides});
const event=(overrides={})=>({id:'party',s:'2026-11-18T10:00:00Z',e:'2026-11-19T10:00:00Z',sourceUrl:'https://pokemongolive.com/post/party',art:[art()],...overrides});
const check=(events)=>score({events,costumes:{pictures:{'pikachu|party hat':'/party.png'},shiny:{'pikachu|party hat':'/party-shiny.png'},missing:[]},dex:[[25,'Pikachu']],now});

test('a shiny-capable costume contributes both costume and shiny claims',()=>{
 const r=check([event()]);
 assert.deepEqual({claims:r.claims,official:r.official,unsourced:r.unsourced,score:r.score},{claims:2,official:2,unsourced:0,score:100});
 assert.deepEqual(r.issues,[]);
});
test('single-flag costume and shiny art remain single claims',()=>{
 const r=check([event({art:[art({shiny:false}),art({costume:false})]})]);
 assert.equal(r.claims,2);
 assert.equal(r.official,2);
});
test('source weights apply independently to both claims, including no-source warning',()=>{
 const r=check([event({sourceUrl:'https://unverified.example/post'})]);
 assert.equal(r.claims,2);
 assert.equal(r.unsourced,2);
 assert.equal(r.score,0);
 assert.equal(r.issues.filter(i=>i.issue==='shiny/costume claims with no source link').length,1);
});
test('expired or future claims are excluded without mutating input',()=>{
 const rows=[event({e:'2026-11-16T00:00:00Z'}),event({id:'future',s:'2027-01-01T00:00:00Z',e:'2027-01-02T00:00:00Z'})];
 const before=structuredClone(rows);
 const r=check(rows);
 assert.equal(r.claims,0);
 assert.deepEqual(rows,before);
});
test('plain non-claim artwork and string artwork do not count',()=>{
 const r=check([event({art:['Pikachu',art({costume:false,shiny:false})]})]);
 assert.equal(r.claims,0);
});
