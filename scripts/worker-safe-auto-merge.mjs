#!/usr/bin/env node
// Independent, narrowly scoped AUTOMERGE executor (not the coding worker).
// Only trusted main code runs; never executes PR-head code or GH CLI from PR.
import { appendFileSync } from "node:fs";
import { assess, githubGet, contractOf } from "./worker-merge-policy-report.mjs";

const REPO = "Wood468/crispy-barnacle";
const API = "https://api.github.com/repos/" + REPO;
const SHA = /^[a-f0-9]{40}$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function deny(reason) { return { status: "DENIED", reason }; }
export function eventOf(input) {
  if (!input || input.name !== "Tests" || input.event !== "pull_request"
      || input.status !== "completed" || input.conclusion !== "success"
      || !SHA.test(input.head_sha || "")
      || !/^worker\/review-[a-f0-9]{12}$/.test(input.head_branch || "")
      || !Number.isSafeInteger(input.id) || input.id <= 0
      || !Array.isArray(input.pull_requests) || input.pull_requests.length !== 1) {
    return null;
  }
  const p = input.pull_requests[0];
  if (!Number.isSafeInteger(p?.number) || p.number <= 0
      || p?.head?.sha !== input.head_sha) return null;
  return { number: p.number, sha: input.head_sha, runId: input.id };
}
// Trusted GitHub follow-up after an *already confirmed* automatic squash merge.
// No worker/Gemini authority is extended. All write targets and data are fixed
// by the earlier independent policy decision and exact merged commit SHA.
export async function finishMergedTask(taskNumber, mergeSha,
  { get, dispatch, closeIssue, removeLabel }) {
  const state = { issueClosed: false, mainTestsDispatched: false };
  if (!Number.isSafeInteger(taskNumber) || taskNumber < 1
      || !SHA.test(mergeSha || "")) return state;

  // Close only the original, still verifiably owner-approved task. Preserve
  // unrelated labels, remove the two worker approval flags permanently.
  try {
    const issue = await get(API + "/issues/" + taskNumber);
    if (issue?.number === taskNumber && ["open", "closed"].includes(issue.state)
        && issue?.user?.login?.toLowerCase() === "wood468"
        && issue?.title?.startsWith("[GO-WORKER] ")
        && contractOf(issue)
        && Array.isArray(issue.labels)
        && issue.labels.some(x => x?.name === "go-worker-approved")
        && issue.labels.some(x => x?.name === "go-worker-auto-merge-approved")) {
      // GitHub may already have closed the task from the squash commit's
      // "Closes #N" footer. Re-sending the close state together with labels
      // can be rejected; close only if still open.
      if (issue.state === "open") {
        const result = await closeIssue(API + "/issues/" + taskNumber, {
          state: "closed", state_reason: "completed"
        });
        if (result?.number !== taskNumber || result.state !== "closed")
          throw Error("Issue closure not confirmed");
      }
      // DELETE ONLY the two exact worker approval labels, preserving every
      // unrelated label. This is independent of whether auto-close occurred.
      const prefix = API + "/issues/" + taskNumber + "/labels/";
      for (const name of ["go-worker-approved", "go-worker-auto-merge-approved"]) {
        await removeLabel(prefix + name);
      }
      // A successful HTTP write is not sufficient: inspect durable state.
      const confirmed = await get(API + "/issues/" + taskNumber);
      state.issueClosed = confirmed?.number === taskNumber
        && confirmed.state === "closed"
        && Array.isArray(confirmed.labels)
        && !confirmed.labels.some(x => ["go-worker-approved",
          "go-worker-auto-merge-approved"].includes(x?.name));
    }
  } catch {
    // The merge is already immutable. Never conceal incomplete follow-up:
    // the result is marked pending and must be reconciled separately.
  }

  // A GITHUB_TOKEN merge doesn't trigger normal push workflows. Dispatch
  // Tests on the *exact* confirmed main commit, rather than relying on push.
  // If main has advanced, refuse to associate a different SHA with this merge.
  try {
    const main = await get(API + "/branches/main");
    if (main?.commit?.sha === mergeSha) {
      const response = await dispatch(API + "/actions/workflows/tests.yml/dispatches",
        { ref: "main" });
      state.mainTestsDispatched = response?.accepted === true;
    }
  } catch {
    // A read/API failure or unexpected dispatch result is NOT verification.
  }
  return state;
}

export async function execute(event, { get, graph, put, dispatch, closeIssue,
  removeLabel, wait = sleep, judge = assess }) {
  const record = eventOf(event);
  if (!record) return deny("Not one completed successful original worker PR CI run");
  let approval = await judge(record.number, get, {
    requireAutoMergeLabel: true, allowDraft: true
  });
  if (approval.status !== "AUTO_MERGE_ELIGIBLE"
      || approval.head !== record.sha || approval.ciRun !== record.runId) {
    return deny("No exact approved task, latest-head checks and independent policy eligibility");
  }

  const first = await get(API + "/pulls/" + record.number);
  if (!first || first.head?.sha !== record.sha || first.state !== "open"
      || first.mergeable !== true || first.base?.ref !== "main"
      || !SHA.test(first.base?.sha || "")
      || !/^[A-Za-z0-9_=-]+$/.test(first.node_id || "")) {
    return deny("PR changed or mergeability is unknown");
  }
  let promoted = false;
  if (first.draft === true) {
    // GraphQL inputs are parameters, never string interpolation of PR values.
    const payload = await graph("mutation ($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }",
      { id: first.node_id });
    if (payload?.errors?.length || payload?.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false)
      return deny("Draft promotion was not confirmed");
    promoted = true;
  } else if (first.draft !== false) {
    return deny("Unknown draft state");
  }

  // Re-check ALL trust data and GitHub state after the draft transition.
  // A changed head, new CI failure, revoked approval or code change on main
  // causes a deny. The final PUT also uses GitHub's atomic head SHA guard.
  for (let i = 0; i < (promoted ? 4 : 1); i++) {
    if (i) await wait(1500 * i);
    approval = await judge(record.number, get, {
      requireAutoMergeLabel: true, allowDraft: false
    });
    if (approval.status === "AUTO_MERGE_ELIGIBLE"
        && approval.head === record.sha && approval.ciRun === record.runId) break;
    if (i === (promoted ? 3 : 0)) return deny("Eligibility changed after promotion; no merge performed");
  }

  const last = await get(API + "/pulls/" + record.number);
  if (!last || last.state !== "open" || last.draft !== false
      || last.head?.sha !== record.sha || last.mergeable !== true
      || last.base?.ref !== "main" || last.base?.sha !== approval.base) {
    return deny("PR changed before atomic merge");
  }
  const merge = await put(API + "/pulls/" + record.number + "/merge", {
    sha: record.sha, merge_method: "squash",
    commit_title: "test(worker): safe approved regression (#" + record.number + ")",
    commit_message: "Closes #" + approval.task
      + "\n\nApproved test-only worker change. Full CI " + approval.ciRun
      + "; trusted GitHub policy rechecked exact head " + record.sha + "."
  });
  if (merge?.merged !== true || !SHA.test(merge.sha || ""))
    return deny("Merge not confirmed; inspect GitHub before replay");
  const next = await finishMergedTask(approval.task, merge.sha,
    { get, dispatch, closeIssue, removeLabel });
  return { status: next.issueClosed && next.mainTestsDispatched
      ? "MERGED" : "MERGED_FOLLOWUP_PENDING",
    pr: record.number, issue: approval.task, head: record.sha,
    mergeSha: merge.sha, ciRun: approval.ciRun, ...next };
}
async function request(url, method, body, token) {
  const allowed = (url === "https://api.github.com/graphql" && method === "POST")
    || (/^\/pulls\/[1-9][0-9]{0,9}\/merge$/.test(url.slice(API.length))
      && method === "PUT")
    || (url === API + "/actions/workflows/tests.yml/dispatches" && method === "POST")
    || (/^\/issues\/[1-9][0-9]{0,9}$/.test(url.slice(API.length))
      && method === "PATCH")
    || (/^\/issues\/[1-9][0-9]{0,9}\/labels\/(go-worker-approved|go-worker-auto-merge-approved)$/
      .test(url.slice(API.length)) && method === "DELETE");
  if (!allowed) throw Error("Forbidden write target");
  const response = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error("GitHub write rejected (safe-category)");
  if (response.status === 204 && method === "POST"
      && url === API + "/actions/workflows/tests.yml/dispatches") {
    return { accepted: true };
  }
  const raw = await response.text();
  if (raw.length > 30000) throw Error("GitHub write response too large");
  if (!raw && method === "DELETE") return { accepted: true };
  return JSON.parse(raw);
}
export async function run(input, token, dependencies = {}) {
  if (!token || !input || !input.head_sha || input.repository?.full_name !== REPO)
    return deny("Expected repository, signed event context or token missing");
  return execute(input, {
    get: dependencies.get || githubGet,
    graph: dependencies.graph || ((query, variables) =>
      request("https://api.github.com/graphql", "POST", { query, variables }, token)),
    put: dependencies.put || ((url, body) => request(url, "PUT", body, token)),
    dispatch: dependencies.dispatch || ((url, body) =>
      request(url, "POST", body, token)),
    closeIssue: dependencies.closeIssue || ((url, body) =>
      request(url, "PATCH", body, token)),
    removeLabel: dependencies.removeLabel || ((url) =>
      request(url, "DELETE", null, token)),
    wait: dependencies.wait,
    judge: dependencies.judge
  });
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const token = process.env.GITHUB_TOKEN;
  let outcome;
  try {
    const data = JSON.parse(process.env.WORKFLOW_RUN_EVENT || "{}");
    outcome = await run(data, token);
  } catch {
    // Never print exceptions, token, response bodies, PR content or raw URLs.
    outcome = deny("Unknown GitHub API, policy or merge failure");
  }
  const summary = "## GO Aider safe worker auto-merge\n\n"
    + "**Outcome:** " + outcome.status + "\n\n"
    + (outcome.reason ? outcome.reason : outcome.mergeSha
      ? "PR #" + outcome.pr + " merged " + outcome.mergeSha
        + " from exact tested head " + outcome.head + " and CI run " + outcome.ciRun
        + "\n\nSource task closed and approvals cleared: "
        + (outcome.issueClosed ? "yes" : "PENDING")
        + "\nFull post-merge main Tests workflow dispatched: "
        + (outcome.mainTestsDispatched ? "yes" : "PENDING")
      : "No merge attempted") + "\n";
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log("GO_WORKER_SAFE_AUTOMERGE=" + outcome.status);
  // Denied candidate is an expected condition; safe to exit zero.
}
