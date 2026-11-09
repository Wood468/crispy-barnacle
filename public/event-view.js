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
  /* A research TASK is a parsed task (it has a task text). Source prose lines are not tasks, and neither are availability windows. */
  function researchTaskCount(list){return Array.isArray(list)?list.filter(function(r){return r&&typeof r.task==='string'&&r.task.trim();}).length:0;}
  function project(ev) {
    if(!ev||ev.schemaVersion!==1||!ev.eventId) throw Error('Normalized v1 event required');
    var family=FAMILY[ev.family]?ev.family:'other';
    var activities=Array.isArray(ev.activities)?ev.activities:[];
    // Ignore empty source placeholders: a section should only appear when it has content.
    function populated(value){return value!==null&&value!==undefined&&value!==''&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;}
    function taskCount(value){return researchTaskCount(value);}
    function countRecords(value){return Array.isArray(value)?value.filter(populated).length:0;}
    // Activity-only announcements may supply Pokémon through method references.
    // Deduplicate by full form/costume key across methods without changing ownership.
    var activityPokemon=Object.create(null);
    activities.forEach(function(a){
      if(!a||!Array.isArray(a.pokemonRefs))return;
      a.pokemonRefs.forEach(function(ref){
        if(typeof ref==='string'&&ref.trim())activityPokemon[ref]=true;
      });
    });
    var counts={
      overview:1,
      encounters:countRecords(ev.encounters)||Object.keys(activityPokemon).length,
      rotations:activities.filter(function(a){return a&&populated(a.schedule)&&a.presentation==='rotation';}).length,
      schedule:activities.filter(function(a){return a&&populated(a.schedule)&&a.presentation==='schedule';}).length,
      bonuses:countRecords(ev.bonuses),
      research:countRecords(ev.research)+activities.filter(function(a){return a&&populated(a.schedule)&&a.presentation==='research';}).length,
      passes:countRecords(ev.passes),
      tickets:countRecords(ev.tickets)+activities.filter(function(a){return a&&populated(a.schedule)&&a.presentation==='ticket';}).length
    };
    var preferred=FAMILY[family], all=FAMILY.other;
    // A family guides order but never suppresses sections actually present.
    var order=preferred.concat(all.filter(function(k){return preferred.indexOf(k)<0;}));
    return {eventId:ev.eventId,family:family,order:order.slice(),researchTasks:taskCount(ev.research),sections:order.filter(function(k){return counts[k]>0;}).map(function(k){return {key:k,label:LABEL[k],count:counts[k]};}),encounterGroups:ev.groups||{}};
  }
  return {project:project,researchTaskCount:researchTaskCount,families:Object.keys(FAMILY)};
}));
