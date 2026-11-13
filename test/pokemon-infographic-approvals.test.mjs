import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {encodeInfographicTargets,decodeInfographicTargets} from '../src/infographic-decision-wire.mjs';
import {applyDecisions} from '../scripts/g47ix-apply.mjs';
import {sanitizePublicInfographicSources} from '../scripts/g47ix-publish.mjs';
import {targetsFromInfographicDecision,infographicMatchesRaidBoss} from '../scripts/infographic-target-contract.mjs';
const require=createRequire(import.meta.url);
const L=require('../public/pokemon-guides-logic.js');
const target=(battleMode,pokemonId='006',formId=null)=>({type:'raid-boss',pokemonId,formId,battleMode});
const image='/infographics/g47ix/approved.webp';
function registry(){return {candidates:[{id:'discord:abc',title:'Raid guide',reviewStatus:'needs_review',stagedPath:image,creator:'Example artist',url:'https://discord.com/channels/1/2'}]};}
test('legacy approvals round-trip without an event schema migration',()=>{
 const stored=encodeInfographicTargets({eventId:'raid:yveltal:2026-11-06',targets:[]});
 assert.equal(stored.stored,'raid:yveltal:2026-11-06');
 const data=decodeInfographicTargets(stored.stored);
 assert.equal(data.eventId,stored.stored);assert.equal(data.targets[0].type,'event');
 assert.equal(data.targets[0].eventId,stored.stored);
});
test('explicit boss target saves without an event, preserving exact form/mode',()=>{
 const one=target('mega','006','mega-x'), two=target('shadow','006');
 const encoded=encodeInfographicTargets({eventId:'',targets:[two,one]});
 assert.match(encoded.stored,/^targets-v1:/);
 const data=decodeInfographicTargets(encoded.stored);
 assert.equal(data.eventId,'');
 assert.equal(infographicMatchesRaidBoss(data.targets,{pokemonId:'006',formId:'mega-x',battleMode:'mega'}),true);
 assert.equal(infographicMatchesRaidBoss(data.targets,{pokemonId:'006',formId:'mega-y',battleMode:'mega'}),false);
 assert.equal(infographicMatchesRaidBoss(data.targets,{pokemonId:'006',formId:null,battleMode:'normal'}),false);
 assert.equal(infographicMatchesRaidBoss(data.targets,{pokemonId:'006',formId:null,battleMode:'shadow'}),true);
});
test('invalid, spoofed, malformed and oversized attachments fail closed',()=>{
 for(const value of [
  {eventId:'',targets:[target('unknown')]},
  {eventId:'',targets:[{...target('shadow'),pokemonId:'../../secret'}]},
  {eventId:'',targets:[{...target('mega'),formId:'../x'}]},
  {eventId:'',targets:Array.from({length:9},(_,i)=>target('shadow',String(100+i)))},
  {eventId:'',targets:[]},
 ])assert.throws(()=>encodeInfographicTargets(value));
 for(const raw of ['targets-v1:{broken','targets-v1:[]','targets-v1:[{"type":"no"}]','a,b,../../c'])
   assert.throws(()=>decodeInfographicTargets(raw));
});
test('boss-only approval publishes persistent guide and never fabricates an event',()=>{
 const reg=registry(), info={events:{}};
 const r=applyDecisions(reg,info,[{id:'discord:abc',status:'approved',eventId:'',targets:[target('gigantamax','006','gmax')]}]);
 assert.equal(r.published.length,1);assert.deepEqual(Object.keys(info.events),[]);
 assert.equal(info.pokemonGuides.length,1);
 assert.equal(info.pokemonGuides[0].formId,'gmax');
 assert.equal(info.pokemonGuides[0].battleMode,'gigantamax');
 assert.equal(info.pokemonGuides[0].infographics[0].url,image);
 assert.equal(info.pokemonGuides[0].infographics[0].source,'Example artist');
 assert.equal(info.pokemonGuides[0].infographics[0].sourceUrl,undefined);
 assert.equal(applyDecisions(reg,info,[{id:'discord:abc',status:'approved',eventId:'',targets:[target('gigantamax','006','gmax')]}]).skipped.length,1);
});
test('retarget, unlink and reject remove only approved form associations',()=>{
 const reg=registry(), info={events:{}};
 applyDecisions(reg,info,[{id:'discord:abc',status:'approved',eventId:'',targets:[target('normal','006')]}]);
 assert.equal(info.pokemonGuides[0].battleMode,'normal');
 applyDecisions(reg,info,[{id:'discord:abc',status:'approved',eventId:'',targets:[target('shadow','006')]}]);
 assert.equal(info.pokemonGuides.length,1);assert.equal(info.pokemonGuides[0].battleMode,'shadow');
 applyDecisions(reg,info,[{id:'discord:abc',status:'unlinked'}]);
 assert.deepEqual(info.pokemonGuides,[]);
 applyDecisions(reg,info,[{id:'discord:abc',status:'approved',eventId:'',targets:[target('primal','382','primal')]}]);
 applyDecisions(reg,info,[{id:'discord:abc',status:'rejected'}]);
 assert.deepEqual(info.pokemonGuides,[]);
});
test('legacy event and new boss approvals may coexist without mixing identities',()=>{
 const reg=registry(),info={events:{}};
 applyDecisions(reg,info,[{id:'discord:abc',status:'approved',eventId:'cur:sendai',eventTitle:'Sendai',targets:[target('dynamax','025')]}]);
 assert.equal(info.events['cur:sendai'].infographics.length,1);
 assert.equal(info.pokemonGuides[0].battleMode,'dynamax');
 assert.equal(info.pokemonGuides[0].pokemonId,'025');
});
test('viewer accepts only owner-approved explicit targets, ignores captions and mode variants',()=>{
 const normal=target('normal','006'), shadow=target('shadow','006'), gmax=target('gigantamax','006','gmax');
 const queue=[{id:'a',image:'/infographics/g47ix/a.webp',title:'Shadow Charizard raid infographic'},
  {id:'b',image:'/infographics/g47ix/b.webp',title:'Normal Charizard'}];
 const d=[{id:'a',status:'needs_review',targets:[shadow]},
  {id:'b',status:'approved',targets:[normal]}];
 const entries=L.entries([],queue,d);
 assert.equal(entries.length,1);assert.equal(entries[0].battleMode,'normal');
 assert.equal(L.entries([],queue,[{...d[0],status:'approved'},{...d[1]}]).length,2);
 assert.equal(L.valid(gmax),true);
 assert.equal(L.identity(gmax), '006|gmax|gigantamax');
 assert.equal(L.identity(normal),'006||normal');
});
test('form labels remain distinct and source links are never leaked',()=>{
 assert.equal(L.label(target('mega','006','mega-x'),[[6,'Charizard',1]],[[6,'mega-x','Mega X','mega']]),'Mega X Charizard');
 assert.equal(L.label(target('shadow','006'),[[6,'Charizard',1]],[]),'Shadow Charizard');
 const info={events:{},pokemonGuides:[{...target('normal'),infographics:[{url:image,sourceUrl:'https://discord.com/channels/1/2',source:'Private'}]}]};
 sanitizePublicInfographicSources(info);
 assert.equal(info.pokemonGuides[0].infographics[0].sourceUrl,undefined);
});

test('Primal modes use the catalogued primal form ID, not the broader mega family', async () => {
  const {readFileSync} = await import('node:fs');
  const source = readFileSync(new URL('../public/review.js', import.meta.url), 'utf8');
  const match = source.match(/function bossFormCompatible\(row, mode\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, 'actual owner form picker helper is present');
  const accepts = new Function('row','mode', match[1]);
  const forms = JSON.parse(readFileSync(new URL('../public/forms.json', import.meta.url), 'utf8')).f;
  for (const dex of [382,383]) {
    const primal = forms.find(f => f[0] === dex && f[1] === 'primal');
    assert.ok(primal, 'Primal Kyogre/Groudon exists in canonical forms');
    assert.equal(primal[3], 'mega', 'catalogue places Primal in broader mega family');
    assert.equal(accepts(primal, 'primal'), true);
    assert.equal(accepts(primal, 'mega'), false);
  }
  const megaX = forms.find(f=>f[0]===6 && f[1]==='mega-x');
  const gmax = forms.find(f=>f[0]===6 && f[1]==='gmax');
  assert.equal(accepts(megaX,'mega'),true);
  assert.equal(accepts(megaX,'primal'),false);
  assert.equal(accepts(gmax,'gigantamax'),true);
  assert.equal(accepts(gmax,'mega'),false);
});
