import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const components = require('../public/event-components.js');

const pokemon = [
  {speciesId:'888', formId:'crowned-sword', key:'888:crowned-sword:none', name:'Crowned Sword Zacian'},
  {speciesId:'888', formId:'crownedsword', key:'888:crownedsword:none', name:'Zacian (Crowned Sword)'},
  {speciesId:'889', formId:'crowned-shield', key:'889:crowned-shield:none', name:'Crowned Shield Zamazenta'},
  {speciesId:'889', formId:'crownedshield', key:'889:crownedshield:none', name:'Zamazenta (Crowned Shield)'}
];
function edge(p, options={}) {
  return {identityKey:p.key, method:'raid', activityId:'main', access:'unknown', ...options};
}
function gallery(groups, members=pokemon) {
  const model = {title:'Into the Wild', pokemon:members, groups,
    activities:[], internalValidation:{conflicts:[], fields:{}}};
  return components.gallery(model, {artFor:()=>'<span class="test-art"></span>'});
}
function identities(html) {
  return [...html.matchAll(/data-identity="([^"]+)"/g)].map(m=>m[1]);
}

test('two source spellings of each Crowned raid boss render one tile each',()=>{
  const original = pokemon.map(p=>p.key);
  for(const list of [pokemon, [...pokemon].reverse()]){
    const ids=identities(gallery({raid:list.map(p=>edge(p))}));
    assert.equal(ids.length,2, 'only Zacian and Zamazenta should be shown');
    assert.equal(ids.filter(id=>id.startsWith('888:')).length,1);
    assert.equal(ids.filter(id=>id.startsWith('889:')).length,1);
  }
  assert.deepEqual(pokemon.map(p=>p.key),original,
    'display aliases must not rewrite source Pokémon or Collection keys');
});

test('Crowned display aliases retain separate activity, access and encounter method',()=>{
  const [crowned,alias]=pokemon;
  assert.equal(identities(gallery({raid:[
    edge(crowned), edge(alias,{activityId:'raid-hour'})
  ]})).length,2,'separate activity windows remain separate cards');
  assert.equal(identities(gallery({raid:[
    edge(crowned,{access:'ticket'}), edge(alias,{access:'all'})
  ]})).length,2,'different access rules remain visible');
  assert.equal(identities(gallery({raid:[edge(crowned)],max:[
    edge(alias,{method:'max'})
  ]})).length,2,'different encounter methods remain visible');
});

test('other forms of the same species are not collapsed into Crowned raid tiles',()=>{
  const [crowned]=pokemon;
  const hero={speciesId:'888',formId:'hero-of-many-battles',
    key:'888:hero-of-many-battles:none',name:'Zacian (Hero of Many Battles)'};
  const ids=identities(gallery({raid:[edge(crowned),edge(hero)]},[crowned,hero]));
  assert.deepEqual(ids,[crowned.key,hero.key]);
});
