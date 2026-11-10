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
 names.forEach(name=>{if(typeof name==='string')known.set(name.toLowerCase(),{name});});
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
   let declared=known.get(label.toLowerCase());
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
    if(base&&base.speciesId&&((crowned[1].toLowerCase()==='sword'&&crowned[2].toLowerCase()==='zacian')||(crowned[1].toLowerCase()==='shield'&&crowned[2].toLowerCase()==='zamazenta')))declared={name:label,speciesId:base.speciesId};
   }
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
export function posterFromHtml(html,pageUrl){
 const tags=String(html).match(/<meta\b[^>]*>/gi)||[];
 for(const tag of tags){if(!/\b(?:property|name)\s*=\s*["']og:image["']/i.test(tag))continue;const m=/\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag);if(!m)continue;try{const url=new URL(decode(m[2]),pageUrl);if(isAllowedOgImage(url.href))return url.href;}catch{}}
 return null;
}
