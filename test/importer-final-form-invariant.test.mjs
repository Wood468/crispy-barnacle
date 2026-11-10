import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreVerifiedCuratedForms} from '../scripts/importer/curated-forms.mjs';

const dex=JSON.parse(readFileSync(new URL('../public/dex.json',import.meta.url),'utf8'));
const curated=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')).events;
const row=curated.find(e=>e.id==='into');
const base=(id,name,method)=>({
  pokemon:{key:id+':base:none',speciesId:id,formId:null,costumeId:null,name,shiny:'unknown'},
  encounter:{identityKey:id+':base:none',method,activityId:'main',access:'unknown'}
});
const seed=[
  base('888','Zacian','raid'),base('889','Zamazenta','raid'),
  base('379','Registeel','max'),base('895','Regidrago','max'),
  base('380','Latias','max'),base('381','Latios','max')
];
function imported(){
  return {
    into:{
      name:'Into the Wild',
      sources:[{name:'Official Pokémon GO',url:'https://pokemongo.com/news/into-the-wild-2026/'}],
      image:'https://example.org/verified-poster.jpg',
      fields:{bonuses:[{text:'Coin Bag shiny Gimmighoul',status:'official'}]},
      researchTasks:[{task:'Power up Pokémon',sourceRefs:[{url:'https://pokemongo.com/news/into-the-wild-2026/'}]}],
      pokemon:seed.map(r=>({...r.pokemon})),
      encounters:seed.map(r=>({...r.encounter})),
      encounterConflicts:[]
    },
    other:{name:'Unrelated',pokemon:[],encounters:[],fields:{dates:[{text:'Other event'}]}}
  };
}

test('final regenerated record restores exact sourced Crowned raids and Dynamax Max Battles',()=>{
  assert.ok(row?.activities?.length>=5,'curated published event activities must exist');
  const out=imported(), sourceInfo=out.into.fields, researched=out.into.researchTasks;
  const changed=restoreVerifiedCuratedForms(out,[row],{dex});
  assert.deepEqual(changed,['into']);
  for(const [id,form,method] of [
    ['888','crowned-sword','raid'],['889','crowned-shield','raid'],
    ['379','dynamax','max'],['895','dynamax','max'],
    ['380','dynamax','max'],['381','dynamax','max']
  ]){
    const p=out.into.pokemon.find(p=>p.speciesId===id&&p.formId===form);
    assert.ok(p,id+' '+form+' missing');
    assert.ok(out.into.encounters.some(e=>e.identityKey===p.key&&e.method===method),p.key+' '+method+' missing');
    assert.ok(!out.into.encounters.some(e=>e.identityKey===id+':base:none'&&e.method===method),
      'wrong ordinary form must not remain in the same verified method for '+id);
  }
  assert.equal(out.into.fields,sourceInfo,'source bonuses are preserved by identity');
  assert.equal(out.into.researchTasks,researched,'research rewards are preserved by identity');
  assert.equal(out.other.name,'Unrelated');
  assert.deepEqual(out.other.pokemon,[]);
  assert.deepEqual(restoreVerifiedCuratedForms(out,[row],{dex}),[],
    'a second importer pass must be semantically idempotent');
});

test('unknown and non-HTTPS activities never create unsupported form encounters',()=>{
  const out=imported();
  const uncertain={...row,activities:row.activities.map(a=>({...a,sourceUrl:'http://invalid.example/event'}))};
  const before=JSON.stringify(out);
  assert.deepEqual(restoreVerifiedCuratedForms(out,[uncertain],{dex}),[]);
  assert.equal(JSON.stringify(out),before);
  assert.deepEqual(restoreVerifiedCuratedForms(out,[],{dex}),[]);
  assert.deepEqual(restoreVerifiedCuratedForms(out,[{...row,id:'different-event'}],{dex}),[]);
});
