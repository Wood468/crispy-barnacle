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
    [/^raid pass$/i, '/ico/g/raidpass.webp'],
    /* Owner-supplied pictures (docs/asset-inventory/item-icons.json); exact names only. */
    [/^star piece$/i, '/ico/i/star-piece.webp'],
    [/^poke ball$/i, '/ico/i/poke-ball.webp'],
    [/^great ball$/i, '/ico/i/great-ball.webp'],
    [/^ultra ball$/i, '/ico/i/ultra-ball.webp'],
    [/^rare candy$/i, '/ico/i/rare-candy.webp'],
    [/^rare candy xl$/i, '/ico/i/rare-candy-xl.webp'],
    [/^lucky egg$/i, '/ico/i/lucky-egg.webp'],
    [/^egg incubator$/i, '/ico/i/egg-incubator.webp'],
    [/^super incubator$/i, '/ico/i/super-incubator.webp'],
    [/^nanab berry$/i, '/ico/i/nanab-berry.webp'],
    [/^max mushroom$/i, '/ico/i/max-mushroom.webp'],
    [/^revive$/i, '/ico/i/revive.webp'],
    [/^potion$/i, '/ico/i/potion.webp'],
    [/^hyper potion$/i, '/ico/i/hyper-potion.webp'],
    [/^super potion$/i, '/ico/i/super-potion.webp'],
    [/^remote raid pass$/i, '/ico/i/remote-raid-pass.webp'],
    [/^max particle(?: pack|s)$/i, '/ico/i/max-particle-pack.webp'],
    [/^lure module$/i, '/ico/i/lure-module.webp'],
    [/^link charges?$/i, '/ico/i/link-charge.webp'],
    [/^pinap berry$/i, '/ico/i/pinap-berry.webp'],
    [/^eternatus candy$/i, '/ico/i/eternatus-candy.webp'],
    [/^eternatus candy xl$/i, '/ico/i/eternatus-candy-xl.webp'],
    [/^premium battle pass$/i, '/ico/i/premium-battle-pass.webp']
  ];
  /* Species candy pictures supplied by the owner (docs/asset-inventory/item-icons.json, "candy" block): /ico/c/<slug>.webp and <slug>-xl.webp.
     Only slugs listed here are ever requested, so there are no 404s. Generated list; test/candy-icons.test.mjs keeps it equal to the files. */
  var CANDY_SLUGS = ' abra absol aerodactyl aipom alomomola amaura annihilape anorith applin arceus archen arctovish arctozolt aron arrokuda articuno audino axew azelf bagon baltoy barboach beldum bellsprout bergmite bidoof binacle blacephalon blipbug blitzle bombirdier bouffalant bounsweet bramblin bronzor brute-bonnet bruxish buizel bulbasaur buneary bunnelby buzzwole cacnea calyrex capsakid carbink carnivine carvanha castform caterpie celebi celesteela cetoddle chansey charcadet charmander chatot cherubi chespin chewtle chi-yu chien-pao chikorita chimchar chimecho chinchou clamperl clauncher clefairy clobbopus clodsire cobalion combee comfey corphish corsola cosmog cottonee crabrawler cramorant cranidos cresselia croagunk cryogonal cubchoo cubone cufant cutiefly cyclizar cyndaquil darkrai darumaka dedenne deino delibird dewpider dhelmise dialga diancie diglett ditto doduo dondozo dracovish dracozolt drampa dratini dreepy drifloon drilbur drowzee druddigon ducklett dudunsparce dunsparce duraludon durant duskull dwebble eevee eiscue ekans electabuzz electrike elgyem emolga entei espurr exeggcute falinks farfetch-d farigiraf feebas fennekin ferroseed fezandipiti fidough finizen finneon flamigo fletchling flittle flutter-mane fomantis foongus frigibax frillish froakie fuecoco gastly geodude gible gimmighoul girafarig glameow glastrier gligar glimmet goldeen golett goomy gossifleur gothita gouging-fire great-tusk greavard grimer grookey groudon growlithe grubbin gulpin guzzlord hatenna hawlucha heatmor heatran helioptile heracross hippopotas hitmonchan hitmonlee ho-oh honedge hoothoot hoppip horsea houndour illumise impidimp indeedee inkay iron-boulder iron-bundle iron-crown iron-hands iron-jugulis iron-leaves iron-moth iron-thorns iron-treads iron-valiant jangmo-o jigglypuff jirachi joltik jynx kabuto kangaskhan karrablast kartana kecleon kingambit klawf klefki klink koffing komala koraidon krabby kricketot kubfu kyogre kyurem lapras larvesta larvitar latias latios lechonk ledyba lickitung lileep lillipup litleo litten litwick lotad lucario lugia lunatone luvdisc machop magearna magikarp magmar magnemite makuhita manaphy mankey mantine maractus mareanie mareep marill marshadow maschiff mawile meditite meloetta meltan meowth mesprit mew mewtwo mienfoo milcery miltank mimikyu minccino minior minun miraidon misdreavus moltres morelull morpeko mr-mime mudbray mudkip munkidori munna murkrow nacli natu necrozma nickit nidoran-f nidoran-m nihilego nincada noibat nosepass numel nymble oddish ogerpon okidogi omanyte onix oranguru orthworm oshawott pachirisu palkia pancham panpour pansage pansear paras passimian patrat pawmi pawniard pecharunt petilil phanpy phantump pheromosa phione pidgey pidove pikachu pikipek pincurchin pineco pinsir piplup plusle poipole poliwag poltchageist ponyta poochyena popplio porygon psyduck pumpkaboo purrloin pyukumuku quaxly qwilfish raging-bolt raikou ralts rattata rayquaza regice regidrago regieleki regigigas regirock registeel relicanth rellor remoraid reshiram rhyhorn roaring-moon rockruff roggenrola rolycoly rookidee roselia rotom rowlet rufflet sableye salandit sandile sandshrew sandy-shocks sandygast sawk scatterbug scorbunny scraggy scream-tail scyther seedot seel sentret seviper sewaddle shaymin shellder shelmet shieldon shinx shroodle shroomish shuckle shuppet sigilyph silicobra sinistea sizzlipede skarmory skiddo skitty skorupi skrelp skwovet slakoth slither-wing slowpoke slugma smeargle smoliv sneasel snivy snom snorlax snorunt snover snubbull sobble solosis solrock spearow spectrier spheal spinarak spinda spiritomb spoink sprigatito spritzee squirtle stakataka stantler starly staryu stonjourner stufful stunfisk stunky sudowoodo suicune sunkern surskit swablu swinub swirlix tadbulb taillow tandemaus tangela tapu-bulu tapu-fini tapu-koko tapu-lele tarountula tauros teddiursa tentacool tepig terapagos terrakion throh timburr ting-lu tinkatink tirtouga toedscool togedemaru togepi torchic torkoal totodile toxel trapinch treecko tropius trubbish turtonator turtwig tympole tynamo type-null tyrogue tyrunt uxie vanillite varoom veluza venipede venonat victini virizion volbeat volcanion voltorb vullaby vulpix wailmer walking-wake wattrel weedle whismur wiglett wimpod wingull wo-chien wobbuffet woobat wooloo wooper wurmple xerneas xurkitree yamask yamper yanma yungoos yveltal zangoose zapdos zarude zekrom zeraora zigzagoon zorua zubat ';
  function candySlug(n) {
    return String(n).normalize('NFKD').replace(/\u2640/g, ' f').replace(/\u2642/g, ' m').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  /* Exact '<Pokemon> Candy' / '<Pokemon> Candy XL' (optional quantity prefix such as '10\u00d7 '). Rare Candy, unknown names and any other wording return ''. */
  function candyIcon(raw) {
    var n = String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim().replace(/^[\d,]+ ?[\u00d7x] ?/i, '');
    var m = /^(.+?) Candy( XL)?$/i.exec(n);
    if (!m || /^rare$/i.test(m[1])) return '';
    var s = candySlug(m[1]);
    return s && CANDY_SLUGS.indexOf(' ' + s + ' ') >= 0 ? '/ico/c/' + s + (m[2] ? '-xl' : '') + '.webp' : '';
  }
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
    var candy = candyIcon(name);
    if (candy) return {kind:'image',category:cat,symbol:'',src:candy};
    return {kind:'symbol',category:cat,symbol:symbol(name,cat),src:null};
  }
  return {resolve:resolve,normalize:normalize,candyIcon:candyIcon,candySlugs:function () {return CANDY_SLUGS.trim().split(' ');},knownAssets:EXACT.map(function (x) {return x[1];})};
}));