import test from "node:test";
import assert from "node:assert/strict";
import {
  contractOf, scopeDecision, ciDecision, reviewDecision, assess
} from "../scripts/worker-merge-policy-report.mjs";

const SHA = "a".repeat(40);
const BASE = "b".repeat(40);
const OLDER = "c".repeat(40);
const PATH = "test/escape.test.mjs";
const body = "GO_WORKER_TASK_JSON:" + JSON.stringify({
  path: PATH, instruction: "Add an isolated deterministic escape regression, without editing source."
});
const issue = () => ({
  number: 777, title: "[GO-WORKER] Safe event label regression",
  state: "open", body, labels: [{ name: "go-worker-approved" }],
  user: { login: "Wood468" }
});
const pr = () => ({
  number: 800, state: "open", draft: false, mergeable: true,
  body: "Source task: #777", user: { login: "Wood468" },
  head: { sha: SHA, ref: "worker/review-123abc456def",
    repo: { full_name: "Wood468/crispy-barnacle" } },
  base: { ref: "main", sha: BASE }
});
const changed = () => [{
  filename: PATH, status: "modified", changes: 6, patch: "@@ +1,6 @@"
}];
const baseFile = () => ({ path: PATH, type: "file", size: 900 });
const names = ["javascript", "python", "browser (a)", "browser (b)",
  "browser (c)", "browser (d)", "browser (e)", "webkit"];
const run = () => ({
  id: 111, name: "Tests", event: "pull_request",
  run_number: 1, status: "completed", conclusion: "success", head_sha: SHA,
  pull_requests: [{ number: 800, head: { sha: SHA }, base: { sha: BASE } }]
});
const jobs = () => names.map(name => ({ name, status: "completed", conclusion: "success" }));
const reviews = () => [{
  user: { login: "IndependentReviewer" }, state: "APPROVED", commit_id: SHA
}];

test("contract only accepts the exact original approved single test file contract", () => {
  assert.equal(contractOf(issue()).path, PATH);
  const bad = issue();
  bad.body = "GO_WORKER_TASK_JSON:" + JSON.stringify({
    paths: [PATH, "public/lib.js"], instruction: "Change both files."
  });
  assert.equal(contractOf(bad), null);
  bad.body = body + "\n" + body;
  assert.equal(contractOf(bad), null);
  bad.body = "GO_WORKER_TASK_JSON:" + JSON.stringify({
    path: "public/lib.js", instruction: "Do whatever you want."
  });
  assert.equal(contractOf(bad), null);
});

test("strict worker branch, owner approval, existing text file and path restrictions", () => {
  assert.equal(scopeDecision(pr(), issue(), changed(), baseFile()).status, "SCOPE_OK");
  const i = issue(); i.labels = [];
  assert.equal(scopeDecision(pr(), i, changed(), baseFile()).status, "DENIED");
  const p = pr(); p.draft = true;
  assert.equal(scopeDecision(p, issue(), changed(), baseFile()).status, "DENIED");
  p.draft = false; p.head.ref = "feature/free-write";
  assert.equal(scopeDecision(p, issue(), changed(), baseFile()).status, "DENIED");
  p.head.ref = "worker/review-123abc456def"; p.head.repo.full_name = "untrusted/fork";
  assert.equal(scopeDecision(p, issue(), changed(), baseFile()).status, "DENIED");
  const f = changed(); f[0].filename = ".github/workflows/deploy.yml";
  assert.equal(scopeDecision(pr(), issue(), f, baseFile()).status, "DENIED");
  const other = changed(); other.push({ filename: "test/another.test.mjs", status: "added" });
  assert.equal(scopeDecision(pr(), issue(), other, baseFile()).status, "DENIED");
  const binary = changed(); delete binary[0].patch;
  assert.equal(scopeDecision(pr(), issue(), binary, baseFile()).status, "DENIED");
  assert.equal(scopeDecision(pr(), issue(), changed(),
    { path: PATH, type: "symlink", size: 50 }).status, "DENIED");
});

test("mandatory CI is independently verified for latest exact head", () => {
  assert.equal(ciDecision([run()], jobs(), pr()).status, "CI_OK");
  const j = jobs(); j.find(x => x.name === "webkit").conclusion = "failure";
  assert.equal(ciDecision([run()], j, pr()).status, "DENIED");
  const r = run(); r.head_sha = OLDER;
  assert.equal(ciDecision([r], jobs(), pr()).status, "DENIED");
  const newer = run(); newer.run_number = 2; newer.conclusion = "failure";
  assert.equal(ciDecision([run(), newer], jobs(), pr()).status, "DENIED");
  const missing = jobs().filter(x => x.name !== "browser (c)");
  assert.equal(ciDecision([run()], missing, pr()).status, "DENIED");
});

test("no worker self-review, stale review or outstanding changes-requested", () => {
  assert.equal(reviewDecision(reviews(), pr()).status, "REVIEW_OK");
  const self = [{ ...reviews()[0], user: { login: "Wood468" } }];
  assert.equal(reviewDecision(self, pr()).status, "DENIED");
  const old = [{ ...reviews()[0], commit_id: OLDER }];
  assert.equal(reviewDecision(old, pr()).status, "DENIED");
  const rejected = [...reviews(), {
    user: { login: "AnotherReviewer" }, state: "CHANGES_REQUESTED", commit_id: SHA
  }];
  assert.equal(reviewDecision(rejected, pr()).status, "DENIED");
});

function fixtures(overrides = {}) {
  const proposal = { ...pr(), ...(overrides.pr || {}) };
  const task = { ...issue(), ...(overrides.issue || {}) };
  const fileList = overrides.files || changed();
  const oldCI = { ...run(), ...(overrides.run || {}) };
  const checks = overrides.jobs || jobs();
  const opinions = overrides.reviews || reviews();
  const active = overrides.active || [proposal];
  const compare = overrides.compare || {
    status: "ahead", files: [{ filename: "data/store-state.json" }]
  };
  const calls = [];
  const get = async (url) => {
    calls.push(url);
    if (overrides.failOn && url.includes(overrides.failOn)) throw Error("A_SECRET_TOKEN");
    if (url.endsWith("/pulls/800")) return proposal;
    if (url.endsWith("/issues/777")) return task;
    if (url.includes("/pulls/800/files?")) return fileList;
    if (url.includes("/contents/" + PATH + "?")) return baseFile();
    if (url.includes("/actions/runs?")) return {
      total_count: 1, workflow_runs: [oldCI]
    };
    if (url.includes("/actions/runs/111/jobs?")) return {
      total_count: checks.length, jobs: checks
    };
    if (url.includes("/compare/")) return compare;
    if (url.includes("/pulls/800/reviews?")) return opinions;
    if (url.includes("/pulls?state=open&")) return active;
    if (url.includes("/pulls/801/files?")) return overrides.otherFiles || changed();
    throw Error("Fixture URL was not expected: " + url);
  };
  return { get, calls };
}

test("end-to-end report permits one exact reviewed green head, without writing anything", async () => {
  const f = fixtures();
  const result = await assess(800, f.get);
  assert.equal(result.status, "ELIGIBLE_REPORT_ONLY");
  assert.equal(result.head, SHA);
  assert.equal(result.ciRun, 111);
  assert.ok(f.calls.every(url => url.startsWith("https://api.github.com/repos/Wood468/crispy-barnacle/")));
});

test("missing review, failed checks and changed contracts always deny", async () => {
  for (const f of [
    fixtures({ reviews: [] }),
    fixtures({ jobs: [{ ...jobs()[0], conclusion: "failure" }, ...jobs().slice(1)] }),
    fixtures({ issue: { body: "GO_WORKER_TASK_JSON:{}" } }),
    fixtures({ pr: { draft: true } }),
    fixtures({ failOn: "/issues/777" }),
  ]) {
    const answer = await assess(800, f.get);
    assert.equal(answer.status, "DENIED");
    assert.equal(JSON.stringify(answer).includes("A_SECRET_TOKEN"), false);
  }
});

test("main movement is tolerated only for generated data, never code", async () => {
  const safe = fixtures({ run: {
    pull_requests: [{ number: 800, head: { sha: SHA }, base: { sha: OLDER } }]
  } });
  assert.equal((await assess(800, safe.get)).status, "ELIGIBLE_REPORT_ONLY");
  const changedCode = fixtures({ run: {
    pull_requests: [{ number: 800, head: { sha: SHA }, base: { sha: OLDER } }]
  }, compare: { status: "ahead", files: [{ filename: "public/app.js" }] } });
  assert.equal((await assess(800, changedCode.get)).status, "DENIED");
});

test("active conflicting PR and incomplete CI pagination fail closed", async () => {
  const other = { number: 801 };
  assert.equal((await assess(800, fixtures({ active: [pr(), other] }).get)).status, "DENIED");
  const empty = fixtures();
  const get = async url => {
    const value = await empty.get(url);
    if (url.includes("/actions/runs?")) return { ...value, total_count: 2 };
    return value;
  };
  assert.equal((await assess(800, get)).status, "DENIED");
});
