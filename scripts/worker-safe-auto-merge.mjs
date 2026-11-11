#!/usr/bin/env node
// Independent, narrowly scoped AUTOMERGE executor (not the coding worker).
// Only trusted main code runs; never executes PR-head code or GH CLI from PR.
import { appendFileSync } from "node:fs";
import { assess, githubGet } from "./worker-merge-policy-report.mjs";

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
export async function execute(event, { get, graph, put, wait = sleep, judge = assess }) {
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
  return { status: "MERGED", pr: record.number, issue: approval.task,
    head: record.sha, mergeSha: merge.sha, ciRun: approval.ciRun };
}
async function request(url, method, body, token) {
  if (!(url === "https://api.github.com/graphql" || url.startsWith(API + "/pulls/")))
    throw Error("Forbidden write target");
  const response = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error("GitHub write rejected (safe-category)");
  const raw = await response.text();
  if (raw.length > 30000) throw Error("GitHub write response too large");
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
    + (outcome.reason ? outcome.reason : outcome.status === "MERGED"
      ? "PR #" + outcome.pr + " merged " + outcome.mergeSha
        + " from exact tested head " + outcome.head + " and CI run " + outcome.ciRun
      : "No merge attempted") + "\n";
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log("GO_WORKER_SAFE_AUTOMERGE=" + outcome.status);
  // Denied candidate is an expected condition; safe to exit zero.
}
