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
    // Ignore empty source placeholders: a section should only appear when it has content.
    function populated(value){return value!==null&&value!==undefined&&value!==''&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;}
    function countRecords(value){return Array.isArray(value)?value.filter(populated).length:0;}
    var counts={
      overview:1,
      encounters:countRecords(ev.encounters),
      rotations:activities.filter(function(a){return a&&a.schedule&&a.presentation==='rotation';}).length,
      schedule:activities.filter(function(a){return a&&a.schedule&&a.presentation==='schedule';}).length,
      bonuses:countRecords(ev.bonuses),
      research:countRecords(ev.research)+activities.filter(function(a){return a&&a.schedule&&a.presentation==='research';}).length,
      passes:countRecords(ev.passes),
      tickets:countRecords(ev.tickets)+activities.filter(function(a){return a&&a.schedule&&a.presentation==='ticket';}).length
    };
    var preferred=FAMILY[family], all=FAMILY.other;
    // A family guides order but never suppresses sections actually present.
    var order=preferred.concat(all.filter(function(k){return preferred.indexOf(k)<0;}));
    return {eventId:ev.eventId,family:family,order:order.slice(),sections:order.filter(function(k){return counts[k]>0;}).map(function(k){return {key:k,label:LABEL[k],count:counts[k]};}),encounterGroups:ev.groups||{}};
  }
  return {project:project,families:Object.keys(FAMILY)};
}));
