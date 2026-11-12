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
 assert.match(html,/ue-reward-icon">XL<\/span>/);
 assert.doesNotMatch(html,/\/ico\/xp\.webp/);
 assert.match(html,/<b>Remote Raid Pass<\/b>/);
 assert.match(html,/<b>Rare Candy XL<\/b>/);
}));
test('unattributed published rewards survive empty named tracks, with no fabricated Free/Deluxe assignment', () => withSemantic(() => {
 const html = UI.render(model([{rank:45,free:[],deluxe:[],rewards:[{type:'item',name:'Silver Bottle Cap'}]},{rank:46,free:[],deluxe:[],rewards:[]}]),{});
 assert.match(html,/data-rank="45"/);
 assert.doesNotMatch(html,/data-rank="46"/);
 assert.match(html,/Silver Bottle Cap/);
 assert.match(html,/Reward · track not specified/);
 assert.doesNotMatch(html,/Track rewards not specified for this rank/);
 assert.equal(nav.indexRanks([45]).count,1);
 assert.equal(nav.lookup(nav.indexRanks([45]),46).status,'unlisted');
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
test('load order, offline references and post-render mount form a complete PWA integration', () => {
 const index=file('index.html'),sw=file('sw.js'),dash=file('dash.js'),detail=file('detail.js'),components=file('event-components.js');
 const assets=[
  '/go-pass-navigation.css?v=20261118a',
  '/go-pass-navigation.js?v=20261118a',
  '/go-pass-reward-art.js?v=20261118a',
  '/event-components.js?v=20261118a',
  '/dash.js?v=20261118b'
 ];
 for(const asset of assets){assert.ok(index.includes(asset),asset+' absent from index');assert.ok(sw.includes(asset),asset+' absent from PWA shell');}
 assert.ok(index.indexOf('/go-pass-reward-art.js?v=')<index.indexOf('/event-components.js?v='),'semantic registry must load before renderer');
 assert.ok(index.indexOf('/go-pass-navigation.js?v=')<index.indexOf('/app.js?v='),'navigator must load before app navigation');
 assert.match(dash,/\/detail\.js\?v=20261118a/);
 assert.match(sw,/\/detail\.js\?v=20261118a/);
 const renderAt=detail.indexOf("o.innerHTML = '<div class=\"evd-in\">'");
 const mountAt=detail.indexOf('GOGoPassNavigation.mount(o)',renderAt);
 assert.ok(renderAt>=0&&mountAt>renderAt&&mountAt<renderAt+300,'mount after actual event render');
 assert.match(components,/GOGoPassRewardArt\.resolve/);
 assert.match(sw,/SHELL_CACHE = 'gofn-shell-v310'/);
});