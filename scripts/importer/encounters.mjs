// Conservative activity extraction: only published list entries with known exact identities.
// Narrative text remains prose. No substring species matching, costume guesses or blanket shiny boosts.
import {isAllowedOgImage} from '../../src/image-policy.js';
import {htmlToLines,decode} from './text.mjs';
import adapter from '../../public/event-adapter.js';
import contract from '../../public/event-contract.js';
const HEADS=[['wild',/^(?:wild encounters|in the wild|wild pok[eé]mon|wild spawns|spawns|rotating habitat hours)$/i],['raid',/^(?:(?:one|three|five|[135])-star |mega |shadow )?raids(?: encounters)?$/i],['max',/^(?:max battles|dynamax battles|gigantamax battles)$/i],['egg',/^(?:(?:2|5|7|10|12)\s*km )?eggs(?: hatches)?$/i],['incense',/^incense(?: encounters)?$/i],['lure',/^lure(?: encounters)?$/i],['research',/^research encounters$/i]];
export function methodForHeading(text){return HEADS.find(([,pattern])=>pattern.test(text))?.[0]||null;}
export function extractEncounters(input,{dex=[],names=[],costumes=[]}={}){
 adapter.configureSpecies(dex);adapter.configureCostumes(costumes);
 const known=new Map(dex.map(p=>[p[1].toLowerCase(),{name:p[1],speciesId:String(p[0])}]));
 names.forEach(name=>{if(typeof name==='string')known.set(name.toLowerCase(),{name});});
 costumes.forEach(p=>{if(p&&p.name&&p.label)known.set((p.name+' ('+p.label+')').toLowerCase(),{name:p.name,label:p.label,costume:true});});
 const pokemon=new Map(),encounters=[],lines=Array.isArray(input)?input:htmlToLines(input);let method=null,methodLevel=0;
 for(const line of lines){
  if(line.t==='h'){const next=methodForHeading(line.text);if(next){method=next;methodLevel=line.level||2;}else if(!line.level||line.level<=methodLevel){method=null;methodLevel=0;}continue;}
  if(!method||!['li','p'].includes(line.t))continue;
  for(const item of line.text.split(/,\s*|\s+and\s+/i)){
   let label=item.trim(),shiny='unknown',boostedShiny=null;
   const claim=/\s*\((shiny available|boosted shiny|increased shiny (?:chance|odds)|not shiny eligible)\)$/i.exec(label);
   if(claim){shiny=/not /i.test(claim[1])?'no':'yes';boostedShiny=/boosted|increased/i.test(claim[1])?true:null;label=label.slice(0,claim.index).trim();}
   const declared=known.get(label.toLowerCase());if(!declared)continue;
   const p=adapter.pokemon({...declared,shiny,boostedShiny}),prior=pokemon.get(p.key);
   pokemon.set(p.key,prior?{...prior,...p,shiny:p.shiny==='unknown'?prior.shiny:p.shiny}:p);
   encounters.push({identityKey:p.key,method,activityId:'main',access:'unknown'});
  }
 }
 return {pokemon:[...pokemon.values()],encounters};
}
export function mergeEncounters(results){
 const pokemon=new Map(),encounters=[],conflicts=[],disputed=new Set();
 for(const result of results){for(const p of result.fields?.eventEncounters?.pokemon||[]){const old=pokemon.get(p.key);if(old&&old.shiny!=='unknown'&&p.shiny!=='unknown'&&old.shiny!==p.shiny){pokemon.set(p.key,{...old,shiny:'unknown',boostedShiny:null});conflicts.push({field:'shiny',identityKey:p.key});disputed.add(p.key);}else pokemon.set(p.key,old?{...old,...p,shiny:p.shiny==='unknown'?old.shiny:p.shiny}:p);}encounters.push(...(result.fields?.eventEncounters?.encounters||[]));}
 disputed.forEach(key=>{const p=pokemon.get(key);pokemon.set(key,{...p,shiny:'unknown',boostedShiny:null});});
 // Validation and deduplication share the exact runtime contract.
 const normalized=contract.normalize({schemaVersion:1,eventId:'source-merge',title:'Source merge',pokemon:[...pokemon.values()],encounters});
 return {pokemon:normalized.pokemon,encounters:normalized.encounters,encounterConflicts:conflicts};
}
export function posterFromHtml(html,pageUrl){
 const tags=String(html).match(/<meta\b[^>]*>/gi)||[];
 for(const tag of tags){if(!/\b(?:property|name)\s*=\s*["']og:image["']/i.test(tag))continue;const m=/\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag);if(!m)continue;try{const url=new URL(decode(m[2]),pageUrl);if(isAllowedOgImage(url.href))return url.href;}catch{}}
 return null;
}
