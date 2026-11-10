// Conservative activity extraction: only published list entries with known exact identities.
// Narrative text remains prose. No substring species matching, costume guesses or blanket shiny boosts.
import {isAllowedOgImage} from '../../src/image-policy.js';
import {htmlToLines,decode} from './text.mjs';
import adapter from '../../public/event-adapter.js';
import contract from '../../public/event-contract.js';
const HEADS=[['wild',/^(?:wild encounters|in the wild|wild pok[eé]mon|wild spawns|spawns|rotating habitat hours)$/i],['raid',/^(?:(?:(?:one|two|three|four|five|[1-5])-star |mega |shadow )?raids(?: encounters)?|raid hour(?::.*)?)$/i],['max',/^(?:(?:(?:one|two|three|four|five|[1-5])-star )?(?:max|dynamax|gigantamax) battles(?::.*)?)$/i],['egg',/^(?:(?:2|5|7|10|12)\s*km )?eggs(?: hatches)?$/i],['incense',/^incense(?: encounters)?$/i],['lure',/^lure(?: encounters)?$/i],['research',/^research encounters$/i]];
export function methodForHeading(text){return HEADS.find(([,pattern])=>pattern.test(text))?.[0]||null;}
export function extractEncounters(input,{dex=[],names=[],costumes=[]}={}){
 adapter.configureSpecies(dex);adapter.configureCostumes(costumes);
 const known=new Map(dex.map(p=>[p[1].toLowerCase(),{name:p[1],speciesId:String(p[0])}]));
 // Supplementary artwork/reward names are candidate labels, not a new Dex.
 // The real importer includes every Dex name in this list: overwriting those
 // entries would discard speciesId, and exact Crowned/Dynamax names would
 // become truthy, untyped aliases that bypass the form-specific resolver.
 names.forEach(name=>{if(typeof name==='string'&&!known.has(name.toLowerCase()))known.set(name.toLowerCase(),{name});});
 costumes.forEach(p=>{if(p&&p.name&&p.label)[p.name+' ('+p.label+')',p.name+' wearing '+p.label,p.name+' wearing a '+p.label,p.name+' wearing an '+p.label,p.name+' wearing the '+p.label].forEach(k=>known.set(k.toLowerCase(),{name:p.name,label:p.label,costume:true}));});
 const speciesByDex=new Map(dex.map(p=>[Number(p[0]),p[1]]));
 const pokemon=new Map(),encounters=[],lines=Array.isArray(input)?input:htmlToLines(input);let method=null,methodLevel=0;
 for(const line of lines){
  if(line.t==='h'){const next=methodForHeading(line.text);if(next){method=next;methodLevel=line.level||2;}else if(!line.level||line.level<=methodLevel){method=null;methodLevel=0;}continue;}
  if(!method||!['li','p'].includes(line.t))continue;
  // Exact costume identities named by icon file (pm25.fGOFEST_2024_STIARA) + alt text win over any bare species name on the same line.
  const iconed=(line.icons||[]).map(ref=>({ref,species:speciesByDex.get(ref.dex)})).filter(x=>x.species&&x.ref.label);
  if(iconed.length){for(const {ref,species} of iconed){const p=adapter.pokemon({name:species,speciesId:String(ref.dex),costume:true,label:ref.label,collectionName:species+' ('+ref.label+')',shiny:'unknown',boostedShiny:null}),prior=pokemon.get(p.key);pokemon.set(p.key,prior?{...prior,...p}:p);encounters.push({identityKey:p.key,method,activityId:'main',access:'unknown'});}continue;}
  for(const item of line.text.split(/,\s*|\s+and\s+/i)){
   // Leek Duck rows append the stat card ("Registeel 100% IV CP Level 20 1398 Counters"): only the name is identity.
   let label=item.replace(/\s+\d+%\s*IV\s+CP\b.*$/i,'').replace(/\s+Counters$/i,'').trim(),shiny='unknown',boostedShiny=null;
   const claim=/\s*\((shiny available|boosted shiny|increased shiny (?:chance|odds)|not shiny eligible)\)$/i.exec(label);
   if(claim){shiny=/not /i.test(claim[1])?'no':'yes';boostedShiny=/boosted|increased/i.test(claim[1])?true:null;label=label.slice(0,claim.index).trim();}
   const candidate=known.get(label.toLowerCase());
   // An art-only alias lacks a species identity. Resolve its explicit form
   // against a real Dex base first; retain unknown aliases only as a final
   // conservative fallback after the declared form checks below.
   let declared=candidate&&candidate.speciesId?candidate:null;
   if(!declared){
    // "Zacian (Crowned Sword)": a published form of a known species is an exact identity (never a costume guess or a base-species substitute).
    const form=/^(.+?)\s+\(((?:crowned (?:sword|shield)|(?:altered|origin|incarnate|therian|attack|defense|speed|normal|sky|land|east|west|black|white)(?: forme?)?|alolan|galarian|hisuian|paldean))\)$/i.exec(label);
    const base=form&&known.get(form[1].toLowerCase());
    if(base&&base.speciesId&&!base.costume)declared={name:label,speciesId:base.speciesId};
    // Dynamax / Gigantamax rows name the species; the Max Battle heading is the evidence for the treatment.
    const dyn=/^(dynamax|gigantamax)\s+(.+)$/i.exec(label),dbase=dyn&&known.get(dyn[2].toLowerCase());
    if(!declared&&dbase&&dbase.speciesId&&!dbase.costume&&method==='max')declared={name:label,speciesId:dbase.speciesId};
   }
   if(!declared){
    // Published Crowned Sword Zacian / Crowned Shield Zamazenta names are
    // exact form identities, not ordinary Zacian or Zamazenta sprites.
    const crowned=/^Crowned (Sword|Shield) (Zacian|Zamazenta)$/i.exec(label);
    const base=crowned&&known.get(crowned[2].toLowerCase());
    if(base&&base.speciesId&&((crowned[1].toLowerCase()==='sword'&&crowned[2].toLowerCase()==='zacian')||(crowned[1].toLowerCase()==='shield'&&crowned[2].toLowerCase()==='zamazenta')))declared={name:label,speciesId:base.speciesId,formId:'crowned-'+crowned[1].toLowerCase(),collectionName:label};
   }
   if(!declared)declared=candidate||null;
   if(!declared)continue;
   if(method==='max'&&!declared.costume&&declared.speciesId&&!/^(?:dynamax|gigantamax)\b|\(/i.test(declared.name))declared={...declared,name:'Dynamax '+declared.name};
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

/** Restore only explicitly sourced, dated bosses from the curated activity schedule.
 *  The importer may flatten form labels from a publisher's icon markup;
 *  a verified Raid/Max Hour title remains the exact species/form evidence.
 *  Works for all events carrying the standard activity contract.
 */
export function reconcileActivityEncounters(existing, activities, options={}) {
 if (!Array.isArray(activities) || !activities.length) return existing;
 const rows=[];
 for (const activity of activities) {
  const kind=activity.kind;
  if (kind!=='raid-hour' && kind!=='max-battle-hour') continue;
  if (activity.schedule?.timeBasis!=='player-local' || !/^https:\/\//.test(activity.sourceUrl||'')) continue;
  const suffix=kind==='raid-hour'?'Raid Hour':'Max Battle Hour';
  const title=String(activity.title||'');
  if (!title.endsWith(' · '+suffix)) continue;
  const published=title.slice(0,-(' · '+suffix).length).trim();
  // Two bosses with a shared explicit Max variant: "Dynamax Latias & Latios".
  const duo=/^(Dynamax|Gigantamax) ([^&]+?)\s*&\s*([^&]+)$/i.exec(published);
  const names=duo?[duo[1]+' '+duo[2].trim(),duo[1]+' '+duo[3].trim()]:[published];
  rows.push({text:kind==='raid-hour'?'Raids':'Max Battles',t:'h',level:2});
  for(const name of names) rows.push({text:name,t:'li'});
 }
 if (!rows.length) return existing;
 const verified=extractEncounters(rows,options);
 if (!verified.encounters.length) return existing;
 const accepted=new Map(verified.pokemon.map(p=>[p.key,p]));
 const typed=new Set(verified.encounters.map(e=>{
  const p=accepted.get(e.identityKey);
  return p?e.method+'|'+p.speciesId:'';
 }).filter(Boolean));
 const existingPokemon=existing.pokemon||[],byKey=new Map(existingPokemon.map(p=>[p.key,p]));
 // A source icon marked an ordinary Regidrago as a Max encounter: replace it
 // only in the same method, never erase its possible ordinary wild/raid use.
 const retained=(existing.encounters||[]).filter(e=>{
  const p=byKey.get(e.identityKey);
  return !(p && !p.formId && typed.has(e.method+'|'+p.speciesId));
 });
 const used=new Set(retained.map(e=>e.identityKey));
 const pokemon=existingPokemon.filter(p=>used.has(p.key)||!(existing.encounters||[]).some(e=>e.identityKey===p.key));
 const rebuilt=mergeEncounters([
  {fields:{eventEncounters:{pokemon,encounters:retained}}},
  {fields:{eventEncounters:verified}}
 ]);
 return {...rebuilt,encounterConflicts:[...(existing.encounterConflicts||[]),...(rebuilt.encounterConflicts||[])]};
}

export function posterFromHtml(html,pageUrl){
 const tags=String(html).match(/<meta\b[^>]*>/gi)||[];
 for(const tag of tags){if(!/\b(?:property|name)\s*=\s*["']og:image["']/i.test(tag))continue;const m=/\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag);if(!m)continue;try{const url=new URL(decode(m[2]),pageUrl);if(isAllowedOgImage(url.href))return url.href;}catch{}}
 return null;
}
