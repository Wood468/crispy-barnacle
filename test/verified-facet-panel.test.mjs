import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {verifiedFacetPanelsForEvent} from '../scripts/importer/source-facet-event-view-bridge.mjs';
const require=createRequire(import.meta.url);
const {render}=require('../public/verified-facet-panel.js');

const ref={sourceId:'official',url:'https://pokemongo.com/news/synthetic/',section:'Ticket perks'};
const facet=(id,access='free')=>({id,access,status:'source-claimed',label:id,sourceRefs:[ref]});
function feed(){
  return {schemaVersion:1,publication:'verified-feed',events:[{
    eventId:'wag',verifiedAt:'2026-11-13T04:00:00.000Z',
    reviewFingerprint:'a'.repeat(64),
    benefits:[facet('free-bonus'),facet('ticket-bonus','ticket')],
    featuredMoves:[{id:'move',status:'source-claimed',access:'ticket',
      pokemonLabel:'Synthetic Pokémon',move:'New Attack',
      acquisitionMethods:['evolve'],sourceRefs:[ref]}],
    researchPrograms:[{id:'story',status:'source-claimed',access:'ticket',
      kind:'special',title:'Synthetic Story',
      steps:[{step:1,outOf:6,title:'Stage 1',taskRewardEvidence:'not-extracted'}],
      sourceRefs:[ref]}]
  }]};
}
test('existing signed feed bridge produces accessible, access-labelled source sections',()=>{
  const panels=verifiedFacetPanelsForEvent(feed(),'wag');
  // The renderer supports reviewed add-on access even while a separate
  // hardening PR upgrades the importer bridge to recognize that source type.
  panels.bonuses.push({id:'extra',text:'Synthetic add-on',access:'addon',
    status:'verified',sourceRefs:[ref]});
  const output=render(panels,'wag');
  assert.match(output,/Verified source details/);
  assert.match(output,/Free/);
  assert.match(output,/Ticket holders/);
  assert.match(output,/Paid add-on/);
  assert.match(output,/Synthetic Pokémon — New Attack/);
  assert.match(output,/Method: evolve/);
  assert.match(output,/Stage 1 of 6/);
  assert.match(output,/tasks and rewards have not been verified/);
  assert.match(output,/rel="noopener noreferrer"/);
  assert.ok(!output.includes('track-control'));
  assert.ok(!output.includes('follow-control'));
});
test('exact canonical ID mismatch and incomplete data are never displayed',()=>{
  const panels=verifiedFacetPanelsForEvent(feed(),'wag');
  assert.equal(render(panels,'into'),'');
  assert.equal(render({...panels,reviewFingerprint:'not-a-digest'},'wag'),'');
  assert.equal(render(null,'wag'),'');
  assert.equal(render({...panels,bonuses:[],featuredMoves:[],research:[]},'wag'),'');
});
test('untrusted text is escaped and unapproved source URLs cannot become links',()=>{
  const panels=verifiedFacetPanelsForEvent(feed(),'wag');
  panels.bonuses[0].text='<img src=x onerror=alert(1)>';
  panels.bonuses[0].sourceRefs[0].url='https://pokemongo.com:444/news/synthetic/';
  let html=render(panels,'wag');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('onerror='));
  assert.ok(!html.includes('pokemongo.com:444'));
  assert.ok(html.includes('ticket-bonus'));
  panels.bonuses[1].text='<script>alert(1)</script>';
  html=render(panels,'wag');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
test('research stages are not inferred as task or reward lists',()=>{
  const panels=verifiedFacetPanelsForEvent(feed(),'wag');
  panels.research[0].steps=[{step:1,outOf:6,title:'Fake verified',taskRewardEvidence:'unverified'}];
  const html=render(panels,'wag');
  assert.ok(!html.includes('Fake verified'));
  assert.ok(!html.includes('Stage 1 of 6'));
  assert.ok(!html.includes('reward-details'));
});
