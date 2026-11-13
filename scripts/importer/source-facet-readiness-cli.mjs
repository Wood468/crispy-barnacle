#!/usr/bin/env node
/*
 * Sprint 4 operator-facing source identity audit. Read-only, no secrets,
 * source prose, claim details, source URLs, application writes or deploys.
 * In strict mode HOLD exits 2; malformed/unreadable report exits 1.
 */
import {readFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSourceIdentityCoverage} from './source-facet-identity-coverage.mjs';

const args=process.argv.slice(2);
const known=new Set(['--strict','--json','--report']);
let reportPath=fileURLToPath(new URL('../../data/importer-report.json',import.meta.url));
const strict=args.includes('--strict'),json=args.includes('--json');
for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(!known.has(arg))throw new TypeError('Unknown release readiness CLI argument');
  if(arg==='--report'){
    if(!args[i+1]||args[i+1].startsWith('--'))throw new TypeError('Report path required');
    reportPath=resolve(args[++i]);
  }
}
try{
  const bytes=await readFile(reportPath);
  if(bytes.length>2*1024*1024)throw new TypeError('Importer audit exceeds size limit');
  const input=JSON.parse(bytes.toString('utf8'));
  const report=auditSourceIdentityCoverage(input);
  // An audit of old or future-dated evidence must never appear release-ready.
  const runAt=typeof input.runAt==='string'&&Number.isFinite(Date.parse(input.runAt))&&
    new Date(input.runAt).toISOString()===input.runAt?input.runAt:null;
  const ageMs=runAt?Date.now()-Date.parse(runAt):NaN;
  const fresh=Number.isFinite(ageMs)&&ageMs>=-5*60*1000&&ageMs<=24*60*60*1000;
  const result={
    schemaVersion:1,publication:'audit-only',
    reviewStatus:report.sourceLinkReviewRequired||!fresh?'HOLD':'SOURCE_IDENTITY_CHECK_PASSED',
    importerRunAt:runAt,
    coverage:report.coverage,
    blockers:[...report.reviewBlockers,...(fresh?[]:['stale-or-invalid-importer-report'])],
    requiresIndependentClaimReview:true,
    requiresSignedPromotion:true,
    productionPublicationAuthorized:false
  };
  if(json)console.log(JSON.stringify(result,null,2));
  else console.log(
    'Sprint 4 source identities: '+result.reviewStatus+'; '+
    result.coverage.linkedPages+'/'+result.coverage.eligiblePages+' linked, '+
    result.coverage.ambiguousPages+' ambiguous, '+result.coverage.unlinkedPages+' unlinked. '+
    'No public release is authorized by this audit.'
  );
  if(process.env.GITHUB_STEP_SUMMARY){
    const m=result.coverage;
    const lines=[
      '### GO Field Notes — Sprint 4 source identity review',
      '',
      '**'+result.reviewStatus+'** (audit only; not a publication approval)',
      '',
      '| Eligible pages | Linked | Ambiguous | Unlinked | Rejected | Duplicates |',
      '|---:|---:|---:|---:|---:|---:|',
      '| '+[m.eligiblePages,m.linkedPages,m.ambiguousPages,m.unlinkedPages,
        m.rejectedPages,m.duplicatePages].join(' | ')+' |',
      '',
      result.blockers.length?'Blockers: '+result.blockers.join(', '):
        'All observed pages have unique identities. Independent source-claim review and signed release still required.',
      ''
    ];
    await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'));
  }
  if(strict&&result.reviewStatus==='HOLD')process.exitCode=2;
}catch(error){
  // Never echo malformed report contents, URLs or ticket source prose.
  console.error('Sprint 4 source identity audit failed closed: '+
    (error instanceof TypeError?'invalid or inconsistent audit':'report unavailable or unreadable'));
  process.exitCode=1;
}
