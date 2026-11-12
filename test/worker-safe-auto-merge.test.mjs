import test from "node:test";
import assert from "node:assert/strict";
import { execute, eventOf, run } from "../scripts/worker-safe-auto-merge.mjs";
import { assess } from "../scripts/worker-merge-policy-report.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MERGED = "c".repeat(40);
const API = "https://api.github.com/repos/Wood468/crispy-barnacle";
const original = () => ({
  name: "Tests", event: "pull_request", id: 901, status: "completed",
  conclusion: "success", head_sha: HEAD, head_branch: "worker/review-123abc456def",
  repository: { full_name: "Wood468/crispy-barnacle" },
  pull_requests: [{ number: 800, head: { sha: HEAD } }]
});
const approval = () => ({
  status: "AUTO_MERGE_ELIGIBLE", reasons: [], task: 777,
  prNumber: 800, head: HEAD, ciRun: 901, base: BASE
});
function harness(options = {}) {
  let draft = options.initialDraft ?? true;
  let issueState = options.issueAlreadyClosed ? "closed" : "open";
  let labels = options.issueRevoked
    ? [{ name: "go-worker-approved" }]
    : [{ name: "go-worker-approved" }, { name: "go-worker-auto-merge-approved" },
       { name: "independent-label" }];
  const actions = [];
  const pr = () => ({
    number: 800, state: "open", draft, mergeable: options.mergeable ?? true,
    head: { sha: options.head || HEAD, ref: "worker/review-123abc456def" },
    base: { ref: "main", sha: BASE },
    node_id: "PR_kwDOAAA"
  });
  const get = async url => {
    actions.push("GET:" + url);
    if (url === API + "/pulls/800") return pr();
    if (url === API + "/issues/777") return {
      number: 777, state: issueState, title: "[GO-WORKER] Test task",
      user: { login: "Wood468" }, labels,
      body: "GO_WORKER_TASK_JSON:" + JSON.stringify({
        path: "test/escape.test.mjs",
        instruction: "Append exactly one deterministic security regression to the existing test."
      })
    };
    if (url === API + "/branches/main") return {
      commit: { sha: options.mainChanged ? "d".repeat(40) : MERGED }
    };
    throw Error("Unexpected read call");
  };
  const graph = async (query, variables) => {
    actions.push("GRAPHQL");
    assert.match(query, /markPullRequestReadyForReview/);
    assert.equal(variables.id, "PR_kwDOAAA");
    if (options.graphFails) return { errors: [{ message: "denied" }] };
    draft = false;
    return { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } };
  };
  const put = async (url, body) => {
    actions.push("MERGE");
    assert.equal(url, API + "/pulls/800/merge");
    assert.equal(body.sha, HEAD, "GitHub must enforce exact tested head");
    assert.equal(body.merge_method, "squash");
    assert.match(body.commit_message, /Closes #777/);
    if (options.putFails) return { merged: false };
    return { merged: true, sha: MERGED };
  };
  const closeIssue = async (url, body) => {
    actions.push("CLOSE_ISSUE");
    assert.equal(url, API + "/issues/777");
    assert.deepEqual(body, { state: "closed", state_reason: "completed" });
    if (options.closeFails) throw Error("private GH response");
    issueState = "closed";
    return { number: 777, state: "closed", labels };
  };
  const removeLabel = async url => {
    actions.push("REMOVE_LABEL");
    const prefix = API + "/issues/777/labels/";
    assert.ok(url.startsWith(prefix));
    const name = url.slice(prefix.length);
    assert.ok(["go-worker-approved", "go-worker-auto-merge-approved"].includes(name));
    if (options.removeFails) throw Error("private GH response");
    labels = labels.filter(label => label.name !== name);
    return { accepted: true };
  };
  const dispatch = async (url, body) => {
    actions.push("DISPATCH_TESTS");
    assert.equal(url, API + "/actions/workflows/tests.yml/dispatches");
    assert.deepEqual(body, { ref: "main" });
    if (options.dispatchFails) throw Error("private GH response");
    return { accepted: true };
  };
  let checks = 0;
  const judge = async (number, getter, opts) => {
    checks++;
    assert.equal(number, 800);
    assert.equal(getter, get);
    assert.equal(opts.requireAutoMergeLabel, true);
    assert.equal(opts.allowDraft, checks === 1);
    if (options.denyFirst && checks === 1) return { status: "DENIED", reasons: ["no label"] };
    if (options.denySecond && checks > 1) return { status: "DENIED", reasons: ["revoked"] };
    return { ...approval(), ...(options.approval || {}) };
  };
  const wait = async () => {};
  return { get, graph, put, dispatch, closeIssue, removeLabel, judge, wait, actions,
    get checks() { return checks; } };
}

test("only one completed exact-head original Tests run is eligible for consideration", () => {
  assert.deepEqual(eventOf(original()), { number: 800, sha: HEAD, runId: 901 });
  for (const x of [
    { event: "push" }, { conclusion: "failure" }, { status: "in_progress" },
    { name: "CodeQL" }, { head_branch: "feature/injected" },
    { head_sha: "b".repeat(40) }, { pull_requests: [] },
    { pull_requests: [{ number: 800, head: { sha: HEAD } },
                      { number: 801, head: { sha: HEAD } }] },
    { pull_requests: [{ number: 800, head: { sha: "b".repeat(40) } }] }
  ]) {
    assert.equal(eventOf({ ...original(), ...x }), null);
  }
});

test("approved isolated draft is marked ready and merged with exact SHA independently", async () => {
  const h = harness();
  const outcome = await execute(original(), h);
  assert.deepEqual(outcome, {
    status: "MERGED", pr: 800, issue: 777, head: HEAD,
    mergeSha: MERGED, ciRun: 901, issueClosed: true,
    mainTestsDispatched: true
  });
  assert.equal(h.checks, 2);
  assert.equal(h.actions.filter(x => x === "GRAPHQL").length, 1);
  assert.equal(h.actions.filter(x => x === "MERGE").length, 1);
  assert.ok(h.actions.indexOf("GRAPHQL") < h.actions.indexOf("MERGE"));
  assert.ok(h.actions.indexOf("MERGE") < h.actions.indexOf("CLOSE_ISSUE"));
  assert.equal(h.actions.filter(x => x === "REMOVE_LABEL").length, 2);
  assert.ok(h.actions.indexOf("CLOSE_ISSUE") < h.actions.indexOf("REMOVE_LABEL"));
  assert.ok(h.actions.indexOf("MERGE") < h.actions.indexOf("DISPATCH_TESTS"));
});

test("already-ready PR merges without redundant draft promotion", async () => {
  const h = harness({ initialDraft: false });
  const answer = await execute(original(), h);
  assert.equal(answer.status, "MERGED");
  assert.ok(!h.actions.includes("GRAPHQL"));
});

test("bad approval, changed head, missing mergeability, stale run cannot merge", async () => {
  for (const opts of [
    { denyFirst: true }, { head: "b".repeat(40) },
    { mergeable: false }, { approval: { head: "b".repeat(40) } },
    { approval: { ciRun: 902 } }, { graphFails: true },
    { denySecond: true }, { putFails: true }
  ]) {
    const h = harness(opts);
    const answer = await execute(original(), h);
    assert.equal(answer.status, "DENIED");
    if (!opts.putFails) assert.ok(!h.actions.includes("MERGE"),
      "Unsafe input must never reach GitHub merge write");
  }
});

test("an invalid event or wrong repository cannot consume a merge token", async () => {
  const h = harness();
  const event = original(); event.repository.full_name = "attacker/fork";
  const denied = await run(event, "SENSITIVE_TOKEN", h);
  assert.equal(denied.status, "DENIED");
  assert.deepEqual(h.actions, []);
  const r = await execute({ ...original(), conclusion: "failure" }, h);
  assert.equal(r.status, "DENIED");
  assert.deepEqual(h.actions, []);
});

test("post-merge release follow-ups are independently verified, never assumed", async () => {
  for (const options of [
    { closeFails: true }, { issueRevoked: true }, { removeFails: true },
    { dispatchFails: true }, { mainChanged: true }
  ]) {
    const h = harness(options);
    const output = await execute(original(), h);
    assert.equal(output.status, "MERGED_FOLLOWUP_PENDING",
      "successful merge is distinct from post-merge cleanup");
    assert.equal(output.mergeSha, MERGED);
    assert.equal(output.issueClosed,
      !(options.closeFails || options.issueRevoked || options.removeFails));
    assert.equal(output.mainTestsDispatched, !(options.dispatchFails || options.mainChanged));
    if (options.mainChanged) assert.ok(!h.actions.includes("DISPATCH_TESTS"),
      "never dispatch tests for an unverified different main SHA");
  }
});

test("failed or unapproved merge must never close source issue or dispatch Tests", async () => {
  for (const options of [{ denyFirst: true }, { denySecond: true },
                         { putFails: true }, { graphFails: true }]) {
    const h = harness(options);
    const output = await execute(original(), h);
    assert.equal(output.status, "DENIED");
    assert.equal(h.actions.includes("CLOSE_ISSUE"), false);
    assert.equal(h.actions.includes("REMOVE_LABEL"), false);
    assert.equal(h.actions.includes("DISPATCH_TESTS"), false);
  }
});

test("squash auto-closed source task is not redundantly closed but labels are removed", async () => {
  const h = harness({ issueAlreadyClosed: true });
  const outcome = await execute(original(), h);
  assert.equal(outcome.status, "MERGED");
  assert.equal(outcome.issueClosed, true);
  assert.equal(h.actions.includes("CLOSE_ISSUE"), false);
  assert.equal(h.actions.filter(a => a === "REMOVE_LABEL").length, 2);
});

test("failed label cleanup on an auto-closed issue is not mistaken for success", async () => {
  const h = harness({ issueAlreadyClosed: true, removeFails: true });
  const outcome = await execute(original(), h);
  assert.equal(outcome.status, "MERGED_FOLLOWUP_PENDING");
  assert.equal(outcome.issueClosed, false);
  assert.equal(outcome.mainTestsDispatched, true);
});

test("source approval missing or revoked never becomes eligible in policy evaluator", async () => {
  // A fixture for the *actual* assessor, not just a mocked merge decision.
  const pr = {
    number: 800, state: "open", draft: true, mergeable: true,
    user: { login: "Wood468" }, body: "Source task: #777",
    head: { sha: HEAD, ref: "worker/review-123abc456def",
      repo: { full_name: "Wood468/crispy-barnacle" } },
    base: { ref: "main", sha: BASE }
  };
  const issue = {
    number: 777, state: "open", title: "[GO-WORKER] Test security",
    user: { login: "Wood468" },
    labels: [{ name: "go-worker-approved" }],
    body: "GO_WORKER_TASK_JSON:" + JSON.stringify({
      path: "test/escape.test.mjs",
      instruction: "Append a bounded deterministic regression to this test only."
    })
  };
  const file = [{ filename: "test/escape.test.mjs", status: "modified",
    changes: 5, patch: "@@ +1,5 @@" }];
  const run = {
    name: "Tests", event: "pull_request", id: 901, run_number: 5,
    head_sha: HEAD, status: "completed", conclusion: "success",
    pull_requests: [{ number: 800, head: { sha: HEAD }, base: { sha: BASE } }]
  };
  const jobs = ["javascript", "python", "browser (a)", "browser (b)",
    "browser (c)", "browser (d)", "browser (e)", "webkit"].map(name => ({
    name, status: "completed", conclusion: "success"
  }));
  const get = async url => {
    if (url.endsWith("/pulls/800")) return pr;
    if (url.endsWith("/issues/777")) return issue;
    if (url.includes("/pulls/800/files?")) return file;
    if (url.includes("/contents/test/escape.test.mjs?")) return {
      type: "file", size: 900, path: "test/escape.test.mjs"
    };
    if (url.includes("/actions/runs?")) return { total_count: 1, workflow_runs: [run] };
    if (url.includes("/actions/runs/901/jobs?")) return { total_count: 8, jobs };
    if (url.includes("/pulls/800/reviews?")) return [];
    if (url.includes("/pulls?state=open")) return [pr];
    throw Error("Unknown source");
  };
  const opts = { requireAutoMergeLabel: true, allowDraft: true };
  assert.equal((await assess(800, get, opts)).status, "DENIED",
    "Basic coding approval alone must never trigger auto-merge");
  issue.labels.push({ name: "go-worker-auto-merge-approved" });
  assert.equal((await assess(800, get, opts)).status, "AUTO_MERGE_ELIGIBLE");
  pr.base.ref = "feature";
  assert.equal((await assess(800, get, opts)).status, "DENIED");
});
