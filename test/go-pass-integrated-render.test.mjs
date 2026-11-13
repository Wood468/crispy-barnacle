import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const C = require('../public/event-contract.js');
const UI = require('../public/event-components.js');
const reward = require('../public/go-pass-reward-art.js');
const nav = require('../public/go-pass-navigation.js');
const root = new URL('../public/', import.meta.url);
const file = name => readFileSync(new URL(name, root), 'utf8');
const model = stages => C.normalize({schemaVersion:1,eventId:'future-pass-s3',title:'Source-backed synthetic GO Pass',passes:[{title:'Published test rewards',stages}]});
function withSemantic(fn) {
 const previous = globalThis.GOGoPassRewardArt;
 globalThis.GOGoPassRewardArt = reward;
 try { return fn(); } finally {
  if (previous === undefined) delete globalThis.GOGoPassRewardArt;
  else globalThis.GOGoPassRewardArt = previous;
 }
}
test('wired renderer uses only exact approved item art and honest category tokens', () => withSemantic(() => {
 const html=UI.render(model([
  {rank:1,free:[{type:'item',name:'Remote Raid Pass'},{type:'item',name:'XP'}]},
  {rank:2,free:[{type:'item',name:'Elite Charged TM'},{type:'item',name:'Rare Candy XL'}]},
  {rank:3,free:[{type:'item',name:'Raid Pass'},{type:'item',name:'Max Potion'}]}
 ]),{});
 assert.match(html,/Elite Charged TM/);
 assert.match(html,/\/ico\/g\/elite-charged-tm\.webp/);
 assert.match(html,/\/ico\/g\/raidpass\.webp/);
 assert.match(html,/\/ico\/i\/max-potion\.webp/);
 assert.match(html,/Remote Raid Pass/);
 // The one exact Raid Pass above is the only permitted use of the icon;
 // Remote Raid Pass is a separate item with a category glyph.
 assert.equal((html.match(/src="\/ico\/g\/raidpass\.webp"/g)||[]).length,1);
 assert.match(html,/ue-reward-icon">XP<\/span>/);
 assert.match(html,/ue-reward-icon">RXL<\/span>/);
 assert.doesNotMatch(html,/\/ico\/xp\.webp/);
 assert.match(html,/<b>Remote Raid Pass<\/b>/);
 assert.match(html,/<b>Rare Candy XL<\/b>/);
}));
test('unattributed published rewards survive empty named tracks, with no fabricated Free/Deluxe assignment', () => withSemantic(() => {
 const html = UI.render(model([{rank:45,free:[],deluxe:[],rewards:[{type:'item',name:'Silver Bottle Cap'}]},{rank:46,free:[],deluxe:[],rewards:[]}]),{});
 assert.match(html,/data-rank="45"/);
 assert.doesNotMatch(html,/data-rank="46"/);
 assert.match(html,/Silver Bottle Cap/);
 assert.match(html,/Track not specified/);
 assert.doesNotMatch(html,/Track rewards not specified for this rank/);
 assert.equal(nav.indexRanks([45]).count,1);
 assert.equal(nav.lookup(nav.indexRanks([45]),46).status,'unlisted');
}));
test('published mixed-track rank preserves unmatched unattributed rewards without false Free attribution', () => withSemantic(() => {
 const html=UI.render(model([{rank:45,
  free:[{name:'Incense',type:'item',quantity:1}],
  deluxe:[{name:'Silver Bottle Cap',type:'item'}],
  rewards:[{name:'Incense',type:'item',quantity:1},{name:'Incense',type:'item',quantity:2},{name:'Remote Raid Pass',type:'item'}]
 }]),{});
 const row=html.match(/<li class="ue-pass-rank" data-rank="45">([\s\S]*?)<\/li>/);
 assert.ok(row,'published rank exists');
 const detail=row[1];
 assert.match(detail,/<div class="ue-lane ue-lane-free"><h5>Free<\/h5>/);
 assert.match(detail,/<div class="ue-lane ue-lane-deluxe"><h5>Deluxe<\/h5>/);
 assert.match(detail,/<div class="ue-lane ue-lane-unspecified"><h5>Track not specified<\/h5>/);
 assert.equal((detail.match(/<b>Incense<\/b>/g)||[]).length,2,'different quantities remain separate, identical Free reward is not doubled');
 assert.match(detail,/<b>Remote Raid Pass<\/b>/);
 assert.match(detail,/×2 · Item/);
 const unspecifiedAt=detail.indexOf('<div class="ue-lane ue-lane-unspecified">');
 assert.ok(unspecifiedAt>detail.indexOf('<div class="ue-lane ue-lane-deluxe">'));
 assert.ok(detail.indexOf('<b>Remote Raid Pass</b>')>unspecifiedAt,'unattributed reward is rendered in neutral lane');
}));
test('published Rank 45 and Rank 100 remain pinned, closed range entries preserve source numbers', () => withSemantic(() => {
 const stages=[{rank:1,free:[{name:'Incense',type:'item'}]},{rank:45,free:[{name:'Dynamax Meltan',type:'encounter'}]},{rank:100,deluxe:[{name:'Silver Bottle Cap',type:'item'}]},{rank:600,free:[{name:'XP',type:'item'}]}];
 const html=UI.render(model(stages),{});
 assert.match(html,/Published milestones/);
 assert.match(html,/data-milestone-rank="45"/);
 assert.match(html,/data-milestone-rank="100"/);
 assert.match(html,/Ranks 26–50 · 1 published/);
 assert.match(html,/Ranks 576–600 · 1 published/);
 assert.match(html,/class="ue-pass-range"/);
 assert.doesNotMatch(html,/>101 of 600 ranks listed</);
}));
test('sparse future passes keep every unpublished rank note within its actual 25-rank band', () => withSemantic(() => {
 const stages=[1,101,200,600].map(rank=>({rank,free:[{type:'item',name:'Incense'}]}));
 const html=UI.render(model(stages),{});
 const panels=[...html.matchAll(/<details class="ue-pass-range"><summary>([^<]+)<\/summary><ol class="ue-pass-stages">([\s\S]*?)<\/ol><\/details>/g)]
  .map(match=>({label:match[1],body:match[2]}));
 assert.deepEqual(panels.map(p=>p.label),[
  'Ranks 1–25 · 1 published',
  'Ranks 101–125 · 1 published',
  'Ranks 176–200 · 1 published',
  'Ranks 576–600 · 1 published'
 ]);
 assert.match(panels[0].body,/Ranks 2–25: no reward entries published by the source/);
 assert.match(panels[1].body,/Ranks 102–125: no reward entries published by the source/);
 assert.match(panels[2].body,/Ranks 176–199: no reward entries published by the source/);
 assert.match(panels[3].body,/Ranks 576–599: no reward entries published by the source/);
 assert.doesNotMatch(panels[2].body,/Ranks 102–199|Ranks 126–175/);
 assert.match(html,/<p class="ue-pass-gap ue-pass-gap-between" role="note">Ranks 26–100: no reward entries published by the source<\/p>/);
 assert.match(html,/<p class="ue-pass-gap ue-pass-gap-between" role="note">Ranks 126–175: no reward entries published by the source<\/p>/);
 assert.match(html,/<p class="ue-pass-gap ue-pass-gap-between" role="note">Ranks 201–575: no reward entries published by the source<\/p>/);
 assert.equal((html.match(/class="ue-pass-gap ue-pass-gap-between"/g)||[]).length,3);
 const prevGroupEnd=html.indexOf('</details>',html.indexOf('Ranks 101–125 · 1 published'));
 const nextGroupStart=html.lastIndexOf('<details class="ue-pass-range">',html.indexOf('Ranks 176–200 · 1 published'));
 const boundaryGap=html.indexOf('>Ranks 126–175: no reward entries published');
 assert.ok(boundaryGap>prevGroupEnd&&boundaryGap<nextGroupStart,'whole missing bands sit between group disclosures');
 assert.equal((html.match(/class="ue-pass-rank" data-rank="/g)||[]).length,4,'published source ranks are unchanged');
 assert.equal(nav.lookup(nav.indexRanks([1,101,200,600]),175).status,'unlisted');
}));

test('dense and single-rank groups avoid cross-boundary gaps and do not fabricate rewards', () => withSemantic(() => {
 const stages=[1,2,25,26,45,50].map(rank=>({rank,deluxe:[{type:'item',name:'Lucky Egg'}]}));
 const html=UI.render(model(stages),{});
 const panels=[...html.matchAll(/<details class="ue-pass-range"><summary>([^<]+)<\/summary><ol class="ue-pass-stages">([\s\S]*?)<\/ol><\/details>/g)];
 assert.equal(panels.length,2);
 assert.match(panels[0][2],/Ranks 3–24: no reward entries published by the source/);
 assert.match(panels[1][2],/Ranks 27–44: no reward entries published by the source/);
 assert.match(panels[1][2],/Ranks 46–49: no reward entries published by the source/);
 assert.doesNotMatch(html,/class="ue-pass-gap ue-pass-gap-between"/,'no whole 25-rank group is missing');
 assert.equal((html.match(/class="ue-pass-rank" data-rank="/g)||[]).length,6);
}));

test('load order, offline references and post-render mount form a complete PWA integration', () => {
 const index=file('index.html'),sw=file('sw.js'),dash=file('dash.js'),detail=file('detail.js'),components=file('event-components.js');
 const dashPreload=index.match(/<link rel="preload" href="(\/dash\.js\?v=[^"]+)" as="script">/);
 assert.ok(dashPreload,'dashboard preload must be a versioned script');
 const assets=[
  '/go-pass-navigation.css?v=20261118h',
  '/go-pass-navigation.js?v=20261118i',
  '/go-pass-reward-art.js?v=20261118d',
  '/event-components.js?v=20261118g',
  dashPreload[1]
 ];
 for(const asset of assets){assert.ok(index.includes(asset),asset+' absent from index');assert.ok(sw.includes(asset),asset+' absent from PWA shell');}
 assert.ok(index.indexOf('/go-pass-reward-art.js?v=')<index.indexOf('/event-components.js?v='),'semantic registry must load before renderer');
 assert.ok(index.indexOf('/go-pass-navigation.js?v=')<index.indexOf('/app.js?v='),'navigator must load before app navigation');
 assert.match(dash,/\/detail\.js\?v=20261118b/);
 assert.match(sw,/\/detail\.js\?v=20261118b/);
 const renderAt=detail.indexOf("o.innerHTML = '<div class=\"evd-in\">'");
 const mountAt=detail.indexOf('GOGoPassNavigation.mount(o)',renderAt);
 assert.ok(renderAt>=0&&mountAt>renderAt&&mountAt<renderAt+300,'mount after actual event render');
 assert.match(components,/GOGoPassRewardArt\.resolve/);
 assert.match(sw,/^const SHELL_CACHE = 'gofn-shell-v[1-9][0-9]*';$/m);
});

test('exact Pokémon encounter artwork stays delegated to the existing resolver', () => withSemantic(() => {
 const html=UI.render(model([{rank:45,free:[{type:'encounter',name:'Crowned Sword Zacian'}]}]),{
  rewardArt: item => item.name==='Crowned Sword Zacian'?
   '<img class="exact-form-art" src="/art/zacian-crowned-test.webp" alt="">':''
 });
 assert.match(html,/Crowned Sword Zacian/);
 assert.match(html,/class="exact-form-art"/);
 assert.match(html,/src="\/art\/zacian-crowned-test\.webp"/);
 assert.doesNotMatch(html,/Form art unavailable|generic-zacian/);
}));


test('GO Pass legend identifies only tracks actually backed by published rewards', () => withSemantic(() => {
 const unknown=UI.render(model([{rank:45,rewards:[{type:'item',name:'Silver Bottle Cap'}]}]),{});
 const legend=unknown.match(/<p class="ue-pass-legend">([\s\S]*?)<\/p>/);
 assert.ok(legend);
 assert.match(legend[1],/class="ue-key ue-key-unspecified">Track not specified/);
 assert.doesNotMatch(legend[1],/Free track|Deluxe track|Deluxe also receives/);
 const freeOnly=UI.render(model([{rank:1,free:[{name:'Poké Ball',type:'item'}]}]),{});
 const freeLegend=freeOnly.match(/<p class="ue-pass-legend">([\s\S]*?)<\/p>/)[1];
 assert.match(freeLegend,/Free track/);
 assert.doesNotMatch(freeLegend,/Deluxe track|Track not specified|Deluxe also receives/);
 const mixed=UI.render(model([{rank:1,free:[{name:'Poké Ball',type:'item'}],
  deluxe:[{name:'Silver Bottle Cap',type:'item'}],rewards:[{name:'Incense',type:'item'}]}]),{});
 const mixedLegend=mixed.match(/<p class="ue-pass-legend">([\s\S]*?)<\/p>/)[1];
 assert.match(mixedLegend,/Free track/);
 assert.match(mixedLegend,/Deluxe track/);
 assert.match(mixedLegend,/Track not specified/);
 assert.match(mixedLegend,/Deluxe also receives every Free reward/);
}));

test('GO Pass avoids reclassifying accented or inline-quantity duplicate rewards as unknown track', () => withSemantic(() => {
 const html=UI.render(model([{rank:45,
   free:[{name:'Poké Ball',quantity:3,type:'item'}],
   deluxe:[{name:'Rare Candy XL',quantity:2,type:'item'}],
   rewards:[
     'Poke Ball ×3',
     {name:'Poké Ball ×3',type:'item'},
     {name:'Rare Candy XL x2',type:'item'},
     {name:'Poké Ball',quantity:4,type:'item'},
     {name:'Remote Raid Pass',type:'item'}
   ]
 }]),{});
 const row=html.match(/<li class="ue-pass-rank" data-rank="45">([\s\S]*?)<\/li>/)[1];
 assert.equal((row.match(/<b>Poké Ball<\/b>/g)||[]).length,2,
   'Free ×3 and distinct unattributed ×4 remain, but inline ×3 duplicate is suppressed');
 assert.equal((row.match(/<b>Rare Candy XL<\/b>/g)||[]).length,1);
 assert.doesNotMatch(row,/<b>Poké Ball ×3<\/b>|<b>Poke Ball<\/b>|<b>Rare Candy XL x2<\/b>/);
 assert.match(row,/<div class="ue-lane ue-lane-unspecified">/);
 assert.match(row,/×4 · Item/);
 assert.match(row,/<b>Remote Raid Pass<\/b>/);
}));


test('conflicting explicit GO Pass quantities remain separate pending source reconciliation', () => withSemantic(() => {
 const html=UI.render(model([{rank:12,
  free:[{name:'Incense ×2',quantity:3,type:'item'}],
  rewards:[{name:'Incense',quantity:2,type:'item'}]
 }]),{});
 const rank=html.match(/<li class="ue-pass-rank" data-rank="12">([\s\S]*?)<\/li>/)[1];
 assert.match(rank,/<div class="ue-lane ue-lane-free">/);
 assert.match(rank,/<div class="ue-lane ue-lane-unspecified">/);
 assert.equal((rank.match(/<b>Incense<\/b>|<b>Incense ×2<\/b>/g)||[]).length,2,
   'conflicting quantities are not silently merged into a single entitlement');
}));

test('fallback without optional item-art mapper never borrows remote or premium pass artwork', () => {
 const previous = globalThis.GOGoPassRewardArt;
 try {
  delete globalThis.GOGoPassRewardArt;
  const html = UI.render(model([{rank:1,free:[
   {type:'item',name:'Remote Raid Pass'},
   {type:'item',name:'Premium Battle Pass'},
   {type:'item',name:'Raid Pass'},
   {type:'encounter',name:'Dynamax Meltan'},
   {type:'item',name:'Golden Razz Bonus'}
  ]}]),{});
  const row=html.match(/<li class="ue-pass-rank" data-rank="1">([\s\S]*?)<\/li>/);
  assert.ok(row,'actual GO Pass reward row renders');
  assert.equal((row[1].match(/src="\/ico\/g\/raidpass\.webp"/g)||[]).length,1,
    'only the ordinary Raid Pass uses its exact verified image');
  const tiles=row[1].match(/<div class="ue-pass-reward"[\s\S]*?<\/div>/g)||[];
  function tile(name){return tiles.find(t=>t.includes('<b>'+name+'</b>'));}
  for(const name of ['Remote Raid Pass','Premium Battle Pass']){
    assert.ok(tile(name),name+' displayed');
    assert.doesNotMatch(tile(name),/\/ico\/g\/raidpass\.webp/,
      name+' must not masquerade as an ordinary Raid Pass');
  }
  assert.match(tile('Raid Pass'),/\/ico\/g\/raidpass\.webp/);
  assert.match(row[1],/ue-reward-icon">PKM<\/span>/,
    'encounters with no sourced asset should show an honest category indicator, not a broken-image question mark');
  assert.doesNotMatch(row[1],/\/ico\/i\/golden-razz\.webp/,
    'a Golden Razz Bonus is not proof of a Golden Razz Berry reward');
 } finally {
  if(previous === undefined) delete globalThis.GOGoPassRewardArt;
  else globalThis.GOGoPassRewardArt = previous;
 }
});

test('agreeing inline and structured reward quantities display once with exact semantic artwork', () => withSemantic(() => {
 const html=UI.render(model([{rank:8,
  free:[{name:'Raid Pass x2',quantity:2,type:'item'},{name:'Poké Ball ×3',quantity:3,type:'item'}],
  rewards:[{name:'Raid Pass',quantity:2,type:'item'},{name:'Poké Ball',quantity:3,type:'item'},
   {name:'Poké Ball',quantity:4,type:'item'}]
 }]),{});
 const row=html.match(/<li class="ue-pass-rank" data-rank="8">([\s\S]*?)<\/li>/)[1];
 assert.equal((row.match(/<b>Raid Pass<\/b>/g)||[]).length,1);
 assert.equal((row.match(/<b>Poké Ball<\/b>/g)||[]).length,2,
  'an agreed inline ×3 is the same reward; a genuinely distinct ×4 remains');
 assert.doesNotMatch(row,/<b>(?:Raid Pass x2|Poké Ball ×3)<\/b>/,
  'quantities in the name are displayed once instead of repeated');
 assert.match(row,/src="\/ico\/g\/raidpass\.webp"/,
  'the exact item resolver can recognise a named reward after normalisation');
 assert.match(row,/×2 · Item/);
 assert.match(row,/×3 · Item/);
 assert.match(row,/×4 · Item/);
}));
