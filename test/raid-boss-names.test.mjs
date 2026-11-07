import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {raidBossNames}=createRequire(import.meta.url)('../public/lib.js');
test('published compound raid bosses preserve their individual forms',()=>{
 assert.deepEqual(raidBossNames('Mega Charizard X and Y'),['Mega Charizard X','Mega Charizard Y']);
 assert.deepEqual(raidBossNames('Crowned Sword Zacian and Crowned Shield Zamazenta'),['Crowned Sword Zacian','Crowned Shield Zamazenta']);
 assert.deepEqual(raidBossNames('Deoxys (all four Formes)'),['Deoxys (Normal Forme)','Deoxys (Attack Forme)','Deoxys (Defense Forme)','Deoxys (Speed Forme)']);
 assert.deepEqual(raidBossNames('Shadow Tornadus (Incarnate), to Nov 8'),['Shadow Tornadus (Incarnate)']);
 assert.deepEqual(raidBossNames(null),[]);
});
import {artCandidates} from '../src/worker.js';
test('battle forms resolve to exact artwork without ordinary species fallback',()=>{
 for(const [name,slug] of [['Deoxys (Normal Forme)','deoxys-normal'],['Deoxys (Attack Forme)','deoxys-attack'],['Deoxys (Defense Forme)','deoxys-defense'],['Deoxys (Speed Forme)','deoxys-speed'],['Crowned Sword Zacian','zacian-crowned'],['Crowned Shield Zamazenta','zamazenta-crowned']]){
  assert.deepEqual(artCandidates(name).list,[slug]);assert.equal(artCandidates(name).exact,true);
 }
});
