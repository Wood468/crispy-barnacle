/*
 * Conservative official Pokémon GO ticket-bonus extractor.
 *
 * The official site often introduces two separate ticket-holder benefit
 * windows as prose instead of nested "Bonuses" headings. Preserve both.
 * This module only STAGES explicitly published text; no entitlement is
 * granted, published or inferred from a ticket price or decorative image.
 */
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',times:'×',ndash:'–',mdash:'—',rsquo:'’',eacute:'é'};
const plain=s=>String(s||'').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi,(all,n)=>entities[n.toLowerCase()]??all)
  .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const slug=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,125);
const isTicketIntro=text=>/\b(?:ticket[\s-]*holders?|ticket[\s-]*holding)\s+trainers?\b/i.test(text)
  &&/\b(?:receive|bonuses?|rewards?)\b/i.test(text)
  &&/\b(?:between|from)\b/i.test(text)
  &&/\b(?:a\.?m\.?|p\.?m\.?|\d{1,2}:\d\d)\b/i.test(text);
const scopeFrom=s=>/\b12:00\s*a\.?m\.?\b.{0,110}\b11:59\s*p\.?m\.?\b/i.test(s)?'all-day':null;
const kindOf=s=>/\braid passes?\b/i.test(s)?'raid-passes'
  : /\bmax particles?\b/i.test(s)?'max-particles'
  : /\bincense\b/i.test(s)?'incense'
  : /\bshiny\b/i.test(s)?'shiny'
  : /\b(?:special trades?|stardust cost for trades?|trades? per day)\b/i.test(s)?'trading'
  : /\beggs?\b|\bhatch\b/i.test(s)?'eggs'
  : /\blure modules?\b/i.test(s)?'lures'
  : /\bsnapshot\b/i.test(s)?'snapshot'
  : /\bcandy\b/i.test(s)?'candy'
  : /\bstardust\b/i.test(s)?'stardust'
  : /\bXP\b/i.test(s)?'xp':'other';
const looksLikePerk=s=>s.length>=12&&s.length<=190
  &&/^(?:up to|increased|daily|additional|extra|lure modules?|six\b|two\b|\d+(?:\/\d+)?\s*[×x])\b/i.test(s)
  && !/\b(?:not (?:yet )?confirmed|speculative|not guaranteed|may be available|check back|this bonus to apply)\b/i.test(s)
  && kindOf(s)!=='other';
const allowedUrl=url=>{
  try{
    const u=new URL(url);
    return u.protocol==='https:'&&!u.username&&!u.password&&
      ['pokemongo.com','www.pokemongo.com'].includes(u.hostname)&&
      /^\/(?:(?:en\/)?(?:news|post)\/[a-z0-9-]{6,}\/?|(?:en\/)?gowildarea\/(?:global|[a-z0-9-]{3,})\/?)$/i.test(u.pathname);
  }catch{return false}
};
const cleanHtml=html=>String(html).replace(/<(script|style|nav|footer|header|aside|form|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
/**
 * Extract only ticket-holder bonus paragraphs scoped by a literal official
 * introduction ("between ... on event days"). No guess based on a ticket
 * purchase, overlapping free perks, or untimed source prose.
 */
export function extractOfficialTicketBonusFacets(html,{sourceUrl}={}){
  if(typeof html!=='string'||!html.trim())throw new TypeError('HTML source is required');
  if(!allowedUrl(sourceUrl))throw new TypeError('Official HTTPS announcement URL required');
  const source=sourceUrl,body=cleanHtml(html);
  const re=/<(h[1-6]|p|li|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let group=null,heading='',match;
  const benefits=[],seen=new Set();
  while((match=re.exec(body))){
    const tag=match[1].toLowerCase(),line=plain(match[2]);
    if(!line)continue;
    if(tag.startsWith('h')){
      heading=line;
      // A completely separate article section ends the previous ticket
      // window. A subsequent explicit ticket introduction starts a new one.
      group=null;
    }
    if(isTicketIntro(line)){
      group={windowText:line.slice(0,400),dayScope:scopeFrom(line),
        section:(heading?heading+' / ':'')+(scopeFrom(line)==='all-day'?'Ticket trading window':'Ticket gameplay window')};
      continue;
    }
    if(!group||tag.startsWith('h'))continue;
    const label=line.replace(/\*{1,3}$/,'').trim();
    if(!looksLikePerk(label))continue;
    const kind=kindOf(label);
    const id=slug(group.section)+'--'+slug(label);
    const key=group.section+'|'+label.toLowerCase();
    if(seen.has(key))continue;seen.add(key);
    benefits.push({
      id,label,kind,access:'ticket',status:'source-claimed',
      windowText:group.windowText,dayScope:group.dayScope,
      replacesFreeLimit:null,replacementEvidence:null,
      source:{url:source,section:group.section}
    });
  }
  return {schemaVersion:1,sourceUrl:source,benefits,featuredMoves:[],researchPrograms:[]};
}
