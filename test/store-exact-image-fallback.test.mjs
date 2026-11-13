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

test('missing exact Store WebP images retain meaningful item-specific neutral fallbacks',async()=>{
  const cases=[
    ['Max Potion','max-potion.webp','POT'],
    ['Max Revives ×2','max-revive.webp','REV'],
    ['Golden Razz Berries x3','golden-razz.webp','RAZZ'],
    ['Silver Pinap Berry','silver-pinap.webp','PIN'],
    ['Incense','incense.webp','INS'],
    ['Incense ×3','incense.webp','INS'],
    ['Elite Fast TM','elite-fast-tm.webp','TM'],
    ['Elite Charged TM','elite-charged-tm.webp','TM'],
    ['Raid Pass','raidpass.webp','PASS']
  ];
  const {cards,errorHandler}=await render(cases.map(x=>x[0]));
  for(const [name,file,token] of cases){
    const card=cards.find(x=>x.includes('<b>'+name+'</b>'));
    assert.ok(card,'missing product card: '+name);
    assert.ok(card.includes(file),name+' uses the expected local item artwork');
    assert.ok(card.includes('data-sp-fallback="'+token+'"'),name+' has an item-specific token');
  }
  assert.equal(typeof errorHandler,'function');
  for(const token of ['POT','REV','RAZZ','PIN','INS','TM','PASS']){
    let replacement=null;
    errorHandler({target:{matches:s=>s==='img.sp-i',
      getAttribute:key=>key==='data-sp-fallback'?token:null,
      replaceWith:node=>{replacement=node;}}});
    assert.equal(replacement?.className,'sp-i-token');
    assert.equal(replacement?.textContent,token);
  }
});

test('quantity wording does not permit using exact art for bundles or other items',async()=>{
  const {cards}=await render(['Incense Bundle','Incense x0','Remote Raid Pass','Premium Battle Pass','Max Potion Box']);
  for(const card of cards){
    assert.doesNotMatch(card,/<img class="sp-i"/,'only approved exact standalone items use item art');
    assert.match(card,/data-sp-art="category-token"/);
  }
});

test('Store icon code and offline shell share the new source version',()=>{
  const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
  const current=index.match(/\/store\.js\?v=\d{8}[a-z](?:-[a-z0-9]+)?/i);
  assert.ok(current,'Store entry script must carry a versioned asset URL');
  assert.ok(sw.includes(current[0]),'PWA shell must cache the same Store script version');
  assert.doesNotMatch(sw,/store\.js\?v=20261113m/);
});
