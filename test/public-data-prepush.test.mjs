import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const workflowDir = new URL("../.github/workflows/", import.meta.url);
const validator = /^\s*node scripts\/validate-public-data\.mjs\s*$/;

test("every workflow commit that stages public data validates it first", async () => {
  const files = (await readdir(workflowDir)).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  let checkedStages = 0;

  for (const file of files) {
    const lines = (await readFile(new URL(file, workflowDir), "utf8")).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*git add\b/.test(lines[i]) || !/public\//.test(lines[i])) continue;
      const nextAdd = lines.findIndex((line, index) => index > i && /^\s*git add\b/.test(line));
      const nextCommit = lines.findIndex((line, index) => index > i && /^\s*git commit\b/.test(line));
      if (nextCommit < 0 || (nextAdd >= 0 && nextAdd < nextCommit)) continue;
      const validation = lines.findIndex((line, index) => index > i && index < nextCommit && validator.test(line));
      assert.ok(validation > i, `${file}:${i + 1} stages public data without validating it before commit`);
      checkedStages++;
    }
  }

  assert.ok(checkedStages >= 10, `expected to cover the known public-data writer stages; found ${checkedStages}`);
});

test("every direct-main push of staged public data revalidates after rebasing", async () => {
  const files = (await readdir(workflowDir)).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  let checkedPushes = 0;

  for (const file of files) {
    const lines = (await readFile(new URL(file, workflowDir), "utf8")).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/git push origin HEAD:main/.test(lines[i])) continue;
      let addIndex = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (/^\s*git add\b/.test(lines[j])) { addIndex = j; break; }
      }
      if (addIndex < 0 || !/public\//.test(lines[addIndex])) continue;
      let pullIndex = -1;
      for (let j = i - 1; j > addIndex; j--) {
        if (/git pull .*--rebase/.test(lines[j])) { pullIndex = j; break; }
      }
      assert.ok(pullIndex > addIndex, `${file}:${i + 1} pushes public data without rebasing first`);
      const validation = lines.findIndex((line, index) => index > pullIndex && index < i && validator.test(line));
      assert.ok(validation > pullIndex, `${file}:${i + 1} pushes public data without revalidating after rebase`);
      checkedPushes++;
    }
  }

  assert.ok(checkedPushes >= 8, `expected to cover the known direct-main public-data writers; found ${checkedPushes}`);
});
