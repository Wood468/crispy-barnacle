/* GO Pass reward artwork decisions: prefer proven exact assets, never
   substitute an item lookalike or label a placeholder as an unavailable image.
   Pure mapper; integration with Event Details is a separate release step. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GOGoPassRewardArt = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var EXACT = [
    [/^max potion$/i, '/ico/i/max-potion.webp'],
    [/^max revive$/i, '/ico/i/max-revive.webp'],
    [/^golden razz berry$/i, '/ico/i/golden-razz.webp'],
    [/^silver pinap berry$/i, '/ico/i/silver-pinap.webp'],
    [/^elite fast tm$/i, '/ico/g/elite-fast-tm.webp'],
    [/^elite charged tm$/i, '/ico/g/elite-charged-tm.webp'],
    [/^incense$/i, '/ico/incense.webp'],
    [/^stardust$/i, '/ico/dust.webp'],
    [/^raid pass$/i, '/ico/g/raidpass.webp']
  ];
  function normalize(name) {
    return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  function category(n, item) {
    if (item && item.type === 'encounter') return 'Pokémon';
    if (/candy/i.test(n)) return 'Candy';
    if (/^(?:xp|stardust|pokecoins?)$/i.test(n)) return 'Resource';
    if (/bottle cap/i.test(n)) return 'Upgrade';
    if (/\b(?:shirt|tee|pose|jacket|pants|shoes|hat|outfit|sticker|avatar)\b/i.test(n)) return 'Avatar item';
    return 'Item';
  }
  function symbol(n, cat) {
    // These glyphs identify types, not alleged photographic representations.
    if (/^xp$/i.test(n)) return 'XP';
    if (/rare candy xl/i.test(n)) return 'RXL';
    if (/candy xl/i.test(n)) return 'XL';
    if (/rare candy/i.test(n)) return 'RC';
    if (/candy/i.test(n)) return 'C';
    if (/bottle cap/i.test(n)) return 'CAP';
    if (/^poke ball$/i.test(n)) return 'PB';
    if (/^great ball$/i.test(n)) return 'GB';
    if (/^ultra ball$/i.test(n)) return 'UB';
    if (/^premier ball$/i.test(n)) return 'PR';
    if (/berry|pinap|razz/i.test(n)) return '◉';
    if (/potion|revive/i.test(n)) return '+';
    if (/^lucky egg$/i.test(n)) return 'LE';
    if (/^star piece$/i.test(n)) return 'SP';
    if (/^poffin$/i.test(n)) return 'PF';
    if (/^(?:pokecoins?|coins)$/i.test(n)) return '◎';
    if (cat === 'Avatar item') return '👕';
    return '◇';
  }
  function resolve(raw) {
    var item = typeof raw === 'string' ? {name:raw,type:'other'} : raw;
    if (!item || typeof item.name !== 'string') return null;
    var name = normalize(item.name);
    if (!name || /^[-–—]+$/.test(name)) return null;
    var cat = category(name,item);
    if (item.type === 'encounter') return {kind:'encounter',category:cat,symbol:'',src:null};
    var icon = EXACT.find(function (entry) {return entry[0].test(name);});
    if (icon) return {kind:'image',category:cat,symbol:'',src:icon[1]};
    return {kind:'symbol',category:cat,symbol:symbol(name,cat),src:null};
  }
  return {resolve:resolve,normalize:normalize,knownAssets:EXACT.map(function (x) {return x[1];})};
}));