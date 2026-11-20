#!/usr/bin/env node
// Diagnose published raid schedule gaps without inventing rotations.
import { readFileSync } from 'node:fs';

const validDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
};

// Rotation boundaries may be calendar dates or local ISO minute timestamps.
const validBoundary = value => {
  if (validDay(value)) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(value)) return false;
  return validDay(value.slice(0,10)) && Number.isFinite(Date.parse(value));
};

export function auditRaidCoverage(data, details) {
  const rotation = [...(data.rotation || [])].sort((a,b)=>String(a.s).localeCompare(String(b.s)));
  const issues = [];
  for (let i=0;i<rotation.length;i++) {
    const row=rotation[i], next=rotation[i+1];
    if (!row.s || !row.e || !row.five) issues.push({type:'incomplete-rotation',index:i});
    if (!validBoundary(row.s) || !validBoundary(row.e) || row.e <= row.s) issues.push({type:'invalid-window',index:i});
    if (next && validBoundary(row.s) && validBoundary(row.e) && row.e > row.s && validBoundary(next.s) && validBoundary(next.e) && next.e > next.s && next.s > row.e) issues.push({type:'rotation-gap',from:row.e,to:next.s});
    if (next && validBoundary(row.s) && validBoundary(row.e) && row.e > row.s && validBoundary(next.s) && validBoundary(next.e) && next.e > next.s && next.s < row.e) issues.push({type:'rotation-overlap',from:next.s,to:row.e});
  }
  const hours=data.raidHour||[];
  const seen=new Set();
  for (const h of hours) {
    if (!validDay(h.d) || !h.n) issues.push({type:'invalid-raid-hour',date:h.d});
    if (seen.has(h.d)) issues.push({type:'duplicate-raid-hour',date:h.d});
    seen.add(h.d);
  }
  const sourceEvents=Object.values(details?.events||{});
  for (const e of sourceEvents) {
    if (!/Raid Hour$/i.test(e.name||'')) continue;
    const match=(e.sources||[]).some(s=>/raidhour20\d{6}/.test(s.url||''));
    if (!match) continue;
    const date=(e.sources||[]).map(s=>/raidhour(20\d{2})(\d{2})(\d{2})/.exec(s.url||'')).find(Boolean);
    if (date && validDay(date[1]+'-'+date[2]+'-'+date[3]) && !seen.has(date[1]+'-'+date[2]+'-'+date[3])) issues.push({type:'source-raid-hour-not-curated',name:e.name,date:date[1]+'-'+date[2]+'-'+date[3]});
  }
  return issues;
}

if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  const data=JSON.parse(readFileSync('public/data.json','utf8'));
  const details=JSON.parse(readFileSync('public/event-details.json','utf8'));
  const issues=auditRaidCoverage(data,details);
  console.log(JSON.stringify({issueCount:issues.length,issues},null,2));
}
