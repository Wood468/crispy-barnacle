import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEventSourceFacets} from '../scripts/importer/source-facets.mjs';

const globalHtml = [
  '<main>',
  '<h2>Bonuses</h2>',
  '<h3>Bonuses for All Trainers</h3>',
  '<p>The following bonuses apply from 10:00 a.m. to 6:00 p.m. local time on both event days.</p>',
  '<img alt="Up to 3 free Raid Passes per day from Gyms">',
  '<h2>Additional Ticket Holder Bonuses</h2>',
  '<p>These benefits apply from 10:00 a.m. to 6:00 p.m. local time on both event days. The ticketed Raid Pass and Max Particle limits replace the free limits.</p>',
  '<img alt="Up to 6 free Raid Passes per day from Gyms">',
  '<img alt="Daily Max Particle collection limit increased to 3,200">',
  '<img alt="Increased chance to encounter Shiny Pokémon*">',
  '<p>Up to 6 free Raid Passes per day from Gyms</p>',
  '<h3>Trading Bonuses</h3>',
  '<p>Ticket holders receive these benefits from 12:00 a.m. to 11:59 p.m. local time on both event days.</p>',
  '<img alt="Up to 6 Special Trades per day">',
  '<img alt="1/2 Stardust cost for trades">',
  '<h2>Research</h2>',
  '<h3>Special Research — Ticket Holders</h3>',
  '<p>Claim event Special Research beginning November 14, 2026 at 10:00 a.m. local time.</p>',
  '<p>Choose a Steel-type or Dragon-type path; your choice determines bonuses.</p>',
  '<p>Earn a special medal and an avatar pose on completion.</p>',
  '<h4>Test research step (1/6)</h4>',
  '<h4>Test research step (2/6)</h4>',
  '<h3>Field Research</h3>',
  '<p>Some rewards are not yet announced.</p>',
  '<h2>Moves</h2>',
  '<p>Certain Pokémon caught or evolved during the event learn featured attacks.</p>',
  '<h4>Flygon</h4><div><span>Earth Power Charged Attack</span></div>',
  '<h4>Modern Jacket Machamp</h4><div><span>Karate Chop Fast Attack</span></div>',
  '<h2>Sales</h2>',
  '</main>'
].join('\n');

test('source bonus groups preserve free versus ticket access, hours, overrides and deduplication',()=>{
  const data=extractEventSourceFacets(globalHtml,{sourceUrl:'https://leekduck.com/events/synthetic/'});
  assert.equal(data.schemaVersion,1);
  assert.equal(data.benefits.length,6);
  const free=data.benefits.find(x=>x.label.startsWith('Up to 3'));
  const paid=data.benefits.find(x=>x.label.startsWith('Up to 6 free'));
  const particles=data.benefits.find(x=>x.kind==='max-particles');
  const trade=data.benefits.find(x=>x.kind==='trading'&&/Special Trades/i.test(x.label));
  assert.equal(free.access,'free');
  assert.equal(free.replacesFreeLimit,false);
  assert.equal(paid.access,'ticket');
  assert.equal(paid.replacesFreeLimit,true);
  assert.equal(particles.replacesFreeLimit,true);
  assert.equal(paid.dayScope,'both-event-days');
  assert.match(paid.windowText,/10:00 a.m. to 6:00 p.m./);
  assert.equal(trade.access,'ticket');
  assert.match(trade.windowText,/12:00 a.m. to 11:59 p.m./);
  assert.equal(trade.source.url,'https://leekduck.com/events/synthetic/');
  assert.equal(data.benefits.filter(x=>x.label===paid.label).length,1);
});

test('special research retains ticket eligibility, explicit path choices and stage labels, not guessed rewards',()=>{
  const data=extractEventSourceFacets(globalHtml,{sourceUrl:'https://leekduck.com/events/synthetic/'});
  const special=data.researchPrograms.find(x=>x.kind==='special');
  const field=data.researchPrograms.find(x=>x.kind==='field');
  assert.equal(special.access,'ticket');
  assert.deepEqual(special.paths,['Steel-type','Dragon-type']);
  assert.deepEqual(special.steps.map(s=>s.step),[1,2]);
  assert.equal(special.steps[0].outOf,6);
  assert.equal(special.steps[0].taskRewardEvidence,'not-extracted');
  assert.equal(field.access,'unknown');
  assert.deepEqual(field.paths,[]);
});

test('featured move tiles preserve explicit species label and Fast/Charged without invented acquisition',()=>{
  const d=extractEventSourceFacets(globalHtml,{sourceUrl:'https://leekduck.com/events/synthetic/'});
  assert.equal(d.featuredMoves.length,2);
  const fly=d.featuredMoves.find(x=>x.pokemonLabel==='Flygon');
  assert.equal(fly.move,'Earth Power');
  assert.equal(fly.moveKind,'charged');
  assert.deepEqual(fly.acquisitionMethods,['unknown']);
  assert.equal(fly.access,'unknown');
  assert.deepEqual(d.featuredMoves.find(x=>x.pokemonLabel==='Modern Jacket Machamp').acquisitionMethods,['unknown']);
});

test('in-person, ticket-exclusive featured moves can be extracted from explicit prose without per-Pokémon tiles',()=>{
  const html='<main><h2>Featured attacks for in-person GO Fest catches</h2>'+
    '<p>All Mewtwo caught during in-person GO Fest events by ticket holders will know the Fast Attack Counter and Charged Attack Psystrike.</p>'+
    '<p>Only ticket holders can catch Mewtwo with featured attacks.</p><h2>Spawns</h2></main>';
  const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-fest/'});
  assert.deepEqual(d.featuredMoves.map(x=>[x.pokemonLabel,x.move,x.moveKind,x.access]),[
    ['Mewtwo','Counter','fast','ticket'],['Mewtwo','Psystrike','charged','ticket']
  ]);
});

test('in-person ticketed-day bonus and research once-only rule remain distinct from global event hours',()=>{
  const html='<main><h2>Bonuses</h2><h3>Ticket Holder Bonuses</h3>'+
    '<p>The following bonuses apply from 10:00 a.m. to 6:00 p.m. local time on your ticketed event day.</p>'+
    '<img alt="1/2 Hatch Distance for Eggs placed in Incubators during the event">'+
    '<h2>Research</h2><h3>Special Research — Ticket Holders</h3>'+
    '<p>Special Research is granted only once, even with Extra Day add-ons.</p>'+
    '<h4>Synthetic research (1/3)</h4><h2>Sales</h2></main>';
  const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-city/'});
  assert.equal(d.benefits.length,1);
  assert.equal(d.benefits[0].dayScope,'ticketed-day');
  assert.equal(d.benefits[0].kind,'eggs');
  assert.equal(d.researchPrograms[0].onceOnly,true);
});

test('unconfirmed research is labelled unconfirmed; unavailable facts are not invented',()=>{
  const html='<main><h2>Research</h2><h3>Timed Research — Ticket Holders</h3>'+
    '<p>This Timed Research is not confirmed. It is based on previous event editions.</p>'+
    '<h2>Moves</h2><p>Some moves might be announced later.</p></main>';
  const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/preview/'});
  assert.equal(d.researchPrograms[0].status,'unconfirmed');
  assert.deepEqual(d.researchPrograms[0].steps,[]);
  assert.deepEqual(d.featuredMoves,[]);
  assert.deepEqual(d.benefits,[]);
});

test('source URL is required; empty or invalid input is rejected without constructing identities',()=>{
  assert.throws(()=>extractEventSourceFacets(''),/HTML source/);
  assert.throws(()=>extractEventSourceFacets('<main></main>',{sourceUrl:'http://invalid.example/a'}),/HTTPS source/);
});

test('LeekDuck move-art icon labels yield correct types without concatenated type prefixes',()=>{
  const html='<main><h2>Moves</h2><h2>Featured Attacks</h2>'+
    '<h4>Venusaur</h4><p>Evolve Ivysaur to get Venusaur with its featured attack; Venusaur can also be caught after Mega Raids.</p>'+
    '<img alt="GrassFrenzy Plant Charged Attack">'+
    '<h4>Tyranitar</h4><p>Evolve Pupitar to get Tyranitar with its featured attack.</p>'+
    '<img alt="RockSmack Down Fast Attack"></main>';
  const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-kalos/'});
  assert.deepEqual(d.featuredMoves.map(m=>[m.pokemonLabel,m.move,m.moveKind]),[
    ['Venusaur','Frenzy Plant','charged'],['Tyranitar','Smack Down','fast']
  ]);
  assert.deepEqual(d.featuredMoves[0].acquisitionMethods,['evolve','catch','raid']);
  assert.deepEqual(d.featuredMoves[1].acquisitionMethods,['evolve']);
});

test('Kalos X/Y branching options are recorded only from an explicit choice',()=>{
  const html='<main><h2>Research</h2><h3>Special Research (Ticket Holder Exclusive)</h3>'+
    '<p>Choose between two Special Research paths: X Version and Y Version.</p>'+
    '<div>Part 1 of the story (1/6)</div><div>Part 2 of the story (2/6)</div></main>';
  const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-kalos/'});
  assert.equal(d.researchPrograms[0].kind,'special');
  assert.equal(d.researchPrograms[0].access,'ticket');
  assert.deepEqual(d.researchPrograms[0].paths,['X Version','Y Version']);
  assert.deepEqual(d.researchPrograms[0].steps.map(x=>x.step),[1,2]);
  assert.ok(d.researchPrograms[0].steps.every(x=>x.taskRewardEvidence==='not-extracted'));
});

test('paid add-on benefits retain add-on identity and do not leak into the base ticket',()=>{
  const html='<main><h2>Add-ons</h2>'+
    '<h3>Raid Lover — MXN$200</h3>'+
    '<img alt="Up to 18 free Raid Passes per day from Gyms">'+
    '<img alt="6 additional Candy for catching Pokémon in raids">'+
    '<h3>Egg-thusiast — MXN$200</h3>'+
    '<img alt="1/4 Egg Hatch Distance">'+
    '<img alt="3× Hatch Stardust"></main>';
  const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-mexico/'});
  assert.equal(d.benefits.length,4);
  assert.ok(d.benefits.every(x=>x.access==='addon'));
  assert.equal(d.benefits[0].addonLabel,'Raid Lover — MXN$200');
  assert.equal(d.benefits[2].addonLabel,'Egg-thusiast — MXN$200');
  assert.equal(d.benefits[2].replacesFreeLimit,false);
});

test('source-caveated Safari Ball substitution never becomes a verified entitlement',()=>{
  const html='<main><h2>Additional Ticket Holder Bonuses</h2>'+
    '<img alt="GO Safari Balls instead of Premier Balls for raids and Max Battles***">'+
    '<p>***This behavior is not yet confirmed by the official source.</p></main>';
  const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-global/'});
  assert.equal(d.benefits.length,1);
  assert.equal(d.benefits[0].kind,'safari-balls');
  assert.equal(d.benefits[0].status,'unconfirmed');
  assert.equal(d.benefits[0].access,'ticket');
});

test('Kalos-style General Bonuses use explicit All Trainers entitlement and include CP boosts',()=>{
  const html='<main><h2>Bonuses</h2><h2>General Bonuses</h2>'+
    '<p>All Trainers will receive the following bonuses between 10:00 a.m. and 6:00 p.m. local time on event days.</p>'+
    '<img alt="Mega-Evolved Pokémon will receive a CP boost">'+
    '<img alt="1/2 Hatch Distance for Eggs placed in Incubators during the event">'+
    '<h2>Ticket Holder Exclusive Bonuses</h2>'+
    '<p>Ticket holders will receive the following bonuses between 12:00 a.m. and 11:59 p.m. local time on event days.</p>'+
    '<img alt="Increased chance of encountering Shiny Pokémon"></main>';
  const x=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-kalos-global/'});
  const free=x.benefits.filter(b=>b.access==='free'), paid=x.benefits.filter(b=>b.access==='ticket');
  assert.equal(free.length,2);
  assert.ok(free.some(b=>b.label.includes('CP boost')));
  assert.ok(free.some(b=>b.kind==='eggs'));
  assert.equal(paid.length,1);
  assert.match(free[0].windowText,/10:00 a.m./);
  assert.match(paid[0].windowText,/12:00 a.m./);
});

test('Generic bonus headings with no published audience do not grant free access',()=>{
  const html='<main><h2>General Bonuses</h2>'+
    '<p>More information will be released soon.</p>'+
    '<img alt="Increased chance of encountering Shiny Pokémon"></main>';
  const x=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-unannounced/'});
  assert.deepEqual(x.benefits,[]);
});

test('ticketed replacement caps retain the exact source excerpt and do not apply to trading',()=>{
  const html='<main><h2>Additional Ticket Holder Bonuses</h2>'+
    '<p>The ticketed Raid Pass and Max Particle limits replace the free limits.</p>'+
    '<img alt="Up to six free Raid Passes each day">'+
    '<img alt="Daily Max Particle limit increased to 3,200">'+
    '<h3>Trading Bonuses</h3>'+
    '<p>Ticket holders have more trades between 12:00 a.m. and 11:59 p.m.</p>'+
    '<img alt="Up to six Special Trades per day"></main>';
  const result=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-global/'});
  assert.equal(result.benefits.length,3);
  const passes=result.benefits.find(x=>x.kind==='raid-passes');
  const particles=result.benefits.find(x=>x.kind==='max-particles');
  const trade=result.benefits.find(x=>x.kind==='trading');
  assert.equal(passes.replacesFreeLimit,true);
  assert.equal(particles.replacesFreeLimit,true);
  assert.match(passes.replacementEvidence,/limits replace the free limits/);
  assert.match(particles.replacementEvidence,/limits replace the free limits/);
  assert.equal(trade.replacementEvidence,null);
  assert.equal(trade.replacesFreeLimit,false);
});

test('ticket cap amounts alone are not evidence that they replace free limits',()=>{
  const html='<main><h2>Additional Ticket Holder Bonuses</h2>'+
    '<img alt="Up to six free Raid Passes per day from Gyms"></main>';
  const result=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic/'});
  assert.equal(result.benefits.length,1);
  assert.equal(result.benefits[0].replacesFreeLimit,false);
  assert.equal(result.benefits[0].replacementEvidence,null);
});

test('speculative replacement prose cannot establish a paid-ticket override',()=>{
  const html='<main><h2>Additional Ticket Holder Bonuses</h2>'+
    '<p>Ticketed Raid Pass limits replace the free limits; not yet confirmed.</p>'+
    '<img alt="Up to six free Raid Passes per day from Gyms"></main>';
  const result=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic/'});
  assert.equal(result.benefits.length,1);
  assert.equal(result.benefits[0].replacesFreeLimit,false);
  assert.equal(result.benefits[0].replacementEvidence,null);
});

test('ticket Special Research keeps separately titled six-step story without inventing tasks',()=>{
 const story=['<main><h2>Research</h2>',
   '<h2>Special Research — Ticket Holders</h2>',
   '<h2>GO Wild Area: Mexico City – The Suspense Is Building</h2>',
   '<p>Event-exclusive Special Research rewards include a Gigantamax Duraludon encounter with a Location Background.</p>',
   '<p>Claim Special Research during your ticketed session. Special Research is granted only once, even with Extra Day add-ons.</p>',
   ...Array.from({length:6},(_,i)=>'<div class="stage">STEP '+(i+1)+'<div>GO Wild Area: Mexico City – The Suspense Is Building ('+(i+1)+'/6)</div></div>'),
   '<ul><li>Steel Scholar medal: Earn 1 additional Candy XL for catching Steel-type mighty Pokémon.</li>',
   '<li>Dragon Defender medal: Earn 1,000 additional Stardust for catching Dragon-type mighty Pokémon.</li></ul>',
   '<p>Each medal’s bonuses begin when you claim its medal and last until November 15, 2026, at 6:00 p.m. local time.</p>',
   '<p>Completing the event Special Research also awards a new avatar pose.</p>',
   '<h2>GO Stamp Rally</h2><p>Extra days do not grant a second rally.</p>',
   '<h2>Steel- and Dragon-Type Timed Research</h2>',
   '<p>Extra Day add-ons grant both Timed Research experiences again on each added day.</p>',
   '<p>Complete the tasks and claim rewards before 8:00 p.m. local time that day.</p>',
   '<h2>Field Research</h2><p>Find tasks and Pokémon encounters.</p></main>'].join('\n');
 const d=extractEventSourceFacets(story,{sourceUrl:'https://leekduck.com/events/synthetic-mexico-city/'});
 const special=d.researchPrograms.find(x=>x.kind==='special');
 const timed=d.researchPrograms.find(x=>x.kind==='timed');
 assert.equal(special.access,'ticket');
 assert.equal(special.storyTitle,'GO Wild Area: Mexico City – The Suspense Is Building');
 assert.deepEqual(special.steps.map(x=>x.step),[1,2,3,4,5,6]);
 assert.ok(special.steps.every(x=>x.outOf===6&&x.taskRewardEvidence==='not-extracted'));
 assert.equal(special.onceOnly,true);
 assert.equal(special.medalEffects.length,2);
 assert.equal(special.medalEffects[0].medalLabel,'Steel Scholar medal');
 assert.equal(special.medalEffects[1].medalLabel,'Dragon Defender medal');
 assert.match(special.bonusActivationText,/bonuses begin when you claim/);
 assert.match(special.completionRewardText,/new avatar pose/);
 assert.equal(timed.onceOnly,false);
 assert.match(timed.completionDeadlineText,/before 8:00 p.m./);
 assert.equal(d.researchPrograms.length,3);
});

test('Global ticket research keeps claim instructions, separate medal bonuses and path choices',()=>{
 const html='<main><h2>Research</h2><h2>Special Research — Ticket Holders</h2>'+
   '<p>Claim the event Special Research beginning November 14, 2026, at 10:00 a.m. local time. Choose a Steel-type or Dragon-type path.</p>'+
   '<ul><li>Steel Scholar medal: Earn 1 additional Candy XL for catching Steel-type mighty Pokémon.</li>'+
   '<li>Dragon Defender medal: Earn 1,000 additional Stardust for catching Dragon-type mighty Pokémon.</li></ul>'+
   '<p>Your chosen path’s bonuses begin when you claim its medal and last until November 15, 2026, at 6:00 p.m. local time.</p>'+
   '<p>Completing the event Special Research also awards a new avatar pose.</p>'+
   '<h2>Field Research</h2><p>Tasks and rewards have not yet been announced.</p></main>';
 const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-global/'});
 const special=d.researchPrograms.find(x=>x.kind==='special');
 assert.deepEqual(special.paths,['Steel-type','Dragon-type']);
 assert.match(special.claimInstructionsText,/November 14, 2026/);
 assert.equal(special.medalEffects.length,2);
 assert.ok(special.bonusActivationText.includes('claim its medal'));
 assert.equal(special.steps.length,0);
 assert.ok(!JSON.stringify(special).includes('unverified stage reward'));
});

test('detached unrelated stage lists cannot be adopted as paid Special Research',()=>{
 const html='<main><h2>Special Research — Ticket Holders</h2>'+
   '<p>More details will be announced.</p>'+
   '<h2>GO Stamp Rally</h2><p>Special Research previews may appear later.</p>'+
   '<div>GO Stamp Rally (1/6) with six checkpoints</div>'+
   '<h2>Field Research</h2><p>Research tasks not published.</p></main>';
 const d=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-preview/'});
 assert.equal(d.researchPrograms.find(x=>x.kind==='special').steps.length,0);
 assert.equal(d.researchPrograms.find(x=>x.kind==='special').storyTitle,null);
});

test('featured attack windows are scoped to the explicit Pokémon row, not inherited across sessions',()=>{
  const html='<main><h2>Moves</h2>'+
    '<p>Event hours are 10:00 a.m. to 6:00 p.m. on both days.</p>'+
    '<h3>Dragonite</h3>'+
    '<p>On Saturday from 10:00 a.m. to 6:00 p.m., Dragonite caught in raids can learn this featured move.</p>'+
    '<img alt="Dragon Claw Charged Attack">'+
    '<h3>Flygon</h3>'+
    '<p>Flygon can learn its featured move when evolved during the event.</p>'+
    '<img alt="Earth Power Charged Attack">'+
    '<h3>Garchomp</h3>'+
    '<p>On Sunday from 10:00 a.m. to 6:00 p.m., Garchomp caught in raids can learn its featured move.</p>'+
    '<img alt="Earth Power Charged Attack"></main>';
  const data=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-move-hours/'});
  assert.equal(data.featuredMoves.length,3);
  const byName=Object.fromEntries(data.featuredMoves.map(x=>[x.pokemonLabel,x]));
  assert.equal(byName.Dragonite.sessionLabel,'Saturday');
  assert.match(byName.Dragonite.windowText,/Saturday from 10:00 a.m./);
  assert.equal(byName.Garchomp.sessionLabel,'Sunday');
  assert.match(byName.Garchomp.windowText,/Sunday from 10:00 a.m./);
  assert.equal(byName.Flygon.sessionLabel,null);
  assert.equal(byName.Flygon.windowText,null);
  assert.equal(byName.Flygon.dayScope,null);
});

test('ticketed-day move timing only survives when row source explicitly states it',()=>{
  const html='<main><h2>Featured Attacks</h2>'+
    '<h3>Dragonite</h3>'+
    '<p>During your ticketed event day from 10:00 a.m. to 6:00 p.m., Dragonite caught in raids can learn the attack.</p>'+
    '<img alt="Dragon Claw Charged Attack">'+
    '<h3>Flygon</h3>'+
    '<p>Flygon can learn this move when caught.</p>'+
    '<img alt="Earth Power Charged Attack"></main>';
  const data=extractEventSourceFacets(html,{sourceUrl:'https://leekduck.com/events/synthetic-ticket-moves/'});
  const dragonite=data.featuredMoves.find(x=>x.pokemonLabel==='Dragonite');
  const flygon=data.featuredMoves.find(x=>x.pokemonLabel==='Flygon');
  assert.equal(dragonite.dayScope,'ticketed-day');
  assert.match(dragonite.windowText,/ticketed event day/);
  assert.equal(dragonite.sessionLabel,null);
  assert.equal(flygon.dayScope,null);
  assert.equal(flygon.windowText,null);
});
