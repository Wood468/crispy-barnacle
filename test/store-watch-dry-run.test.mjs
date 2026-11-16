import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/store-watch.yml',import.meta.url),'utf8');

test('manual Store watch dry-run cannot reach a git commit or push',()=>{
  const marker='      - name: Remember what was seen';
  assert.equal(workflow.split(marker).length,2,'single state commit stage');
  const step=workflow.slice(workflow.indexOf(marker));
  assert.match(step,/^\s*if: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| github\.event\.inputs\.dry_run == 'false' \}\}/m,
    'save stage is allowed only on a scheduled run or explicitly non-dry manual run');
  assert.match(step,/git commit -m/);
  assert.match(step,/git push origin HEAD:main/);
  assert.match(workflow,/dry_run:\s*\n\s*description: "Only print what would be sent and do not save the state"\s*\n\s*default: "true"/);
});

test('Store artwork reporting remains read-only and active during a dry run',()=>{
  const snapshot=workflow.indexOf('      - name: Read the store');
  const audit=workflow.indexOf('      - name: Audit Store product artwork candidates (report only)');
  const save=workflow.indexOf('      - name: Remember what was seen');
  assert.ok(snapshot>=0&&audit>snapshot&&save>audit);
  const auditStep=workflow.slice(audit,save);
  assert.match(auditStep,/continue-on-error: true/);
  assert.match(auditStep,/node scripts\/store-artwork-coverage\.mjs \/tmp\/store-snapshot\.json/);
  assert.ok(!/git (?:commit|push)/.test(auditStep));
  assert.match(workflow,/DRY_RUN: \$\{\{ github\.event\.inputs\.dry_run \|\| 'false' \}\}/);
});
