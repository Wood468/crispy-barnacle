import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../public/go-pass-reward-art.js');

test('the approved exact reward icon table points only to tracked on-disk assets', () => {
  assert.equal(R.knownAssets.length,9);
  assert.equal(new Set(R.knownAssets).size,R.knownAssets.length);
  for (const path of R.knownAssets) {
    assert.match(path,/^\/ico\/(?:i\/|g\/)?[a-z0-9-]+\.webp$/);
    assert.equal(existsSync(new URL('../public'+path,import.meta.url)),true,path);
  }
});

test('verified assets are used only for their actual item names', () => {
  const cases=[
    ['Max Potion','/ico/i/max-potion.webp'],
    ['Max Revive','/ico/i/max-revive.webp'],
    ['Golden Razz Berry','/ico/i/golden-razz.webp'],
    ['Silver Pinap Berry','/ico/i/silver-pinap.webp'],
    ['Elite Fast TM','/ico/g/elite-fast-tm.webp'],
    ['Elite Charged TM','/ico/g/elite-charged-tm.webp'],
    ['Incense','/ico/incense.webp'],
    ['Stardust','/ico/dust.webp'],
    ['Raid Pass','/ico/g/raidpass.webp']
  ];
  for(const [name,src] of cases) assert.deepEqual(R.resolve({name,type:'item'}).src,src);
});

test('similar items do not borrow incorrect images', () => {
  for(const name of ['Regular Potion','Super Potion','Hyper Potion','Revive','Remote Raid Pass','Premium Battle Pass','Razz Berry','Pinap Berry','Max Potion XL','Silver Bottle Cap','Lucky Egg','Star Piece','Poffin','Rare Candy']) {
    const result=R.resolve({name,type:'item'});
    assert.equal(result.kind,'symbol',name);
    assert.equal(result.src,null,name);
    assert.ok(result.symbol.length,name);
  }
});

test('XP, Candy XL and Rare Candy distinguish source items with honest category glyphs', () => {
  assert.deepEqual(R.resolve({name:'XP'}),{kind:'symbol',category:'Resource',symbol:'XP',src:null});
  assert.equal(R.resolve({name:'Candy XL'}).symbol,'XL');
  assert.equal(R.resolve({name:'Rare Candy XL'}).symbol,'XL');
  assert.equal(R.resolve({name:'Rare Candy'}).symbol,'RC');
  assert.equal(R.resolve({name:'Silver Bottle Cap'}).symbol,'CAP');
  assert.equal(R.resolve({name:'Poké Ball'}).symbol,'PB');
});

test('Pokémon encounter rewards are delegated to the exact-form artwork resolver', () => {
  assert.deepEqual(R.resolve({name:'Dynamax Meltan',type:'encounter'}),{kind:'encounter',category:'Pokémon',symbol:'',src:null});
  assert.deepEqual(R.resolve({name:'Crowned Sword Zacian',type:'encounter'}),{kind:'encounter',category:'Pokémon',symbol:'',src:null});
});

test('missing and placeholder rewards never produce invented icons or HTML', () => {
  assert.equal(R.resolve(null),null);
  assert.equal(R.resolve({name:''}),null);
  assert.equal(R.resolve({name:'—'}),null);
  const malicious=R.resolve({name:'<img src=x onerror=alert(1)>'});
  assert.equal(malicious.kind,'symbol');
  assert.equal(malicious.src,null);
  assert.equal(malicious.symbol,'◇');
  assert.equal('name' in malicious,false);
});
