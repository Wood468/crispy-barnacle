import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Offline: curl and aws are stubs on PATH. Nothing here touches Cloudflare and no real secret is used.
const SCRIPT = fileURLToPath(new URL("../scripts/r2-sync.sh", import.meta.url));
function run(mode, { verify, awsExit = 0, env = {} }) {
  const root = mkdtempSync(join(tmpdir(), "r2sync-")), bin = join(root, "bin"), work = join(root, "work");
  mkdirSync(bin); mkdirSync(join(work, "public", "infographics"), { recursive: true });
  const stub = (name, body) => { writeFileSync(join(bin, name), "#!/bin/bash\n" + body + "\n"); chmodSync(join(bin, name), 0o755); };
  // verify: an array of replies, one per call; the last repeats
  writeFileSync(join(root, "replies"), verify.join("\n"));
  stub("curl", `n=$(cat "${root}/calls" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${root}/calls"; r=$(sed -n "$((n>$(wc -l < "${root}/replies")+1?$(wc -l < "${root}/replies")+1:n))p" "${root}/replies"); echo "$r"`);
  stub("aws", `echo "$@" >> "${root}/aws"; exit ${awsExit}`);
  const r = spawnSync("bash", [SCRIPT, mode], { cwd: work, encoding: "utf8", timeout: 30000, env: { PATH: bin + ":" + process.env.PATH, HOME: root, CLOUDFLARE_API_TOKEN: "dummy-token", CLOUDFLARE_ACCOUNT_ID: "dummy-account", R2_ONLY: "infographics", R2_VERIFY_RETRY_DELAY: "0", ...env } });
  const read = f => existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : "";
  const res = { status: r.status, out: r.stdout + r.stderr, calls: Number(read("calls") || 0), aws: read("aws") };
  rmSync(root, { recursive: true, force: true }); return res;
}
const OK = '{"success":true,"result":{"id":"abc123","status":"active"}}', BAD = '{"success":false,"errors":[{"code":500,"message":"unhandled server error"}],"result":null}';

test("save FAILS when the token check keeps failing, and uploads nothing (so data pointing at the pictures is not committed)", () => {
  const r = run("save", { verify: [BAD] });
  assert.equal(r.status, 1); assert.equal(r.calls, 3); assert.equal(r.aws, "");
  assert.match(r.out, /pictures NOT saved/);
});
test("save survives one transient token-check error by retrying", () => {
  const r = run("save", { verify: [BAD, OK] });
  assert.equal(r.status, 0); assert.equal(r.calls, 2); assert.match(r.aws, /s3 sync public\/infographics s3:\/\/go-field-notes-images\/infographics/); assert.match(r.out, /R2 save done/);
});
test("restore keeps its old behaviour on a persistent token-check failure: warn and carry on", () => {
  const r = run("restore", { verify: [BAD] });
  assert.equal(r.status, 0); assert.equal(r.aws, ""); assert.match(r.out, /token check failed/);
});
test("a failed upload still fails the save; no credentials still skips quietly (forks, local runs)", () => {
  assert.equal(run("save", { verify: [OK], awsExit: 1 }).status, 1);
  const none = run("save", { verify: [OK], env: { CLOUDFLARE_API_TOKEN: "" } });
  assert.equal(none.status, 0); assert.match(none.out, /R2 sync skipped/); assert.equal(none.calls, 0);
});
test("the token value is never printed", () => {
  const r = run("save", { verify: [BAD] }); assert.doesNotMatch(r.out, /dummy-token/);
});
