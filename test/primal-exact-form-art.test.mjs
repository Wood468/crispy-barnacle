import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {artCandidates} from '../src/worker.js';

const require=createRequire(import.meta.url);
const adapter=require('../public/event-adapter.js');
const variants=require('../public/variant-art.js');
const dex=JSON.parse(readFileSync(new URL('../public/dex.json',import.meta.url),'utf8'));
adapter.configureSpecies(dex);
const species=[['Kyogre','382','kyogre-primal'],['Groudon','383','groudon-primal']];
const dexOf=Object.fromEntries(species.map(([name,id])=>[name.toLowerCase(),+id]));
const options={
 dexOf:name=>dexOf[name]||0,
 speciesSrc:(name,shiny)=>'/api/art?n='+encodeURIComponent(name)+(shiny?'&shiny=1':'')
};

test('Primal source spellings resolve to the same exact form, not base artwork',()=>{
 for(const [base,id,slug] of species){
  const canonical='Primal '+base, suffixed=base+' (Primal)';
  const fromPrefix=adapter.pokemon({name:canonical});
  const fromSuffix=adapter.pokemon({name:suffixed});
  const fromStructured=adapter.pokemon({name:base,speciesId:id,formId:'primal'});
  for(const form of [fromPrefix,fromSuffix,fromStructured]){
   assert.equal(form.speciesId,id,base);
   assert.equal(form.formId,'primal',base);
   assert.equal(adapter.collectionName(form),canonical,base+' exact request');
   assert.deepEqual(artCandidates(adapter.collectionName(form)),
    {base:base.toLowerCase(),list:[slug],exact:true});
  }
  assert.deepEqual(artCandidates(suffixed),
   {base:base.toLowerCase(),list:[slug],exact:true});
  const ordinary=adapter.pokemon({name:base,speciesId:id});
  assert.equal(ordinary.formId,null,'a normal post-raid catch is not Primal');
  assert.equal(adapter.collectionName(ordinary),base);
  assert.deepEqual(artCandidates(base).list,[base.toLowerCase()]);
  assert.notEqual(fromStructured.key,ordinary.key,'do not conflate Primal and base Collection identities');
 }
});

test('Primal and Shiny Primal requests preserve exact art routes',()=>{
 for(const [base,id,slug] of species){
  for(const shiny of [false,true]){
   const name='Primal '+base;
   const req=variants.normalize({n:name,shiny},options);
   assert.equal(req.dex,+id);
   assert.equal(req.form,'primal');
   assert.equal(req.shiny,shiny);
   const art=variants.resolve({n:name,shiny},{entries:{}},options);
   assert.equal(art.src,'/api/art?n='+encodeURIComponent(name)+(shiny?'&shiny=1':''));
   assert.deepEqual(artCandidates(name).list,[slug]);
   assert.notEqual(art.src,'/api/art?n='+base+(shiny?'&shiny=1':''));
  }
 }
});

test('absent approved Primal artwork never passes as a base species image',()=>{
 for(const [base,id] of species){
  const normalKey=variants.variantKey({dex:+id});
  const approvedBase={[normalKey]:{
   status:'approved',source:'base art only',url:'https://example.org/base.png'
  }};
  for(const shiny of [false,true]){
   const lookup=variants.resolveVariantArtwork(approvedBase,
    {dex:+id,form:'primal',kind:'normal',shiny});
   assert.equal(lookup.kind,'missing',base);
   assert.equal(lookup.url,null,base);
  }
 }
});
