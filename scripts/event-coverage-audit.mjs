#!/usr/bin/env node
// Source-backed event coverage inventory. Missing sections are review candidates,
// not claims that every event must contain research, raids or bonuses.
import {readFile,writeFile,mkdir} from 'node:fs/promises';

export function auditEvents(curated,details){
  const sourceEvents=details?.events||{};
  const events=(curated?.events||[]).map(event=>{
    const source=sourceEvents[event.id]||null;
    const fields=source?.fields||{};
    const hasField=key=>Array.isArray(fields[key])&&fields[key].some(row=>
      (typeof row==='string'?row:row?.text||row?.title||'').trim()&&
      !['rejected','conflict'].includes(row?.status));
    const checks={
      sourceMatched:!!source,
      sourceLinked:!!(event.sourceUrl||(source?.sources||[]).some(x=>x.url)),
      verifiedArtwork:!!(source?.image&&source?.imageProvenance?.sourceUrl),
      sourceBonuses:hasField('bonuses'),
      sourceResearch:hasField('research')||!!source?.researchTasks?.length,
      sourceEncounters:!!(source?.encounters?.length||source?.pokemon?.length)||hasField('featured')||hasField('raids'),
      sourceTimeDetails:hasField('dates'),
    };
    const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
    return {id:event.id,name:event.t,start:event.s,end:event.e,checks,missing,
      sources:(source?.sources||[]).map(x=>x.url).filter(Boolean).slice(0,3)};
  });
  const counts=Object.fromEntries(Object.keys(events[0]?.checks||{}).map(k=>[k,{
    present:events.filter(e=>e.checks[k]).length,missing:events.filter(e=>!e.checks[k]).length
  }]));
  return {asOf:curated?.asOf||null,sourceUpdated:details?.updated||null,
    total:events.length,counts,events};
}

async function main(){
  const curated=JSON.parse(await readFile('public/data.json','utf8'));
  const details=JSON.parse(await readFile('public/event-details.json','utf8'));
  const report=auditEvents(curated,details);
  if(process.argv.includes('--write')){
    await mkdir('data',{recursive:true});
    await writeFile('data/event-coverage-report.json',JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(e=>{console.error(e);process.exitCode=1});
