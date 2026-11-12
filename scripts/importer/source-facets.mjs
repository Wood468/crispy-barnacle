/*
 * Conservative, source-specific extraction of event details that the legacy
 * ten prose buckets cannot represent. Staging data only: do not publish these
 * facets until a later normalized-contract/merge PR validates them.
 *
 * Source headings determine entitlement. No inferred ticket ownership,
 * attack acquisition, Pokémon identity, reward or event time.
 */
const ENTITY = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',times:'×',ndash:'–',mdash:'—',rsquo:'’',eacute:'é'};
const decode = s => String(s||'').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n))
  .replace(/&([a-z]+);/gi,(all,name)=>ENTITY[name.toLowerCase()]??all);
const text = s => decode(String(s||'').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<img\b[^>]*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const slug = s => String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110);
const headings = html => {
  const found=[],rx=/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;let m;
  while((m=rx.exec(html)))found.push({level:Number(m[1]),heading:text(m[2]),start:m.index,end:rx.lastIndex});
  return found.map((h,i)=> {
    const after=found.slice(i+1).find(next=>next.level<=h.level);
    return {...h,body:html.slice(h.end,after?.start??html.length)};
  });
};
const sourceRef=(url,heading)=>({url,section:heading});
const groupAccess = heading => /\b(?:ticket[\s-]*(?:holders?|exclusive)|ticketed|paid)\b/i.test(heading)?'ticket'
  : /\b(?:all trainers|everyone|free)\b/i.test(heading)?'free'
  : /\b(?:add-ons?|extra days?)\b/i.test(heading)?'addon':'unknown';
const benefitKind = s => /raid pass/i.test(s)?'raid-passes'
  : /max particle/i.test(s)?'max-particles'
  : /incense/i.test(s)?'incense'
  : /shiny/i.test(s)?'shiny'
  : /special trades?|stardust cost.*trad|trad.*stardust/i.test(s)?'trading'
  : /egg|hatch/i.test(s)?'eggs'
  : /lure/i.test(s)?'lures'
  : /snapshot/i.test(s)?'snapshot'
  : /candy/i.test(s)?'candy'
  : /stardust/i.test(s)?'stardust'
  : /xp\b/i.test(s)?'xp':'other';
const isBenefit = s => s.length>=13&&s.length<=190
  && /\b(?:up to|increased|chance|double|triple|earn|cost|limit|duration|daily|extra|additional|raid passes?|special trades?|stardust|candy|eggs?|lure modules?|supply balloons?|max particles?)\b|\d+(?:\/\d+)?\s*[×x]/i.test(s)
  && !/^(?:the following|for .*trainers|to use the|bonuses begin|shiny encounters are not guaranteed|these benefits apply)/i.test(s);
const attr=(tag,name)=>{const m=new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i').exec(tag);return m?decode(m[1]??m[2]??m[3]):'';};
const paragraphs=html=>[...String(html).matchAll(/<(?:p|li|figcaption)\b[^>]*>([\s\S]*?)<\/(?:p|li|figcaption)>/gi)].map(m=>text(m[1])).filter(Boolean);
const imgAlts=html=>[...String(html).matchAll(/<img\b[^>]*>/gi)].map(m=>attr(m[0],'alt').trim()).filter(Boolean);
const entryWindow=body=>paragraphs(body).find(s=>/(?:between|from|apply|during)\b/i.test(s)&&/(?:\d{1,2}:\d\d|a\.?m\.?|p\.?m\.?|ticketed day|event hours)/i.test(s))||null;
const dayScope = s => /\byour ticketed (?:event )?day\b/i.test(s)?'ticketed-day'
  : /\bboth event days\b/i.test(s)?'both-event-days'
  : /\ball day\b|12:00 a\.m\./i.test(s)?'all-day'
  : null;
const accessType=(title,body)=>{const heading=groupAccess(title);if(heading!=='unknown')return heading;
  const paragraph=paragraphs(body).slice(0,2).join(' ');
  return /\b(ticket-holding trainers|ticket holders|ticketed session)\b/i.test(paragraph)?'ticket':'unknown';
};
const moveRegex=/([A-Z][\p{L}’'-]+(?:\s+[A-Z][\p{L}’'-]+){0,3})\s+(Fast|Charged)\s+Attack\b/gu;
const moveName = s => String(s||'').replace(/\s+/g,' ').trim();
function parseMoves(sec,url){
  const output=[],sub=headings(sec.body);
  const groupScope=accessType(sec.heading,sec.body);
  const add=(pokemon,move,kind,body,section)=>{
    if(!pokemon||!move||!/^(fast|charged)$/i.test(kind))return;
    if(pokemon.length>90||move.length>70)return;
    const access=/\b(?:only|exclusive(?:ly)?)\b.{0,90}\bticket holders\b/i.test(text(body))?'ticket':groupScope;
    const acquisition=[];
    // Only row-local instructions are used; a general "caught or evolved"
    // heading must not incorrectly mark every move as both methods.
    const local=text(body);
    if(/\bevolve\b/i.test(local))acquisition.push('evolve');
    if(/\bcatch\b|\bcaught\b/i.test(local))acquisition.push('catch');
    if(/\braids?\b/i.test(local)&&/\b(?:caught|catch|obtain|available)\b/i.test(local))acquisition.push('raid');
    output.push({id:slug(pokemon)+'--'+slug(move)+'--'+kind.toLowerCase(),pokemonLabel:pokemon,move:moveName(move),
      moveKind:kind.toLowerCase(),access,acquisitionMethods:acquisition.length?[...new Set(acquisition)]:['unknown'],
      source:sourceRef(url,section)});
  };
  for(const s of sub){
    if(s.level>4||!s.heading||/\b(move|attack|research|bonus)\b/i.test(s.heading))continue;
    const plain=text(s.body);let found;
    moveRegex.lastIndex=0;
    while((found=moveRegex.exec(plain))!==null)add(s.heading,found[1],found[2],s.body,sec.heading+' / '+s.heading);
  }
  // A publisher can describe ticket-only moves in prose without per-Pokémon
  // subheadings (for example an in-person GO Fest Mewtwo paragraph).
  // Accept only the complete, explicit Pokémon + two named attacks statement.
  if(!output.length){
    const plain=text(sec.body);
    const paired=/\bAll\s+([A-Z][\p{L}’'-]+(?:\s+[A-Z][\p{L}’'-]+){0,2})\s+caught\b.{0,160}?\bFast Attack\s+([A-Z][\p{L}’'-]+(?:\s+[A-Z][\p{L}’'-]+){0,2})\s+and\s+(?:the\s+)?Charged Attack\s+([A-Z][\p{L}’'-]+(?:\s+[A-Z][\p{L}’'-]+){0,2})\b/iu.exec(plain);
    if(paired){
      add(paired[1],paired[2],'fast',sec.body,sec.heading);
      add(paired[1],paired[3],'charged',sec.body,sec.heading);
    }
  }
  return output;
}
function parseResearch(sec,url){
  const kind=/special\s+research/i.test(sec.heading)?'special':/timed\s+research/i.test(sec.heading)?'timed':'field';
  const parts=paragraphs(sec.body).filter(s=>s.length>12&&s.length<1000);
  const descriptions=parts.slice(0,8);
  const plain=descriptions.join(' ');
  const choices=[];
  const pick=/\bchoose (?:a|between)\s+([A-Z][\p{L} -]+?)\s+or\s+([A-Z][\p{L} -]+?)\s+path\b/iu.exec(plain);
  if(pick)choices.push(pick[1].trim(),pick[2].trim());
  const steps=headings(sec.body).filter(h=>/\(\s*(\d+)\s*\/\s*(\d+)\s*\)\s*$/.test(h.heading))
    .map(h=>{const m=/\(\s*(\d+)\s*\/\s*(\d+)\s*\)\s*$/.exec(h.heading);
      return {step:Number(m[1]),outOf:Number(m[2]),title:h.heading,taskRewardEvidence:'not-extracted'};});
  return {id:slug(sec.heading),kind,access:accessType(sec.heading,sec.body),title:sec.heading,
    paths:choices,steps,description:descriptions,onceOnly:/\b(?:only once|granted once)\b/i.test(plain)?true:null,
    status:/\b(?:not confirmed|speculative|based on previous)\b/i.test(plain)?'unconfirmed':'source-published',
    source:sourceRef(url,sec.heading)};
}
/**
 * Read-only staging facets extracted from source HTML.
 * A section or datum not explicitly published remains absent/unknown.
 * The caller must separately associate the URL with a verified event ID.
 */
export function extractEventSourceFacets(html,{sourceUrl}={}){
  if(typeof html!=='string'||!html.trim())throw new TypeError('HTML source is required');
  if(typeof sourceUrl!=='string'||!/^https:\/\/[^/\s]+\//.test(sourceUrl))throw new TypeError('Valid HTTPS source URL required');
  const cleanHtml=html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const sectionList=headings(cleanHtml);
  const benefits=[],featuredMoves=[],researchPrograms=[],seen=new Set();
  for(let i=0;i<sectionList.length;i++){
    const s=sectionList[i];
    // A subgroup can have a different entitlement or effective time window.
    // In the real Global source, an h3 "Trading Bonuses" sits beneath h2
    // "Additional Ticket Holder Bonuses" but applies all day, not 10am–6pm.
    // Never inherit the entire parent h2 body into its benefits.
    const ownBody=cleanHtml.slice(s.end,sectionList[i+1]?.start??cleanHtml.length);
    if(/\b(?:bonus(?:es)?|perks?)\b/i.test(s.heading)){
      const access=accessType(s.heading,ownBody);
      if(access==='unknown')continue; // generic parent "Bonuses" is not a grant
      const windowText=entryWindow(ownBody);
      const raw=[...imgAlts(ownBody),...paragraphs(ownBody)];
      const override=/\b(?:replace|instead of)\b.{0,80}\b(?:free|all[-\s]?trainer)\b.{0,50}\b(?:limits?|bonuses?)\b/i.test(text(ownBody))
        ||/\b(?:ticketed|paid)\b.{0,50}\blimits?\s+replace\s+the\s+free\s+limits?\b/i.test(text(ownBody));
      for(const item of raw){
        const benefit=item.replace(/\*+$/g,'').trim();
        if(!isBenefit(benefit))continue;
        const k=slug(s.heading)+'|'+benefit.toLocaleLowerCase('en');
        if(seen.has(k))continue;seen.add(k);
        const kind=benefitKind(benefit);
        benefits.push({id:slug(s.heading)+'--'+slug(benefit),label:benefit,kind,access,
          windowText:windowText||null,dayScope:dayScope(windowText||''),
          replacesFreeLimit:override&&(kind==='raid-passes'||kind==='max-particles'),
          source:sourceRef(sourceUrl,s.heading)});
      }
    }
    if(/^(?:moves|featured attacks?|featured attacks? .+)$/i.test(s.heading)){
      for(const move of parseMoves(s,sourceUrl)){
        const key=move.id+'|'+move.access;if(!seen.has(key)){seen.add(key);featuredMoves.push(move);}
      }
    }
    if(/\b(?:special|timed|field)\s+research\b/i.test(s.heading)){
      const program=parseResearch(s,sourceUrl);
      const k='research|'+program.id;if(!seen.has(k)){seen.add(k);researchPrograms.push(program);}
    }
  }
  return {schemaVersion:1,sourceUrl,benefits,featuredMoves,researchPrograms};
}
