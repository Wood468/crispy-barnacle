#!/usr/bin/env node
// Source-backed event coverage inventory. Missing sections are review candidates,
// not claims that every event must contain research, raids or bonuses.
import {readFile,writeFile,mkdir} from 'node:fs/promises';

export function auditEvents(curated,details){
  const sourceEvents=details?.events||{};
  const curatedEvents=curated?.events||[];
  const curatedById=new Map(curatedEvents.map(event=>[event.id,event]));
  const ids=[...new Set([...curatedEvents.map(event=>event.id),...Object.keys(sourceEvents)])];
  const events=ids.map(id=>{
    const event=curatedById.get(id)||{id,t:sourceEvents[id]?.name||id,s:null,e:null};
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
      structuredResearch:!!source?.researchTasks?.length,
      sourceEncounters:!!(source?.encounters?.length||source?.pokemon?.length)||hasField('featured')||hasField('raids'),
      sourceTimeDetails:hasField('dates'),
    };
    const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
    return {id:event.id,name:event.t,start:event.s,end:event.e,origin:curatedById.has(id)?'curated':'source-only',checks,missing,
      sources:(source?.sources||[]).map(x=>x.url).filter(Boolean).slice(0,3)};
  });
  const counts=Object.fromEntries(Object.keys(events[0]?.checks||{}).map(k=>[k,{
    present:events.filter(e=>e.checks[k]).length,missing:events.filter(e=>!e.checks[k]).length
  }]));
  // A review queue, not an assertion that every prose mention is a task.
  const researchReview=events.filter(event=>event.checks.sourceResearch&&!event.checks.structuredResearch)
    .map(({id,name,origin,sources})=>({id,name,origin,sources}));
  return {asOf:curated?.asOf||null,sourceUpdated:details?.updated||null,
    researchReviewCount:researchReview.length,researchReview,
    total:events.length,curatedCount:curatedEvents.length,sourceOnlyCount:events.length-curatedEvents.length,counts,events};
}

async function main(){
  const curated=JSON.parse(await readFile('public/data.json','utf8'));
  const details=JSON.parse(await readFile('public/event-details.json','utf8'));
  const report=auditEvents(curated,details);
  if(process.argv.includes('--write')){
    await mkdir('data',{recursive:true});
    await writeFile('data/event-coverage-report.json',JSON.stringify(report,null,2)+'\n');
  }
  // A compact mode for investigating research coverage without dumping the full\n  // event inventory. It uses the same source-backed checks as the full report.\n  if(process.argv.includes('--research-review')) {\n    console.log(JSON.stringify({asOf:report.asOf,sourceUpdated:report.sourceUpdated,\n      total:report.total,sourceResearch:report.counts.sourceResearch?.present||0,\n      structuredResearch:report.counts.structuredResearch?.present||0,\n      researchReviewCount:report.researchReviewCount,researchReview:report.researchReview},null,2));\n  } else console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(e=>{console.error(e);process.exitCode=1});
