import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFields} from '../scripts/importer/extract.mjs';

test('Coin Bag and Mystery Box bonuses survive unrelated article headings',()=>{
 const fields=extractFields([
  {t:'h',level:2,text:'Special encounters'},
  {t:'li',text:'Chance to encounter Shiny Gimmighoul when using a Coin Bag'},
  {t:'li',text:'Chance to encounter Shiny Meltan when opening the Mystery Box'},
 ]);
 assert.ok(fields.bonuses.some(t=>/Shiny Gimmighoul.*Coin Bag/i.test(t)),JSON.stringify(fields.bonuses));
 assert.ok(fields.bonuses.some(t=>/Shiny Meltan.*Mystery Box/i.test(t)),JSON.stringify(fields.bonuses));
});
test('shiny bonuses are not inferred from unrelated Coin Bag mentions',()=>{
 const fields=extractFields([{t:'p',text:'The Coin Bag is available for trainers who connect their accounts'}]);
 assert.ok(!fields.bonuses.some(t=>/Coin Bag/i.test(t)));
});
