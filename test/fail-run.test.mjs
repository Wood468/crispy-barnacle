import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { failRun } from "../scripts/fail-run.mjs";

test("fatal CLI errors are logged and set a non-zero exit code", () => {
  const messages = [], processLike = { exitCode: 0 };
  failRun(new Error("source unavailable"), message => messages.push(message), processLike);
  assert.deepEqual(messages, ["source unavailable"]);
  assert.equal(processLike.exitCode, 1);
});

test("scheduled importer, audit and source-watch entrypoints use the shared fatal handler", async () => {
  for (const path of ["scripts/importer/run.mjs", "scripts/schedule-audit.mjs", "scripts/source-watch.mjs"]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /failRun/);
    assert.match(source, /main\(\)\.catch\(failRun\)/, path + " must not swallow a fatal error");
  }
});
