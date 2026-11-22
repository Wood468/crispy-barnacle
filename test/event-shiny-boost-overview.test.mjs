import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../public/event-contract.js');
const UI=require('../public/event-components.js');
const Clock=require('../public/event-clock.js');
const sources=[{name:'Pokémon GO',url:'https://pokemongo.com/en/news/future-event'}];
const event=(props={})=>C.normalize({schemaVersion:1,eventId:'future-shiny-test',title:'Future event',sources,...props});
const preview=model=>UI.shinyBoostOverview(model,{clock:Clock,viewerZone:'Australia/Melbourne'});

test('explicit Pokémon boost is prominent on Overview, without inventing odds or a main-event boost window',()=>{
 const boosted={speciesId:'25',name:'Pikachu',shiny:'yes',boostedShiny:true};
 const normal={speciesId:'133',name:'Eevee',shiny:'yes'};
 const key=C.identity(boosted);
 const model=event({pokemon:[normal,boosted],activities:[{
  id:'ticket-hour',kind:'wild',title:'Ticket hour',encounterMethod:'wild',access:'Ticket holders',
  pokemonRefs:[key],schedule:{timeBasis:'instant',start:'2027-01-03T05:00:00Z',end:'2027-01-03T06:00:00Z'}
 }]});
 const html=UI.render(model,{clock:Clock,viewerZone:'Australia/Melbourne'});
 const overview=html.slice(html.indexOf('class="ue-overview"'),html.indexOf('id="evd-s-encounters"'));
 assert.match(overview,/class="ue-shiny-overview"/);
 assert.match(overview,/<h3>Shiny boosts<\/h3>/);
 assert.match(overview,/Pikachu/);
 assert.match(overview,/↑✦ Boosted shiny/);
 assert.match(overview,/Ticket holders/);
 assert.match(overview,/Time: /);
 assert.match(overview,/your time/);
 assert.doesNotMatch(overview,/>Eevee</);
 assert.doesNotMatch(overview,/\b1\/\d+\b|odds are \d+/);
 assert.ok(overview.indexOf('Shiny boosts')<overview.indexOf('Event schedule'),'boost appears before longer event information');
});

test('ordinary shiny, shiny artwork and generic notes do not imply boosted odds',()=>{
 const model=event({
  pokemon:[{speciesId:'25',name:'Pikachu',shiny:'yes',boostedShiny:false}],
  notes:['Pikachu is available as Shiny.','Shiny odds are better in another event.']
 });
 assert.equal(preview(model),'');
 assert.doesNotMatch(UI.render(model,{}),/class="ue-shiny-overview"/);
});

test('official source statements show exact ticket conditions without pretending to identify affected Pokémon',()=>{
 const statement='Ticket holders have an increased chance of encountering Shiny Pokémon during event hours.';
 const model=event({internalValidation:{fields:{shiny:[{text:statement,status:'official',sources:['official']}]}}});
 const html=preview(model);
 assert.match(html,/Shiny boosts/);
 assert.match(html,/Published boost conditions/);
 assert.match(html,/Ticket holders have an increased chance/);
 assert.doesNotMatch(html,/ue-shiny-species-title|Pikachu|Eevee/);
 assert.doesNotMatch(html,/\b1\/\d+\b/);
});

test('published bonus prose with explicit increased shiny odds is shown; mere shiny eligibility is not',()=>{
 const boost='Increased chance of encountering Shiny Pokémon when using Incense.';
 const model=event({bonuses:[boost,'Shiny Meltan may be encountered from the Mystery Box.']});
 const html=preview(model);
 assert.match(html,/Increased chance of encountering Shiny Pokémon when using Incense/);
 assert.doesNotMatch(html,/Shiny Meltan may be encountered/);
});

test('weak, negated, conflicting or unsourced boost signals fail closed',()=>{
 const pokemon={speciesId:'25',name:'Pikachu',boostedShiny:true},key=C.identity(pokemon);
 const official={text:'Increased chance of encountering Shiny Pokémon.',status:'official'};
 const unconfirmed={text:'Increased chance of encountering Shiny Pokémon.',status:'community'};
 assert.equal(preview(event({pokemon:[pokemon],sources:[]})),'');
 assert.equal(preview(event({pokemon:[pokemon],sources:[{url:'http://example.test/event'}]})),'');
 assert.equal(preview(event({internalValidation:{fields:{shiny:[unconfirmed]}}})),'');
 assert.equal(preview(event({internalValidation:{fields:{shiny:[{text:'No increased chance of encountering Shiny Pokémon.',status:'official'}]}}})),'');
 assert.equal(preview(event({pokemon:[pokemon],internalValidation:{conflicts:[{field:'shiny',identityKey:key}]}})),'');
 assert.equal(preview(event({internalValidation:{fields:{shiny:[official]},conflicts:[{field:'shiny'}]}})),'');
});

test('access and activity time display only when attached to that Pokémon encounter',()=>{
 const boosted={speciesId:'25',name:'Pikachu',boostedShiny:true},key=C.identity(boosted);
 const model=event({
  pokemon:[boosted],schedule:{timeBasis:'instant',start:'2027-01-01T09:00:00Z',end:'2027-01-08T09:00:00Z'},
  encounters:[{identityKey:key,method:'raid'}],
  activities:[{id:'unrelated-ticket',kind:'wild',title:'Ticket hour',access:'Ticket holders',
   schedule:{timeBasis:'instant',start:'2027-01-03T05:00:00Z',end:'2027-01-03T06:00:00Z'}}]
 });
 const html=preview(model);
 assert.match(html,/Raid encounters/);
 assert.doesNotMatch(html,/Ticket holders|Time:/);
});

test('an explicit boost display escapes untrusted names, access and source prose',()=>{
 const pokemon={speciesId:'25',name:'Pikachu <script>',boostedShiny:true},key=C.identity(pokemon);
 const html=preview(event({pokemon:[pokemon],encounters:[{identityKey:key,method:'wild',access:'Ticket <img>'}],bonuses:['Increased chance of encountering Shiny Pokémon <img src=x>.']}));
 assert.match(html,/Pikachu &lt;script&gt;/);
 assert.match(html,/Ticket &lt;img&gt;/);
 assert.match(html,/&lt;img src=x&gt;/);
 assert.doesNotMatch(html,/<script>|<img src=x>/);
});
