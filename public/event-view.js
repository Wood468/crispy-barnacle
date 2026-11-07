/* Universal event presentation projection. Pure data, no event-ID branches or DOM. */
(function(root,factory) {
  var api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.GOEventView=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var FAMILY={
    'community-day':['overview','encounters','bonuses','research','tickets'],
    'raid-day':['overview','encounters','bonuses','research','tickets'],
    'raid-hour':['overview','encounters','bonuses'],
    'spotlight-hour':['overview','encounters','bonuses'],
    'max-battles':['overview','encounters','bonuses','research'],
    'go-fest':['overview','encounters','rotations','bonuses','research','passes','tickets'],
    'wild-area':['overview','encounters','rotations','bonuses','research','passes','tickets'],
    'go-tour':['overview','encounters','rotations','bonuses','research','passes','tickets'],
    'safari-zone':['overview','encounters','bonuses','research','tickets'],
    'city-safari':['overview','encounters','bonuses','research','tickets'],
    'go-pass':['overview','passes','research','bonuses','tickets','encounters'],
    'season':['overview','encounters','bonuses','research','passes'],
    'go-battle-league':['overview','bonuses','research'],
    'other':['overview','encounters','rotations','schedule','bonuses','research','passes','tickets']
  };
  var LABEL={overview:'Overview',encounters:'Pokémon',rotations:'Rotations',schedule:'Schedule',bonuses:'Bonuses',research:'Research',passes:'GO Pass',tickets:'Tickets'};
  function project(ev) {
    if(!ev||ev.schemaVersion!==1||!ev.eventId) throw Error('Normalized v1 event required');
    var family=FAMILY[ev.family]?ev.family:'other';
    var activities=Array.isArray(ev.activities)?ev.activities:[];
    var counts={
      overview:1,
      encounters:Array.isArray(ev.encounters)?ev.encounters.length:0,
      rotations:activities.filter(function(a){return a&&a.schedule&&a.presentation==='rotation';}).length,
      schedule:activities.filter(function(a){return a&&a.schedule&&a.presentation==='schedule';}).length,
      bonuses:Array.isArray(ev.bonuses)?ev.bonuses.length:0,
      research:(Array.isArray(ev.research)?ev.research.length:0)+activities.filter(function(a){return a&&a.schedule&&a.presentation==='research';}).length,
      passes:Array.isArray(ev.passes)?ev.passes.length:0,
      tickets:(Array.isArray(ev.tickets)?ev.tickets.length:0)+activities.filter(function(a){return a&&a.schedule&&a.presentation==='ticket';}).length
    };
    var preferred=FAMILY[family], all=FAMILY.other;
    // A family guides order but never suppresses sections actually present.
    var order=preferred.concat(all.filter(function(k){return preferred.indexOf(k)<0;}));
    return {eventId:ev.eventId,family:family,order:order.slice(),sections:order.filter(function(k){return counts[k]>0;}).map(function(k){return {key:k,label:LABEL[k],count:counts[k]};}),encounterGroups:ev.groups||{}};
  }
  return {project:project,families:Object.keys(FAMILY)};
}));
