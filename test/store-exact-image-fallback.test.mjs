import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const R=require('../public/regional-prices.js');
const source=readFileSync(new URL('../public/store.js',import.meta.url),'utf8');

async function render(labels) {
  let errorHandler=null;
  const el={innerHTML:'',addEventListener(name,handler){if(name==='error')errorHandler=handler;},
    querySelector(){return null;},querySelectorAll(){return [];}};
  const host={parentNode:{insertBefore(){}}};
  const prices=labels.map((label,index)=>({
    product:'store-art-test-'+index,label,group:'Items',
    region:'AU',currency:'AUD',amount:2.99,verified:true,observed:'2026-11-13'
  }));
  const doc={readyState:'complete',getElementById:id=>id==='evsource'?host:null,
    createElement:tag=>tag==='div' ? el : {
      className:'',textContent:'',setAttribute(name,value){this[name]=value;}
    },
    addEventListener(){}};
  const win={document:doc,GORegionalPrices:R,
    GOLIB:{esc:value=>String(value),
      loadPrices:()=>Promise.resolve({owner:true,prices,regional:[]}),
      priceView:()=>({main:'',sub:'',save:''})},console};
  win.window=win;
  vm.runInNewContext(source,win);
  await new Promise(resolve=>setTimeout(resolve,20));
  const cards=[...el.innerHTML.matchAll(/<article class="sp-product"[\s\S]*?<\/article>/g)].map(m=>m[0]);
  return {cards,errorHandler};
}

test('exact local Store WebP art renders as an alt-named lazy image; failures remove it without a tile',async()=>{
  const cases=[
    ['Max Potion','max-potion.webp'],['Max Revives ×2','max-revive.webp'],
    ['Golden Razz Berries x3','golden-razz.webp'],['Silver Pinap Berry','silver-pinap.webp'],
    ['Incense','incense.webp'],['Incense ×3','incense.webp'],
    ['Elite Fast TM','elite-fast-tm.webp'],['Elite Charged TM','elite-charged-tm.webp'],
    ['Raid Pass','raidpass.webp']
  ];
  const {cards,errorHandler}=await render(cases.map(x=>x[0]));
  for(const [name,file] of cases){
    const card=cards.find(x=>x.includes('>'+name+'</b>'));
    assert.ok(card,'missing product card: '+name);
    assert.ok(card.includes(file),name+' uses the expected local item artwork');
    assert.ok(card.includes('alt="'+name+'"'),name+' image is named for assistive technology');
    assert.match(card,/loading="lazy"/);
    assert.doesNotMatch(card,/data-sp-fallback|sp-i-token/,'no placeholder token for '+name);
  }
  assert.equal(typeof errorHandler,'function');
  let removed=0,replaced=0;
  errorHandler({target:{matches:s=>s==='img.sp-i',remove:()=>{removed++;},replaceWith:()=>{replaced++;}}});
  assert.equal(removed,1,'a failed exact image is removed');
  assert.equal(replaced,0,'and is never replaced by a placeholder tile');
});

test('quantity wording does not permit using exact art for bundles or other items',async()=>{
  const {cards}=await render(['Incense Bundle','Incense x0','Remote Raid Pass','Premium Battle Pass','Max Potion Box']);
  assert.equal(cards.length,5);
  for(const card of cards){
    assert.doesNotMatch(card,/<img/,'only approved exact standalone items use item art');
    assert.doesNotMatch(card,/sp-i-token|data-sp-art/,'and no placeholder tile appears instead');
  }
});

test('Store icon code and offline shell share the new source version',()=>{
  const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
  for(const file of ['store','regional-prices']){
    assert.match(index,new RegExp(file+'\\.js\\?v=20261115c-nianticimg'));
    assert.match(sw,new RegExp(file+'\\.js\\?v=20261115c-nianticimg'));
  }
  assert.doesNotMatch(sw,/store\.js\?v=20261115b-minimal|regional-prices\.js\?v=20261114a-source797/);
});
