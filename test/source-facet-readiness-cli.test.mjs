import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('../scripts/importer/source-facet-readiness-cli.mjs',import.meta.url));
const report=({linked=2,ambiguous=0,unlinked=0,runAt=new Date().toISOString()}={})=>({
  runAt,
  sourceFacetStaging:{schemaVersion:1,publication:'audit-only',sourceId:'leekduck',
    eligiblePages:linked+ambiguous+unlinked,skippedLarge:0,errors:[],
    canonicalLinks:{publication:'staging-only',
      eligiblePages:linked+ambiguous+unlinked,
      linkedPages:linked,ambiguousPages:ambiguous,unlinkedPages:unlinked,
      duplicatePages:0,rejectedPages:0}}
});
async function sandbox(fn){
  const dir=await mkdtemp(join(tmpdir(),'s4-readiness-cli-'));
  try{await fn(dir)}finally{await rm(dir,{recursive:true,force:true})}
}
function run(path,opts=[],env={}){
  return spawnSync(process.execPath,[cli,'--report',path,...opts],{
    encoding:'utf8',env:{...process.env,...env},timeout:10000
  });
}
test('manual status can display blockers without failing or leaking source text',()=>sandbox(async dir=>{
  const file=join(dir,'audit.json');
  await writeFile(file,JSON.stringify(report({linked:1,ambiguous:1,unlinked:1})));
  const x=run(file,['--json']);
  assert.equal(x.status,0,x.stderr);
  const parsed=JSON.parse(x.stdout);
  assert.equal(parsed.reviewStatus,'HOLD');
  assert.deepEqual(parsed.blockers,['ambiguous-source-ownership','unlinked-source-pages']);
  assert.equal(parsed.productionPublicationAuthorized,false);
  assert.equal(x.stdout.includes('https://'),false);
  const strict=run(file,['--strict','--json']);
  assert.equal(strict.status,2);
}));
test('a clean source identity audit passes strict mode but never authorizes publication',()=>sandbox(async dir=>{
  const file=join(dir,'audit.json');
  await writeFile(file,JSON.stringify(report()));
  const summary=join(dir,'summary.md');
  const x=run(file,['--strict','--json'],{GITHUB_STEP_SUMMARY:summary});
  assert.equal(x.status,0,x.stderr);
  const parsed=JSON.parse(x.stdout);
  assert.equal(parsed.reviewStatus,'SOURCE_IDENTITY_CHECK_PASSED');
  assert.equal(parsed.productionPublicationAuthorized,false);
  assert.match(await readFile(summary,'utf8'),/Independent source-claim review/);
}));
test('invalid data and report errors fail closed without printing original content',()=>sandbox(async dir=>{
  const file=join(dir,'audit.json');
  const sensitive='SECRET_TICKET_TOKEN=https://attacker.invalid';
  await writeFile(file,sensitive);
  const bad=run(file,['--strict','--json']);
  assert.equal(bad.status,1);
  assert.equal((bad.stderr+bad.stdout).includes(sensitive),false);
  const missing=run(join(dir,'missing.json'),['--strict']);
  assert.equal(missing.status,1);
}));
test('current repository importer audit remains readable with no public authorization',()=>{
  const x=spawnSync(process.execPath,[cli,'--json'],{encoding:'utf8',timeout:10000});
  assert.equal(x.status,0,x.stderr);
  const result=JSON.parse(x.stdout);
  assert.equal(result.publication,'audit-only');
  assert.equal(result.productionPublicationAuthorized,false);
  assert.equal(result.coverage.eligiblePages,
    result.coverage.linkedPages+result.coverage.ambiguousPages+result.coverage.unlinkedPages);
});

test('stale, future and missing importer timestamps fail closed in strict mode',()=>sandbox(async dir=>{
  for(const runAt of [new Date(Date.now()-25*60*60*1000).toISOString(),
    new Date(Date.now()+6*60*1000).toISOString(),null]){
    const file=join(dir,'audit.json');
    await writeFile(file,JSON.stringify(report({runAt})));
    const x=run(file,['--strict','--json']);
    assert.equal(x.status,2,x.stderr);
    const parsed=JSON.parse(x.stdout);
    assert.equal(parsed.reviewStatus,'HOLD');
    assert.ok(parsed.blockers.includes('stale-or-invalid-importer-report'));
    assert.equal(parsed.productionPublicationAuthorized,false);
  }
}));
