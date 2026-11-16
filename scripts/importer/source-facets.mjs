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
const groupAccess = heading => /\b(?:add-ons?|extra days?)\b/i.test(heading)?'addon'
  : /\b(?:ticket[\s-]*(?:holders?|exclusive)|ticketed|paid)\b/i.test(heading)?'ticket'
  : /\b(?:all trainers|everyone|free)\b/i.test(heading)?'free':'unknown';
const benefitKind = s => /safari balls?|premier balls?/i.test(s)?'safari-balls'
  : /party play/i.test(s)?'party-play'
  : /raid pass/i.test(s)?'raid-passes'
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
  && /\b(?:up to|increased|chance|double|triple|earn|cost|limit|duration|daily|extra|additional|raid passes?|special trades?|stardust|candy|eggs?|lure modules?|supply balloons?|max particles?|snapshot|cp boost|party play|safari balls?|premier balls?|instead of)\b|\d+(?:\/\d+)?\s*[×x]/i.test(s)
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
  // LeekDuck's "General Bonuses" title often establishes entitlement only
  // in the first sentence: "All Trainers will receive...". A generic heading
  // alone cannot prove the same benefit is free.
  if(/\b(?:all trainers|every trainer|everyone)\b.{0,90}\b(?:receive|enjoy|benefits?|bonuses?)\b/i.test(paragraph))return 'free';
  return /\b(ticket-holding trainers|ticket holders|ticketed session)\b/i.test(paragraph)?'ticket':'unknown';
};
const moveRegex=/([A-Z][\p{L}’'-]+(?:\s+[A-Z][\p{L}’'-]+){0,3})\s+(Fast|Charged)\s+Attack\b/gu;
// Leek Duck icon alt text often concatenates the move type and name:
 // "GrassFrenzy Plant Charged Attack" describes Frenzy Plant, not a
 // new move called GrassFrenzy Plant. Strip *only* a joined exact type.
const MOVE_TYPES=['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel','Fire','Water','Grass','Electric','Psychic','Ice','Dragon','Dark','Fairy'];
const moveName = s => {
  const value=String(s||'').replace(/\s+/g,' ').trim();
  const type=MOVE_TYPES.find(t=>value.startsWith(t)&&/^[A-Z]/.test(value.slice(t.length,t.length+1)));
  return type?value.slice(type.length):value;
};
function parseMoves(sec,url){
  const output=[],sub=headings(sec.body);
  const groupScope=accessType(sec.heading,sec.body);
  const add=(pokemon,move,kind,body,section)=>{
    if(!pokemon||!move||!/^(fast|charged)$/i.test(kind))return;
    move=moveName(move);
    if(pokemon.length>90||move.length>70)return;
    const access=/\b(?:only|exclusive(?:ly)?)\b.{0,90}\bticket holders\b/i.test(text(body))?'ticket':groupScope;
    const acquisition=[];
    // Only row-local instructions are used; a general "caught or evolved"
    // heading must not incorrectly mark every move as both methods.
    const local=text(body);
    if(/\bevolve\b/i.test(local))acquisition.push('evolve');
    if(/\bcatch\b|\bcaught\b/i.test(local))acquisition.push('catch');
    if(/\braids?\b/i.test(local)&&/\b(?:caught|catch|obtain|available)\b/i.test(local))acquisition.push('raid');
    // A move can have different acquisition windows for separate sessions.
    // Read only the specific Pokémon's prose, never the enclosing Moves
    // introduction or a different Pokémon's hours.
    const windowText=entryWindow(body);
    const day=windowText?dayScope(windowText):null;
    const explicitDay=windowText?(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.exec(windowText)?.[0]||null):null;
    const sessionLabel=explicitDay?explicitDay[0].toUpperCase()+explicitDay.slice(1).toLowerCase():null;
    output.push({id:slug(pokemon)+'--'+slug(move)+'--'+kind.toLowerCase(),pokemonLabel:pokemon,move:moveName(move),
      moveKind:kind.toLowerCase(),access,acquisitionMethods:acquisition.length?[...new Set(acquisition)]:['unknown'],
      dayScope:day,windowText,sessionLabel,
      source:sourceRef(url,section)});
  };
  for(const s of sub){
    if(s.level>4||!s.heading||/\b(move|attack|research|bonus)\b/i.test(s.heading))continue;
    const plain=[text(s.body),...imgAlts(s.body)].join(' ');let found;
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
  const descriptions=parts.slice(0,12);
  const plain=descriptions.join(' ');
  // These are literal publisher statements, not inferred deadlines or
  // player-specific rewards. Preserve the distinction between claiming a
  // research story, completing its tasks, and activating medal bonuses.
  const claimInstructionsText=parts.find(p=>/\bclaim\b.{0,110}\bSpecial Research\b|\bSpecial Research\b.{0,110}\bclaim\b/i.test(p))||null;
  const completionDeadlineText=parts.find(p=>/\b(?:complete|finish)\b.{0,120}\b(?:tasks?|research)\b.{0,120}\b(?:before|by)\b.{0,110}\b(?:a\.?m\.?|p\.?m\.?|\d{1,2}:\d{2})\b/i.test(p))||null;
  const bonusActivationText=parts.find(p=>/\bbonuses?\s+begin\b.{0,120}\b(?:claim|medal)\b|\bmedal\b.{0,120}\bbonuses?\s+begin\b/i.test(p))||null;
  const completionRewardText=parts.find(p=>/\b(?:complete|completing)\b.{0,140}\b(?:Special Research|research|story)\b.{0,150}\b(?:awards?|encounter|pose)\b/i.test(p))||null;
  const medalEffects=parts.flatMap(p=>{
    const m=/^(.{3,75}\bmedal)\s*:\s*(.{8,420})$/i.exec(p);
    return m?[{medalLabel:m[1].trim(),effectText:m[2].trim()}]:[];
  }).slice(0,8);
  const choices=[];
  const pick=/\bchoose (?:a|between)\s+([A-Z][\p{L} -]+?)\s+or\s+([A-Z][\p{L} -]+?)\s+path\b/iu.exec(plain);
  if(pick)choices.push(pick[1].trim(),pick[2].trim());
  // "Choose between two Special Research paths: X Version and Y Version"
  // is another published branch syntax; preserve exact path names.
  if(!choices.length&&/\bchoose\b.{0,100}\bpaths?\b/i.test(plain)){
    const versions=[...new Set((plain.match(/\b[XY] Version\b/gi)||[]).map(v=>v.toUpperCase().replace(' VERSION',' Version')))];
    if(versions.length===2)choices.push(...versions);
  }
  let steps=headings(sec.body).filter(h=>/\(\s*(\d+)\s*\/\s*(\d+)\s*\)\s*$/.test(h.heading))
    .map(h=>{const m=/\(\s*(\d+)\s*\/\s*(\d+)\s*\)\s*$/.exec(h.heading);
      return {step:Number(m[1]),outOf:Number(m[2]),title:h.heading,taskRewardEvidence:'not-extracted'};});
  // Some publisher stage cards use divs, not headings. Stage counts can be
  // recovered from explicit "(1/6)" labels without inventing tasks or rewards.
  if(!steps.length){
    const counts=[...new Set([...text(sec.body).matchAll(/\(\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)/g)].map(m=>m[1]+'/'+m[2]))].slice(0,30);
    steps=counts.map(key=>{const [n,total]=key.split('/').map(Number);
      return {step:n,outOf:total,title:'Stage '+n+'/'+total,taskRewardEvidence:'not-extracted'};
    }).filter(s=>s.step>0&&s.step<=s.outOf&&s.outOf<=30);
  }
  const onceOnly=/\b(?:only once|granted once)\b/i.test(plain)?true:
    kind==='timed'&&/\b(?:Extra Day|additional day)\b.{0,120}\b(?:again|each added day)\b/i.test(plain)?false:null;
  return {id:slug(sec.heading),kind,access:accessType(sec.heading,sec.body),title:sec.heading,
    storyTitle:sec.storyTitle||null,paths:choices,steps,description:descriptions,onceOnly,
    claimInstructionsText,completionDeadlineText,bonusActivationText,completionRewardText,medalEffects,
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
    const ancestor=sectionList.slice(0,i).reverse().find(prev=>prev.level<s.level);
    // An "Add-ons" heading contains separately priced product cards such as
    // "Raid Lover — MXN$200"; don't assign those bonuses to all paid tickets.
    const addon=ancestor&&/\badd-ons?\b/i.test(ancestor.heading)
      && /(?:\bMXN\$|\bUS\$|\bA\$|\b\d+\s*(?:USD|MXN)\b)/i.test(s.heading);
    if(/\b(?:bonus(?:es)?|perks?)\b/i.test(s.heading)||addon){
      const access=addon?'addon':accessType(s.heading,ownBody);
      if(access==='unknown')continue; // generic parent "Bonuses" is not a grant
      const windowText=entryWindow(ownBody);
      const raw=[...imgAlts(ownBody),...paragraphs(ownBody)];
      // Preserve the publisher's actual sentence that proves a ticketed
      // Raid Pass/Max Particle cap replaces the free limit. A boolean alone
      // is not enough evidence for the normalized contract.
      const replacementEvidence=paragraphs(ownBody).find(p=>
        p.length<=240 && /\b(?:replaces?|replaced|instead of)\b/i.test(p)
        && /\bfree\b/i.test(p) && /\blimits?\b/i.test(p)
        && !/\b(?:not yet confirmed|speculative|unverified)\b/i.test(p)
      )||null;
      const override=Boolean(replacementEvidence);
      for(const item of raw){
        const marker=/\*{1,4}$/.exec(item.trim())?.[0]||'';
        const benefit=item.replace(/\*+$/g,'').trim();
        // The source's explanatory replacement sentence is evidence, not a
        // fourth gameplay perk unless it specifies an actual quantified perk.
        if(replacementEvidence===benefit&&!/\d/.test(benefit))continue;
        if(!isBenefit(benefit))continue;
        const k=slug(s.heading)+'|'+benefit.toLocaleLowerCase('en');
        if(seen.has(k))continue;seen.add(k);
        const kind=benefitKind(benefit);
        const caveat=marker&&paragraphs(ownBody).some(p=>p.trim().startsWith(marker)&&/not (?:yet )?confirmed|speculat|unverified/i.test(p));
        benefits.push({id:slug(s.heading)+'--'+slug(benefit),label:benefit,kind,access,
          addonLabel:addon?s.heading:null,status:caveat?'unconfirmed':'source-claimed',
          windowText:windowText||null,dayScope:dayScope(windowText||''),
          replacesFreeLimit:override&&(kind==='raid-passes'||kind==='max-particles'),
          replacementEvidence:override&&(kind==='raid-passes'||kind==='max-particles')?replacementEvidence:null,
          source:sourceRef(sourceUrl,s.heading)});
      }
    }
    if(/^(?:moves|featured attacks?|featured attacks? .+)$/i.test(s.heading)){
      for(const move of parseMoves(s,sourceUrl)){
        const key=move.id+'|'+move.access;if(!seen.has(key)){seen.add(key);featuredMoves.push(move);}
      }
    }
    if(/\b(?:special|timed|field)\s+research\b/i.test(s.heading)){
      // LeekDuck may put a separately titled research story in the very
      // next h2 rather than under the "Special Research — Ticket Holders"
      // heading. Only attach it when an explicit (1/N) stage exists; never
      // consume an unrelated event section such as Field Research or Sales.
      const next=sectionList[i+1];
      const detachedStory=next&&next.level===s.level&&
        !/\b(?:special|timed|field)\s+research\b|^(?:bonuses?|features?|spawns?|eggs?|raids?|max battles?|moves?|sales?|shiny|go stamp rally)$/i.test(next.heading)&&
        /\bSpecial Research\b/i.test(text(next.body).slice(0,800))&&
        /\(\s*1\s*\/\s*(?:[2-9]|[12]\d)\s*\)/.test(text(next.body));
      const researchSection=detachedStory?{...s,body:s.body+next.body,storyTitle:next.heading}:s;
      const program=parseResearch(researchSection,sourceUrl);
      const k='research|'+program.id;if(!seen.has(k)){seen.add(k);researchPrograms.push(program);}
    }
  }
  return {schemaVersion:1,sourceUrl,benefits,featuredMoves,researchPrograms};
}
