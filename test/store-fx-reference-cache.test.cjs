const test = require('node:test');
const assert = require('node:assert/strict');
const FX = require('../public/store-fx.js');
const NOW = Date.parse('2026-11-13T12:00:00Z');
const unix = iso => Date.parse(iso) / 1000;
const snapshot = (at='2026-11-13T00:00:00Z') => ({
  result:'success',base_code:'AUD',time_last_update_unix:unix(at),
  rates:{IDR:16000,INR:90},ownerSecret:'never cache this'
});
async function withStorage(storage, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable:true,value:storage,writable:true
    });
    return await fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}
function fakeStore() {
  const values = new Map();
  return {
    getItem:key=>values.get(key) || null,
    setItem:(key,value)=>values.set(key,String(value)),
    values
  };
}
test('successful AUD-base provider response saves only sourced IDR/INR reference rates and timestamp', async () => {
  const storage=fakeStore();
  await withStorage(storage,async () => {
    const body=snapshot();
    let calls=0;
    const quotes=await FX.retrieve(async (url,settings)=>{
      calls++;
      assert.equal(url,FX.ENDPOINT);
      assert.equal(settings.credentials,'omit');
      return {ok:true,json:async()=>body};
    },null,NOW,40);
    assert.equal(calls,1);
    assert.equal(quotes.IDR.source,'ExchangeRate-API');
    assert.equal(quotes.INR.source,'ExchangeRate-API');
    assert.equal(FX.amount(16000,'IDR',quotes),1);
    assert.equal(FX.amount(90,'INR',quotes),1);
    assert.equal(FX.display({currency:'INR',amount:439},quotes).text,'≈ A$4.88');
    const saved=JSON.parse(storage.getItem(FX.CACHE_KEY));
    assert.deepEqual(Object.keys(saved).sort(),['base_code','rates','result','time_last_update_unix']);
    assert.deepEqual(saved.rates,{IDR:16000,INR:90});
    assert.ok(!JSON.stringify(saved).includes('ownerSecret'));
  });
});
test('offline or failed provider request reuses a still-fresh dated quote for both currencies', async () => {
  const store=fakeStore();store.setItem(FX.CACHE_KEY,JSON.stringify(snapshot('2026-11-12T00:00:00Z')));
  await withStorage(store,async () => {
    const offline=await FX.retrieve(null,null,NOW);
    assert.equal(offline.IDR.observed,'2026-11-12');
    assert.equal(offline.INR.observed,'2026-11-12');
    const failed=await FX.retrieve(async ()=>{throw new Error('offline');},null,NOW,30);
    assert.deepEqual(failed,offline);
    const hanging=await FX.retrieve(()=>new Promise(()=>{}),null,NOW,5);
    assert.deepEqual(hanging,offline,'hung FX cannot keep Store AUD references blank');
  });
});
test('expired, wrong-base or spoofed cache is never converted into an AUD figure', async () => {
  const store=fakeStore();
  await withStorage(store,async () => {
    const invalid=[
      snapshot('2026-10-30T00:00:00Z'),
      {...snapshot(),base_code:'USD'},
      {...snapshot(),rates:{IDR:16000,INR:0}},
      {...snapshot(),rates:{IDR:16000,INR:Infinity}},
      {...snapshot(),time_last_update_unix:unix('2026-11-15T00:00:00Z')}
    ];
    for(const body of invalid){
      store.setItem(FX.CACHE_KEY,JSON.stringify(body));
      assert.deepEqual(await FX.retrieve(null,null,NOW),{},'no expired or invalid quote may display');
    }
    store.setItem(FX.CACHE_KEY,'{bad-json');
    assert.deepEqual(await FX.retrieve(null,null,NOW),{});
  });
});
test('a newer recorded owner rate wins for IDR while independently sourced INR remains visible', async () => {
  const store=fakeStore();
  store.setItem(FX.CACHE_KEY,JSON.stringify(snapshot('2026-11-12T00:00:00Z')));
  await withStorage(store,async () => {
    const quotes=await FX.retrieve(null,{
      from:'IDR',to:'AUD',rate:0.00011,source:'Recorded owner FX reference',
      observed:'2026-11-13'
    },NOW);
    assert.equal(quotes.IDR.audPerUnit,0.00011);
    assert.equal(quotes.IDR.source,'Recorded owner FX reference');
    assert.equal(quotes.INR.source,'ExchangeRate-API');
    assert.equal(FX.display({currency:'IDR',amount:10000},quotes).text,'≈ A$1.10');
  });
});
test('disabled private storage never fails Store rendering or invents an exchange rate', async () => {
  await withStorage({
    getItem(){throw Error('storage unavailable')},
    setItem(){throw Error('storage unavailable')}
  },async () => {
    const quotes=await FX.retrieve(async()=>({ok:true,json:async()=>snapshot()}),null,NOW,40);
    assert.ok(quotes.IDR && quotes.INR,'display may use live sourced FX without persistence');
    const noFetch=await FX.retrieve(null,null,NOW);
    assert.deepEqual(noFetch,{});
    assert.equal(FX.display({currency:'INR',amount:439},noFetch),null);
  });
});
test('only a currently verified API response can replace cached reference rates', async () => {
  const store=fakeStore();store.setItem(FX.CACHE_KEY,JSON.stringify(snapshot('2026-11-12T00:00:00Z')));
  await withStorage(store,async () => {
    const original=store.getItem(FX.CACHE_KEY);
    const result=await FX.retrieve(async()=>({ok:true,json:async()=>({...snapshot(),base_code:'USD'})}),null,NOW,40);
    assert.equal(result.INR.observed,'2026-11-12');
    assert.equal(store.getItem(FX.CACHE_KEY),original);
  });
});
