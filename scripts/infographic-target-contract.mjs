/*
 * Owner-reviewed infographic targets independent of event schedules.
 *
 * Do not infer Pokémon forms from captions. Selection is explicit and can
 * refer to a persistent raid boss (including Max/Shadow forms) without an
 * associated event or active rotation. This module stores identifiers only:
 * it does not publish or approve images.
 */
const ID=/^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const POKEMON_ID=/^[a-z0-9][a-z0-9._-]{0,79}$/i;
const MODES=new Set(['normal','shadow','dynamax','gigantamax','mega','primal']);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const key=target=>target.type==='event'?
  'event:'+target.eventId:
  'raid-boss:'+target.pokemonId+':'+target.formId+':'+target.battleMode;
function normalizeOne(target){
  if(!plain(target))throw new TypeError('Infographic attachment must be an object');
  if(target.type==='event'){
    if(!ID.test(target.eventId||'')||Object.keys(target).some(k=>!['type','eventId'].includes(k)))
      throw new TypeError('Exact canonical event ID required');
    return {type:'event',eventId:target.eventId};
  }
  if(target.type==='raid-boss'){
    const formId=target.formId??null;
    if(!POKEMON_ID.test(target.pokemonId||'')||
       (formId!==null&&!POKEMON_ID.test(formId))||
       !MODES.has(target.battleMode)||
       Object.keys(target).some(k=>!['type','pokemonId','formId','battleMode'].includes(k)))
      throw new TypeError('Explicit canonical Pokémon, form and battle mode required');
    return {type:'raid-boss',pokemonId:target.pokemonId,
      formId,battleMode:target.battleMode};
  }
  throw new TypeError('Unknown infographic target type');
}
/**
 * Canonical immutable-ish representation of explicit admin choices.
 * Exact form/mode matching prevents normal raid guides from being shown as
 * Shadow/Dynamax/Gigantamax guides.
 */
export function normalizeInfographicTargets(targets){
  if(!Array.isArray(targets)||targets.length>30)
    throw new TypeError('Bounded infographic target list required');
  const result=new Map();
  for(const target of targets){
    const normalized=normalizeOne(target);
    result.set(key(normalized),normalized);
  }
  return [...result.values()].sort((a,b)=>key(a).localeCompare(key(b)));
}
/**
 * Backward-compatible migration for the existing comma-separated eventId
 * approvals. Never interpret an old raid:<boss>:<date> event as a persistent
 * boss guide; owner must select a new explicit raid-boss target.
 */
export function targetsFromInfographicDecision(decision){
  if(!plain(decision))throw new TypeError('Infographic review decision required');
  const targets=Array.isArray(decision.targets)?[...decision.targets]:[];
  if(typeof decision.eventId==='string'&&decision.eventId.trim()){
    for(const id of decision.eventId.split(',')){
      const eventId=id.trim();
      if(eventId)targets.push({type:'event',eventId});
    }
  }
  return normalizeInfographicTargets(targets);
}
export function infographicMatchesRaidBoss(targets,{pokemonId,formId=null,battleMode}={}){
  if(!POKEMON_ID.test(pokemonId||'')||
     (formId!==null&&!POKEMON_ID.test(formId))||!MODES.has(battleMode))
    return false;
  return normalizeInfographicTargets(targets).some(target=>
    target.type==='raid-boss'&&target.pokemonId===pokemonId&&
    target.formId===formId&&target.battleMode===battleMode);
}
