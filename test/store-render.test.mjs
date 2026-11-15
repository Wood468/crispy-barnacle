import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { OBSERVATIONS } from '../src/regional-observations.js';
// Runs the real public/store.js against a stub DOM: the owner view must render, including products with no Australian price.
test('owner Store view renders verified Indonesian prices and regional-only rows without throwing', async () => {
  const R = createRequire(import.meta.url)('../public/regional-prices.js');
  const eventHandlers = {};
  const el = { innerHTML: '', id: '', querySelector: () => null,
    addEventListener: (name, fn) => { eventHandlers[name] = fn; } };
  const host = { parentNode: { insertBefore: (n) => { Object.assign(el, n); } } };
  const prices = { prices: [
    { product: 'store-x', label: 'Lucky Egg x8', group: 'Items', currency: 'AUD', amount: 7.99, region: 'AU', verified: true, observed: '2026-10-12' },
    { product: 'store-max-mushroom-x3', label: 'Max Mushroom x3', group: 'Items', currency: 'AUD', amount: 14.99, region: 'AU', verified: true, observed: '2026-11-09' },
    { product: 'store-link-charge', label: '600 Link Charge', group: 'Items', currency: 'AUD', amount: 4.49, region: 'AU', verified: true, observed: '2026-11-09' },
    { product: 'store-super-incubator', label: 'Super Incubator x2', group: 'Items', currency: 'AUD', amount: 4.49, region: 'AU', verified: true, observed: '2026-11-09' },
    { product: 'store-mixed-max-item', label: 'Max Particle Pack + Remote Raid Pass', group: 'Items', currency: 'AUD', amount: 4.49, region: 'AU', verified: true, observed: '2026-11-09' },
    { product: 'store-unmapped', label: 'Future Unmapped Item', group: 'Items', currency: 'AUD', amount: 5.49, region: 'AU', verified: true, observed: '2026-11-09' },
    { product: 'store-box-test', label: 'Ultra Training Box', group: 'Boxes', currency: 'AUD', amount: 46.99, region: 'AU', verified: true, observed: '2026-10-12' },
    { product: 'store-idr-legacy', label: 'GO Pass Deluxe', group: 'Tickets', currency: 'IDR', amount: 76000, region: 'ID', verified: true, observed: '2026-11-09' },
    { product: 'go-pass-oct-deluxe', currency: 'AUD', region: 'AU', amount: 12.99,
      verified: true, observed: '2026-10-12', url: 'https://store.pokemongo.com/' },
    { product: 'store-official-source-fixture', label: 'Source-backed Fixture Pass',
      group: 'Tickets', currency: 'AUD', region: 'AU', amount: 9.99,
      verified: true, observed: '2026-10-12',
      contents: [{item:'Ultra Ball',quantity:20},{item:'Premium Battle Pass',quantity:5}],
      contentsSource:'https://pokemongo.com/news/go-pass-october-2026',
      disableRegionalEstimates:true },
    { product: 'store-raid-day-a', label: 'Raid Day Box', group: 'Boxes', currency: 'AUD',
      region: 'AU', amount: 9.99, verified: true, observed: '2026-11-09' },
    { product: 'store-raid-day-b', label: 'Raid Day Box', group: 'Boxes', currency: 'AUD',
      region: 'AU', amount: 14.99, verified: true, observed: '2026-11-09' },
    { product: 'store-raid-pass', label: 'Raid Pass', group: 'Items', currency: 'AUD',
      region: 'AU', amount: 1.99, verified: true, observed: '2026-11-09' },
    { product: 'store-remote-raid-pass', label: 'Remote Raid Pass', group: 'Items', currency: 'AUD',
      region: 'AU', amount: 2.99, verified: true, observed: '2026-11-09' },
    { product: 'store-premium-battle-pass', label: 'Premium Battle Pass', group: 'Items', currency: 'AUD',
      region: 'AU', amount: 1.99, verified: true, observed: '2026-11-09' },
    { product: 'store-elite-fast-tm', label: 'Elite Fast TM', group: 'Items', currency: 'AUD',
      region: 'AU', amount: 5.99, verified: true, observed: '2026-11-09' },
    { product: 'store-elite-charged-tm', label: 'Elite Charged TM', group: 'Items', currency: 'AUD',
      region: 'AU', amount: 5.99, verified: true, observed: '2026-11-09' },
    { product: 'store-elite-charged-tm-box', label: 'Elite Charged TM Box', group: 'Boxes', currency: 'AUD',
      region: 'AU', amount: 9.99, verified: true, observed: '2026-11-09' }
  ], regional: OBSERVATIONS.concat([{
    id: 'id-raid-day-test', product: 'Raid Day Box', kind: 'bundle', region: 'ID', channel: 'web',
    currency: 'IDR', amount: 50000, observed: '2026-11-09', source: 'fixture', status: 'verified'
  }]), owner: true };
  const win = { GORegionalPrices: R,
    GOStoreOfferIdentities: createRequire(import.meta.url)('../public/store-offer-identities.js'),
    GOLIB: { esc: s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'),
      loadPrices: () => Promise.resolve(prices), priceView: () => ({ sub: '', save: '', main: '' }) }, GODASH: {} };
  const doc = { readyState: 'complete', getElementById: id => id === 'evsource' ? host : id === 'storep-host' ? null : null,
    createElement: tag => tag === 'span' ? { className: '', textContent: '', setAttribute() {} } : el, addEventListener() {} };
  Object.assign(win, { document: doc, localStorage: { getItem: () => null, setItem() {} }, console }); win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8'), ctx);
  await new Promise(r => setTimeout(r, 20));
  for (const t of ['Rp 76,000', 'Rp 101,000', 'Rp 126,000', 'Rp 41,000', 'Rp 10,000', 'Rp 200,000', 'Not observed', 'A$7.99', 'Indonesia', 'India'])
    assert.ok(el.innerHTML.includes(t), 'missing ' + t);
  assert.equal((el.innerHTML.match(/<summary>Regional Store prices/g) || []).length, 1,
    'one comprehensive regional comparison should be shown');
  assert.ok(!el.innerHTML.includes('Indonesia vs Australia'),
    'old legacy IDR summary must not repeat the regional price observations');
  assert.ok(el.innerHTML.includes('Not observed'), 'missing source prices should not look like zero or a calibration failure');
  assert.match(el.innerHTML, /Recently listed offers appear in the main list; stable items with historical prices may also appear clearly marked unconfirmed\./,
    'Store copy must not imply that every stable historical item is currently listed');
  assert.doesNotMatch(el.innerHTML, /Only offers seen in the recent official Web Store snapshot appear in the main list/,
    'avoid falsely claiming the main list contains only live observed SKUs');
  assert.ok(el.innerHTML.includes('data-sp-search'), 'search appears ahead of the product cards');
  assert.ok(el.innerHTML.includes('data-sp-coverage'), 'owner can inspect source completeness without another pricing panel');
  assert.match(el.innerHTML,/Official listings awaiting regional prices: 3/,
    'source-only November SKUs are counted separately from checkout observations');
  const novCards=(el.innerHTML.match(/<article class="sp-product"[\s\S]*?<\/article>/g)||[])
    .filter(card=>card.includes('GO Pass Deluxe: November'));
  assert.equal(novCards.length,3,'official November passes are shown without hiding historical AU records');
  for(const card of novCards){
    assert.match(card,/regional availability not verified/);
    assert.match(card,/Not observed/);
    assert.doesNotMatch(card,/sp-regional-value sp-ver/,
      'a publisher announcement must not be mistaken for an observed regional checkout quote');
    if (card.includes('sp-local-price')) {
      assert.match(card,/sp-regional-value sp-est/);
      assert.match(card,/confidence · not a checkout price/,
        'a supported comparable estimate must be visibly modelled, not a live price');
    }
  }

  assert.ok(el.innerHTML.includes('sp-offer-contents'), 'verified official offer breakdown can be expanded');
  assert.ok(el.innerHTML.includes('Ultra Ball ×20') && el.innerHTML.includes('Premium Battle Pass ×5'),
    'published item quantities appear without replacing regional prices');
  assert.ok(el.innerHTML.includes('Official offer description'), 'link to Niantic source is visible');
  assert.ok(el.innerHTML.includes('not proof this historical offer is still for sale'),
    'published contents are not represented as live checkout availability');

  assert.ok(el.innerHTML.includes('Missing Australian product names'), 'unattributed official SKUs stay actionable');
  assert.ok(el.innerHTML.includes('Regional SKU/contents not safely paired'), 'unmatched packs are visible for review');
  assert.ok(el.innerHTML.includes('No observed Indian source price'), 'missing India evidence is not described as verified');
  assert.ok(el.innerHTML.includes('Exact item-art mappings'), 'neutral icon gaps can be reviewed without fake artwork');
  assert.ok(el.innerHTML.indexOf('data-sp-coverage') < el.innerHTML.indexOf('data-sp-search'),
    'review summary appears before the catalogue search');

  assert.ok(el.innerHTML.includes('sp-market-grid'), 'regional prices share one compact grid');
  assert.ok(el.innerHTML.includes('sp-market-au'), 'Australia price is visually grouped with the other regions');
  assert.ok(el.innerHTML.includes('data-sp-product'), 'each item renders once in the browseable catalogue');
  assert.ok(el.innerHTML.includes('go-pass-oct-deluxe'), 'verified official AU pass offer is not silently filtered out');
  assert.ok(el.innerHTML.includes('exact SKU; item name not recorded'),
    'unlabelled source offer cannot masquerade as a verified product name');
  assert.ok(el.innerHTML.includes('Distinct official SKU: store-raid-day-a'));
  assert.ok(el.innerHTML.includes('Distinct official SKU: store-raid-day-b'));
  assert.ok(el.innerHTML.includes('no exact AU SKU pairing established'),
    'the same-name Indonesian offer must not be attributed to either AU box');
  assert.equal((el.innerHTML.match(/Distinct official SKU: store-raid-day-/g)||[]).length,2);
  const raidCards = (el.innerHTML.match(/<article class="sp-product"[\s\S]*?<\/article>/g)||[])
    .filter(card => card.includes('Raid Day Box'));
  assert.equal(raidCards.length,3,'two AU SKUs plus one unpaired local observation');
  assert.equal(raidCards.filter(card=>card.includes('Rp 50,000')).length,1,
    'one regional observation cannot become two independently verified SKU prices');
  assert.doesNotMatch(el.innerHTML, /class="sp-product-group"/,
    'internal event-pass/sku classifier strings must not be exposed as product labels');
  assert.doesNotMatch(el.innerHTML, />event-pass-ranks-ultra</,
    'machine-readable product kind must not be visible in Store cards');
  const storeCss = fs.readFileSync(new URL('../public/dash.css', import.meta.url), 'utf8');
  const mobileCss = storeCss.slice(storeCss.lastIndexOf('/* Mobile Store QA: three tall'));
  assert.match(mobileCss, /@media\(max-width:659px\)/,
    'compact Store rows must apply at phone widths');
  const ownerColumns = storeCss.slice(storeCss.lastIndexOf('/* Sprint 2 owner-approved AUD-first'));
  assert.match(ownerColumns, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
    'phone layout shows three aligned regional columns');
  assert.match(ownerColumns, /\.sp-market\+\.sp-market\{border-top:/,
    'country columns retain boundaries');
  for (const flag of ['🇦🇺', '🇮🇩', '🇮🇳']) assert.ok(el.innerHTML.includes(flag));


  assert.ok(el.innerHTML.includes('Advanced comparison'), 'cash/coin optimisation is disclosed only when requested');
  assert.ok(el.innerHTML.includes('Verified regional purchase options'));
  const expandedComparison = el.innerHTML.split('<div data-sp-cheapest>')[1]?.split('</details>')[0] || '';
  for (const name of ['Pokémon Storage +50', 'Raid Day Box', '110 PokéCoins', 'GO Pass Deluxe: Into the Wild'])
    assert.ok(expandedComparison.includes(name), 'verified source observations must include ' + name + ' in the optional review');
  assert.ok(expandedComparison.includes('Only one verified buying channel observed; no lowest-price comparison'),
    'single verified checkout channel is not falsely declared the cheapest');
  assert.ok(el.innerHTML.includes('Not a live checkout quote.'), 'price choice must be dated and qualified');
  assert.ok(!el.innerHTML.includes('cheapest:'), 'a regional comparison is not a guaranteed checkout price');
  assert.ok(!/undefined|NaN|\[object/.test(el.innerHTML));
  const positions = ['passes', 'storage', 'coins', 'boxes', 'items'].map(group => el.innerHTML.indexOf('data-sp-group="' + group + '"'));
  assert.ok(positions.every(pos => pos >= 0), 'Store must expose all five browsing categories');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions,
    'passes/tickets come first, followed by storage, coins, boxes and items');
  for (const group of ['passes', 'storage', 'coins'])
    assert.match(el.innerHTML, new RegExp('data-sp-group="' + group + '" data-sp-default-open="yes" open'),
      group + ' must be visible by default');
  for (const group of ['boxes', 'items'])
    assert.match(el.innerHTML, new RegExp('data-sp-group="' + group + '" data-sp-default-open="no"'),
      group + ' must remain browsable without a huge first scroll');
  assert.ok(el.innerHTML.includes('no sourced price for that region') && el.innerHTML.includes('Not observed'),
    'explain unobserved prices rather than presenting missing data as zero');
  assert.doesNotMatch(el.innerHTML, /src="\/ico\/(?:xp|egg|dust)\.webp"/,
    'XP, egg and Stardust images must not masquerade as Coins, Incubators or Star Pieces');
  assert.doesNotMatch(el.innerHTML, /src="\/ico\/g\/event\.webp"/,
    'generic event artwork must not masquerade as a particular Store box');
  assert.match(el.innerHTML, /class="sp-i-token"[^>]*>◎<\/span>/,
    'PokéCoin rows use a distinct neutral coin token rather than XP artwork');

  const itemCards = (el.innerHTML.match(/<article class="sp-product"[\s\S]*?<\/article>/g) || []);
  const cardFor = label => itemCards.find(card => card.includes('<b>' + label + '</b>'));
  assert.match(cardFor('Raid Pass'), /src="\/ico\/g\/raidpass\.webp"/,
    'only ordinary Raid Passes may use verified ordinary Raid Pass art');
  assert.match(cardFor('Elite Fast TM'), /src="\/ico\/g\/elite-fast-tm\.webp"/);
  assert.match(cardFor('Elite Charged TM'), /src="\/ico\/g\/elite-charged-tm\.webp"/);
  for (const label of ['Remote Raid Pass', 'Premium Battle Pass', 'Elite Charged TM Box']) {
    const card = cardFor(label);
    assert.ok(card, 'source-labelled product is displayed: ' + label);
    assert.doesNotMatch(card, /<img class="sp-i"/,
      'never borrow an unrelated exact item image for ' + label);
  }
  assert.match(cardFor('Remote Raid Pass'), /sp-i-token"[^>]*>PASS<\/span>/);
  assert.match(cardFor('Premium Battle Pass'), /sp-i-token"[^>]*>PASS<\/span>/);
  // New Store products must not show a different item's purported exact art.
  for (const [name, token] of [
    ['Max Mushroom x3', 'MM'], ['600 Link Charge', 'LC'],
    ['Super Incubator x2', 'SINC'],
    ['Max Particle Pack + Remote Raid Pass', '▣'],
    ['Future Unmapped Item', '·']
  ]) {
    const card = cardFor(name);
    assert.ok(card, 'visible Store product ' + name);
    assert.ok(card.includes('data-sp-art="category-token">' + token + '</span>'),
      'neutral source-accurate fallback for ' + name);
    assert.doesNotMatch(card, /<img class="sp-i"/,
      'do not use unrelated in-game artwork for ' + name);
  }
  assert.equal(typeof eventHandlers.error, 'function',
    'Store handles broken exact-item icons without a browser broken-image box');
  let fallback = null;
  eventHandlers.error({ target: {
    matches: selector => selector === 'img.sp-i',
    getAttribute: attr => attr === 'data-sp-fallback' ? 'PASS' : null,
    replaceWith: node => { fallback = node; }
  } });
  assert.equal(fallback?.className, 'sp-i-token');
  assert.equal(fallback?.textContent, 'PASS', 'a missing exact image becomes an honest type token');

  const storeSource = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');
  const exactIcons = [...new Set([...storeSource.matchAll(/'(\/ico\/[A-Za-z0-9/_-]+\.webp)'/g)].map(match => match[1]))];
  assert.ok(exactIcons.length >= 8, 'Store exact-art mapping should cover the verified asset catalogue');
  for (const iconPath of exactIcons) {
    const file = new URL('../public' + iconPath, import.meta.url);
    assert.ok(fs.existsSync(file), 'no exact Store icon may point at an absent asset: ' + iconPath);
    assert.ok(fs.statSync(file).size > 0, 'verified Store icon cannot be a zero-byte asset: ' + iconPath);
  }



});


test('verified Australian Store offers remain visible during missing regional-feed observations', async () => {
  const R = createRequire(import.meta.url)('../public/regional-prices.js');
  const source = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');
  const auOffer = { product: 'store-item-bag-upgrade', label: 'Item Bag Upgrade', group: 'Storage',
    currency: 'AUD', amount: 3.99, region: 'AU', verified: true, observed: '2026-11-13' };
  async function render(owner, prices, regional) {
    let requests = 0;
    const el = { innerHTML: '', querySelector: () => null, addEventListener() {} };
    const host = { parentNode: { insertBefore() {} } };
    const data = { owner, prices, regional };
    const win = {
      GORegionalPrices: R,
      GOStoreFX: { retrieve() { requests++; return Promise.resolve({}); } },
      GOLIB: { esc: s => String(s), loadPrices: () => Promise.resolve(data),
        priceView: () => ({ sub: '', save: '', main: '' }) },
      localStorage: { getItem: () => null, setItem() {} }, console
    };
    const doc = { readyState: 'complete', getElementById: id => id === 'evsource' ? host : null,
      createElement: () => el, addEventListener() {} };
    Object.assign(win, { document: doc, window: win });
    vm.runInNewContext(source, win);
    await new Promise(resolve => setTimeout(resolve, 20));
    return { html: el.innerHTML, requests };
  }
  for (const regional of [[], undefined, 'not-an-array']) {
    const { html, requests } = await render(true, [auOffer], regional);
    assert.match(html, /Regional Store prices/);
    assert.match(html, /Item Bag Upgrade/);
    assert.match(html, /A\$3\.99/);
    assert.match(html, /data-sp-group="storage"/);
    assert.equal((html.match(/sp-regional-value sp-none/g) || []).length, 2,
      'Indonesia and India stay Not observed instead of making AU products disappear');
    assert.doesNotMatch(html, /Advanced comparison/,
      'no comparison panel without any verified local buying option');
    assert.equal(requests, 0, 'no foreign FX request when no regional currency is observed');
  }
  assert.equal((await render(true, [], [])).html, '',
    'do not show an empty product catalogue with no reliable source observations');
  assert.equal((await render(false, [auOffer], [])).html, '',
    'non-owner must not see the private regional Store section');
});


test('advanced Store channel coverage never ranks same-name boxes, recorded prices or unlike currencies', async () => {
  const R = createRequire(import.meta.url)('../public/regional-prices.js');
  const now = '2026-11-13';
  const verified = (id,product,channel,amount,extra={}) => ({
    id,product,kind:'item',region:'ID',channel,currency:'IDR',amount,
    source:'synthetic regression fixture',status:'verified',observed:now,...extra
  });
  const regional = [
    verified('box-web','Raid Day Box','web',150000,{kind:'bundle'}),
    verified('box-inapp','Raid Day Box','in-app',100000,{kind:'bundle'}),
    verified('pass-web','Premium Battle Pass x3','web',30000,{sourceSku:'same-verified-pack'}),
    verified('pass-inapp','Premium Battle Pass x3','in-app',28000,{sourceSku:'same-verified-pack'}),
    verified('pass-promo','Premium Battle Pass x3','web',26000,{sourceSku:'same-verified-pack',oneTime:true}),
    verified('remote-web','Remote Raid Pass x2','web',15000,{sourceSku:'same-currency-test'}),
    verified('remote-inapp','Remote Raid Pass x2','in-app',250,{currency:'INR',sourceSku:'same-currency-test'}),
    verified('coins-bonus','18,500 PokéCoins one-time bonus','web',505000,{kind:'coins',oneTime:true}),
    verified('storage','Pokémon Storage +50','web',10000,{kind:'storage'}),
    verified('recorded','Unverified Historic Bundle','web',50000,{status:'recorded'})
  ];
  const source=fs.readFileSync(new URL('../public/store.js', import.meta.url),'utf8');
  const data={owner:true,prices:[],regional};
  const root={innerHTML:'',querySelector:()=>null,addEventListener(){}};
  const host={parentNode:{insertBefore(){}}};
  const doc={readyState:'complete',getElementById: id=>id==='evsource'?host:null,
    createElement:()=>root,addEventListener(){}};
  const win={GORegionalPrices:R,GOLIB:{
    esc:s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),
    loadPrices:()=>Promise.resolve(data),priceView:()=>({sub:'',save:'',main:''})
  },document:doc,localStorage:{getItem:()=>null,setItem(){}},console};
  win.window=win;
  vm.runInNewContext(source,win);
  await new Promise(resolve=>setTimeout(resolve,20));
  const review=root.innerHTML.split('<div data-sp-cheapest>')[1]?.split('</details>')[0]||'';
  assert.ok(review.includes('Raid Day Box')&&review.includes('Pokémon Storage +50'),
    'verified bundles and storage must be represented, not just event passes');
  assert.ok(review.includes('18,500 PokéCoins one-time bonus'),
    'one-time bonus packs remain distinct and observable');
  assert.equal((review.match(/Indonesia · Raid Day Box/g)||[]).length,2,
    'same human product name with distinct source records must never collapse into an assumed SKU');
  assert.doesNotMatch(review,/Unverified Historic Bundle/,
    'recorded-only prices do not enter the verified purchasing review');
  assert.equal((review.match(/data-sp-compared="yes"/g)||[]).length,1,
    'only a verified exact SKU across distinct checkout channels can be cash-ranked');
  assert.equal((review.match(/Indonesia · Premium Battle Pass x3/g)||[]).length,2,
    'a one-time promotional pack stays separate even when another channel reuses its SKU');
  assert.match(review,/Lowest verified cash price across 2 exact-SKU channels:.*in-app shop · Rp 28,000/,
    'same-SKU same-currency checkout comparison can choose the verified cheaper channel');
  assert.match(review,/Different currencies: no reliable lowest-price comparison/,
    'a fake INR-versus-IDR numerical cheapest claim must never appear');
  assert.match(review,/Only one verified buying channel observed; no lowest-price comparison/,
    'a single verified channel cannot win a cheapest-price comparison');
  assert.doesNotMatch(root.innerHTML,/data-sp-coins/,
    'do not display a coin-optimisation input when no validated coin-pack optimiser is being run');
});


test('Store product search accepts unaccented and composed/decomposed Pokémon names', async () => {
  const R = createRequire(import.meta.url)('../public/regional-prices.js');
  const source = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');
  const prices = [
    { product:'store-pokemon-storage', label:'Pokémon Storage +50', group:'Storage', currency:'AUD',
      amount:3.99, region:'AU', verified:true, observed:'2026-11-13' },
    { product:'store-pokecoins-110', label:'110 PokéCoins', group:'PokéCoins', currency:'AUD',
      amount:1.59, region:'AU', verified:true, observed:'2026-11-13' },
    { product:'store-elite-fast-tm', label:'Elite Fast TM', group:'Items', currency:'AUD',
      amount:4.99, region:'AU', verified:true, observed:'2026-11-13' }
  ];
  let onSearch = null, groups = [];
  const input = {value:'', addEventListener:(name,fn) => { if (name==='input') onSearch=fn; }};
  const counter = {textContent:''};
  const el = {innerHTML:'',id:'',addEventListener(){},
    querySelector: selector => selector === '[data-sp-search]' ? input :
      selector === '[data-sp-results]' ? counter : null,
    querySelectorAll: selector => selector === '[data-sp-group]' ? groups : []};
  const host = {parentNode:{insertBefore(){}}};
  const doc = {readyState:'complete',getElementById:id => id==='evsource'?host:null,
    createElement:() => el,addEventListener(){}};
  const win = {window:null,document:doc,GORegionalPrices:R,
    GOLIB:{esc:s=>String(s),loadPrices:()=>Promise.resolve({owner:true,prices,regional:[]}),
      priceView:()=>({sub:'',save:'',main:''})},console};
  win.window=win;
  vm.runInNewContext(source,win);
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(typeof onSearch,'function');
  const block=/<details class="sp-group" data-sp-group="([^"]+)" data-sp-default-open="(yes|no)"[^>]*>([\s\S]*?)<\/details>/g;
  groups=[...el.innerHTML.matchAll(block)].map(match=>{
    const cards=[...match[3].matchAll(/<article class="sp-product" data-sp-product data-sp-name="([^"]+)"[\s\S]*?<\/article>/g)]
      .map(card=>({name:card[1],hidden:false,getAttribute(key){return key==='data-sp-name'?this.name:null;}}));
    return {id:match[1],initial:match[2],cards,hidden:false,open:match[2]==='yes',
      querySelectorAll:()=>cards,getAttribute:key=>key==='data-sp-default-open'?match[2]:null};
  });
  assert.equal(groups.reduce((total,g)=>total+g.cards.length,0),3,
    'the real Store HTML must contain all three verified product cards');
  assert.ok(groups.flatMap(g=>g.cards).some(c=>c.name.includes('pokemon storage')),
    'accent-free searchable data must be rendered from the source label');
  assert.ok(groups.flatMap(g=>g.cards).some(c=>c.name.includes('pokecoins')),
    'PokéCoins must not require an accented keyboard');
  function search(term,expected) {
    input.value=term;onSearch();
    assert.equal(counter.textContent,expected+(expected===1?' product':' products')+' shown','query '+JSON.stringify(term));
    assert.equal(groups.flatMap(g=>g.cards).filter(card=>!card.hidden).length,expected);
  }
  search('poke',2);
  search('POKÉ',2);
  search('Poke\u0301',2);
  search('pokemon',1);
  search('POKÉMON',1);
  search('pokecoins',1);
  search('ELITE',1);
  search('nonsense',0);
  search('',3);
  assert.ok(groups.find(g=>g.id==='storage').open,
    'clearing the query restores the original open category state');
  assert.equal(groups.find(g=>g.id==='items').open,false,
    'clearing search keeps secondary categories collapsed');
});


test('Store counters separate fresh listings from visible unconfirmed and archived historical offers', async () => {
  const R = createRequire(import.meta.url)('../public/regional-prices.js');
  const source = fs.readFileSync(new URL('../public/store.js', import.meta.url), 'utf8');
  const now = new Date().toISOString();
  const prices = [
    {product:'store-current-pass',label:'Current Fixture Pass',group:'Tickets',currency:'AUD',amount:8.99,region:'AU',verified:true,observed:'2026-11-13'},
    {product:'store-storage-upgrade',label:'Item Bag Upgrade',group:'Storage',currency:'AUD',amount:3.99,region:'AU',verified:true,observed:'2026-11-13'},
    {product:'store-old-pass',label:'Previous Fixture Pass',group:'Tickets',currency:'AUD',amount:6.99,region:'AU',verified:true,observed:'2026-10-12'}
  ];
  const snapshot = {version:1,updated:now,items:[{name:'Current Fixture Pass',lastSeen:now}],
    gone:[{name:'Previous Fixture Pass',lastSeen:'2026-10-12',goneAt:now}]};
  assert.equal(R.catalogue(prices, [], undefined, []).length, 3, 'synthetic AU Store rows must satisfy the real source-identity gate');
  const data = {owner:true,prices,regional:[],storeSnapshot:snapshot};
  const root = {innerHTML:'',addEventListener(){},querySelector:()=>null};
  const host = {parentNode:{insertBefore(node){Object.assign(root,node);}}};
  const doc = {readyState:'complete',getElementById:id=>id==='evsource'?host:null,
    createElement:()=>root,addEventListener(){}};
  const win = {GORegionalPrices:R,
    GOLIB:{esc:s=>String(s),loadPrices:()=>Promise.resolve(data),
      priceView:()=>({sub:'',save:'',main:''})},document:doc,
    localStorage:{getItem:()=>null,setItem(){}},console};
  win.window=win;
  vm.runInNewContext(source,win);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.match(root.innerHTML,/1 recently listed · 1 visible unconfirmed · 1 previous\/unconfirmed/,
    'summary and live-region must count only source-listed offers as recently listed');
  assert.equal((root.innerHTML.match(/1 recently listed · 1 visible unconfirmed · 1 previous\/unconfirmed/g)||[]).length,2,
    'summary and accessible results must agree');
  assert.match(root.innerHTML,/data-sp-listing="listed"/);
  assert.match(root.innerHTML,/data-sp-listing="unconfirmed"/);
  assert.match(root.innerHTML,/data-sp-listing="archived"/);
  assert.match(root.innerHTML,/Item Bag Upgrade/);
  assert.match(root.innerHTML,/A\$3\.99/,'historical storage price remains visible');
  assert.match(root.innerHTML,/data-sp-group="earlier"/,'retired pass remains in archive');
  assert.match(root.innerHTML,/data-sp-search/,'search remains available for all product cards');
});
