#!/usr/bin/env node
// Source-backed event coverage inventory. Missing sections are review candidates,
// not claims that every event must contain research, raids or bonuses.
import {readFile,writeFile,mkdir} from 'node:fs/promises';

export function auditEvents(curated,details){
  const sourceEvents=details?.events||{};
  const curatedEvents=curated?.events||[];
  const curatedById=new Map(curatedEvents.map(event=>[event.id,event]));
  const rows=value=>Array.isArray(value)?value:[];
  const sourceLinks=source=>rows(source?.sources).filter(x=>x&&typeof x==='object'&&typeof x.url==='string'&&x.url.trim()).map(x=>x.url);
  const ids=[...new Set([...curatedEvents.map(event=>event.id),...Object.keys(sourceEvents)])];
  const events=ids.map(id=>{
    const event=curatedById.get(id)||{id,t:sourceEvents[id]?.name||id,s:null,e:null};
    const source=sourceEvents[event.id]||null;
    const fields=source?.fields||{};
    const hasField=key=>rows(fields[key]).some(row=>{
      const text=typeof row==='string'?row:(typeof row?.text==='string'?row.text:typeof row?.title==='string'?row.title:'');
      return text.trim()&&!['rejected','conflict'].includes(row?.status);
    });
    const checks={
      sourceMatched:!!source,
      sourceLinked:!!(event.sourceUrl||sourceLinks(source).length),
      verifiedArtwork:!!(source?.image&&source?.imageProvenance?.sourceUrl),
      sourceBonuses:hasField('bonuses'),
      sourceResearch:hasField('research')||rows(source?.researchTasks).length>0,
      structuredResearch:rows(source?.researchTasks).length>0,
      sourceEncounters:rows(source?.encounters).length>0||rows(source?.pokemon).length>0||hasField('featured')||hasField('raids'),
      sourceTimeDetails:hasField('dates'),
    };
    const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
    return {id:event.id,name:event.t,start:event.s,end:event.e,origin:curatedById.has(id)?'curated':'source-only',checks,missing,
      sources:sourceLinks(source).slice(0,3)};
  });
  const counts=Object.fromEntries(Object.keys(events[0]?.checks||{}).map(k=>[k,{
    present:events.filter(e=>e.checks[k]).length,missing:events.filter(e=>!e.checks[k]).length
  }]));
  // A review queue, not an assertion that every prose mention is a task.
  const researchReview=events.filter(event=>event.checks.sourceResearch&&!event.checks.structuredResearch)
    .map(({id,name,origin,sources})=>({id,name,origin,sources}));
  // Declared source IDs are contracts for Event Details handoff. A source
  // may disappear while the canonical event still has valid information:
  // report this for review, never claim that the public page is blank.
  const sourceJoinReview=curatedEvents.flatMap(event=>{
    const declared=Array.isArray(event.detailIds)?[...new Set(event.detailIds.filter(
      id=>typeof id==='string'&&id.trim()
    ))]:[];
    const missingDetailIds=declared.filter(id=>!Object.hasOwn(sourceEvents,id));
    if(!missingDetailIds.length)return [];
    return [{
      id:event.id,name:event.t,missingDetailIds,
      hasCanonicalDetail:Object.hasOwn(sourceEvents,event.id),
      sourceUrl:event.sourceUrl||null
    }];
  });
  return {asOf:curated?.asOf||null,sourceUpdated:details?.updated||null,
    researchReviewCount:researchReview.length,researchReview,
    sourceJoinReviewCount:sourceJoinReview.length,sourceJoinReview,
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
  // Compact mode for investigating research coverage without dumping the full inventory.
  if(process.argv.includes('--source-join-review')) {
    console.log(JSON.stringify({
      asOf:report.asOf,sourceUpdated:report.sourceUpdated,
      total:report.total,sourceJoinReviewCount:report.sourceJoinReviewCount,
      sourceJoinReview:report.sourceJoinReview
    },null,2));
  } else if(process.argv.includes('--research-review')) {
    console.log(JSON.stringify({
      asOf:report.asOf,sourceUpdated:report.sourceUpdated,
      total:report.total,sourceResearch:report.counts.sourceResearch?.present||0,
      structuredResearch:report.counts.structuredResearch?.present||0,
      researchReviewCount:report.researchReviewCount,researchReview:report.researchReview
    },null,2));
  } else console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(e=>{console.error(e);process.exitCode=1});
