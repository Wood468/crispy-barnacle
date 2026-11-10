import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEncounters} from '../scripts/importer/encounters.mjs';

const dex=[[888,'Zacian'],[889,'Zamazenta'],[379,'Registeel'],[895,'Regidrago']];
test('published Crowned bosses retain exact form identities',()=>{
 const rows=[
  {t:'h',level:2,text:'Five-star raids'},
  {t:'li',text:'Crowned Sword Zacian'},
  {t:'li',text:'Crowned Shield Zamazenta'}
 ];
 const result=extractEncounters(rows,{dex});
 assert.ok(result.pokemon.some(p=>p.speciesId==='888'&&p.formId==='crowned-sword'),JSON.stringify(result.pokemon));
 assert.ok(result.pokemon.some(p=>p.speciesId==='889'&&p.formId==='crowned-shield'),JSON.stringify(result.pokemon));
 assert.ok(result.encounters.every(e=>e.method==='raid'));
});
test('Max Battle headings retain Dynamax identities',()=>{
 const result=extractEncounters([{t:'h',level:2,text:'Five-star Max Battles'},{t:'li',text:'Registeel'},{t:'li',text:'Regidrago'}],{dex});
 for(const id of ['379','895']){
  const p=result.pokemon.find(p=>p.speciesId===id);
  assert.equal(p?.formId,'dynamax',JSON.stringify(result.pokemon));
  assert.ok(result.encounters.some(e=>e.identityKey===p.key&&e.method==='max'));
 }
});
