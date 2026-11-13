#!/usr/bin/env node
// REPORT ONLY. Never performs a GitHub write or authorizes a merge.
// This trusted-base script is executed by a read-only, no-PR-checkout workflow.
import { appendFileSync } from "node:fs";

const REPO = "Wood468/crispy-barnacle";
const API = "https://api.github.com/repos/" + REPO;
const SHA = /^[a-f0-9]{40}$/;
const BRANCH = /^worker\/review-[a-f0-9]{12}$/;
const TEST = /^test\/[A-Za-z0-9][A-Za-z0-9_.-]{0,100}\.test\.mjs$/;
const REQUIRED = ["javascript", "python", "browser (a)", "browser (b)",
  "browser (c)", "browser (d)", "browser (e)", "webkit"];
const SAFE_GENERATED = /^(?:data\/[A-Za-z0-9_.\/-]+\.json|public\/[^/]+\.json|infographics\.json|(?:docs\/)?[A-Za-z0-9_.\/-]+\.md)$/;

function deny(reason) { return { status: "DENIED", reasons: [reason] }; }
function exactMarker(body, expression) {
  if (typeof body !== "string" || body.length > 5000) return null;
  const matches = [...body.matchAll(expression)];
  return matches.length === 1 ? matches[0][1] : null;
}
export function contractOf(issue) {
  const raw = exactMarker(issue?.body, /^GO_WORKER_TASK_JSON:(\{[^\n]{1,2400}\})$/gm);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)
        || Object.keys(obj).sort().join(",") !== "instruction,path"
        || typeof obj.path !== "string" || !TEST.test(obj.path)
        || typeof obj.instruction !== "string"
        || obj.instruction.trim().length < 20 || obj.instruction.trim().length > 1500) return null;
    return obj;
  } catch { return null; }
}
export function scopeDecision(pr, issue, changed, baseFile, options = {}) {
  const reasons = [];
  const taskId = exactMarker(pr?.body, /^Source task: #([1-9][0-9]{0,9})$/gm);
  const source = contractOf(issue);
  if (!taskId || !source || String(issue?.number) !== taskId
      || issue?.title?.startsWith("[GO-WORKER] ") !== true
      || issue?.state !== "open" || issue?.user?.login?.toLowerCase() !== "wood468"
      || !Array.isArray(issue?.labels)
      || !issue.labels.some(label => label?.name === "go-worker-approved")) {
    reasons.push("Task identity, approval or single-file contract is invalid");
  }
  if (pr?.state !== "open"
      || (!options.allowDraft && pr?.draft !== false)
      || (pr?.draft !== true && pr?.draft !== false)
      || pr?.mergeable !== true) {
    reasons.push("PR is draft, closed or not independently mergeable");
  }
  // Explicit opt-in is attached to the OWNER-AUTHORED source issue,
  // never to PR metadata the coding worker can forge.
  if (options.requireAutoMergeLabel
      && !issue?.labels?.some(label => label?.name === "go-worker-auto-merge-approved")) {
    reasons.push("Source issue lacks explicit test-only automatic merge approval");
  }
  if (!BRANCH.test(pr?.head?.ref || "") || !SHA.test(pr?.head?.sha || "")
      || pr?.head?.repo?.full_name !== REPO || pr?.base?.ref !== "main"
      || !SHA.test(pr?.base?.sha || "") || pr?.user?.login?.toLowerCase() !== "wood468") {
    reasons.push("Worker PR branch, repository, author or exact commit is unverified");
  }
  if (!Array.isArray(changed) || changed.length !== 1 || !source
      || changed[0]?.filename !== source.path || changed[0]?.status !== "modified"
      || !Number.isInteger(changed[0]?.changes) || changed[0].changes < 1
      || changed[0].changes > 500 || typeof changed[0]?.patch !== "string"
      || changed[0].patch.length > 30_000 || changed[0]?.previous_filename) {
    reasons.push("Changes exceed one existing text-only flat test file");
  }
  if (baseFile?.type !== "file" || !source || baseFile?.path !== source.path
      || !Number.isInteger(baseFile?.size) || baseFile.size > 100_000) {
    reasons.push("Approved file was not an existing bounded regular test file");
  }
  return { status: reasons.length ? "DENIED" : "SCOPE_OK", reasons, taskId };
}
export function ciDecision(runs, jobs, pr) {
  if (!Array.isArray(runs) || !Array.isArray(jobs) || !pr) return deny("CI evidence missing");
  const eligible = runs.filter(run => run?.name === "Tests" && run?.event === "pull_request"
      && run.head_sha === pr.head.sha
      && run?.pull_requests?.some(p => p?.number === pr.number
        && p?.head?.sha === pr.head.sha));
  eligible.sort((a, b) => (b.run_number || 0) - (a.run_number || 0));
  const run = eligible[0];
  if (!run || run.status !== "completed" || run.conclusion !== "success")
    return deny("Latest-head full Tests workflow is not successful");
  const names = new Map();
  for (const job of jobs) {
    if (!job || typeof job.name !== "string" || names.has(job.name))
      return deny("CI job list is incomplete or ambiguous");
    names.set(job.name, job);
  }
  if (REQUIRED.some(name => names.get(name)?.conclusion !== "success"
      || names.get(name)?.status !== "completed")) {
    return deny("One or more mandatory JS, Python, Chromium or WebKit checks did not pass");
  }
  const evidence = run.pull_requests.find(p => p.number === pr.number)?.base?.sha;
  if (!SHA.test(evidence || "")) return deny("CI base commit could not be verified");
  return { status: "CI_OK", reasons: [], runId: run.id, testedBase: evidence };
}
export function reviewDecision(reviews, pr) {
  if (!Array.isArray(reviews)) return deny("Independent review history missing");
  const latest = new Map();
  for (const review of reviews) {
    if (!review?.user?.login || !["APPROVED", "CHANGES_REQUESTED", "DISMISSED",
        "COMMENTED"].includes(review.state)) continue;
    latest.set(review.user.login.toLowerCase(), review);
  }
  if ([...latest.values()].some(review => review.state === "CHANGES_REQUESTED"))
    return deny("A reviewer requested changes");
  const approved = [...latest.values()].some(review => review.state === "APPROVED"
    && review.commit_id === pr.head.sha
    && review.user.login.toLowerCase() !== pr.user.login.toLowerCase());
  return approved ? { status: "REVIEW_OK", reasons: [] }
    : deny("No independent latest-head approval (worker cannot approve itself)");
}
async function pages(get, url, maxPages, perPage, validate = () => true, collection = null) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const response = await get(url + (url.includes("?") ? "&" : "?")
      + "per_page=" + perPage + "&page=" + page);
    const data = collection ? response?.[collection] : response;
    if (!Array.isArray(data) || data.length > perPage || !data.every(validate)
        || (collection && (!Number.isInteger(response?.total_count)
          || response.total_count > maxPages * perPage)))
      throw Error("Incomplete GitHub pagination");
    all.push(...data);
    if (data.length < perPage) {
      if (collection && all.length !== response.total_count)
        throw Error("GitHub returned a truncated collection");
      return all;
    }
  }
  throw Error("GitHub pagination exceeded policy cap");
}
export async function assess(prNumber, get, options = {}) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1 || prNumber > 999999999)
    return deny("Invalid PR identifier");
  try {
    const pr = await get(API + "/pulls/" + prNumber);
    if (!pr || pr.number !== prNumber || !pr.head || !pr.base)
      return deny("PR metadata unavailable");
    if (!BRANCH.test(pr.head.ref || "")) return { status: "NOT_APPLICABLE", reasons: [] };
    const taskId = exactMarker(pr.body, /^Source task: #([1-9][0-9]{0,9})$/gm);
    if (!taskId) return deny("PR has no single original source task");
    const issue = await get(API + "/issues/" + taskId);
    const files = await pages(get, API + "/pulls/" + prNumber + "/files", 3, 100,
      f => !!f && typeof f.filename === "string");
    const source = contractOf(issue);
    const regular = source ? await get(API + "/contents/" + source.path
      + "?ref=" + pr.base.sha) : null;
    const scope = scopeDecision(pr, issue, files, regular, options);
    if (scope.reasons.length) return scope;

    const allRuns = await pages(get, API + "/actions/runs?head_sha="
      + pr.head.sha, 2, 100, r => !!r && Number.isInteger(r.id), "workflow_runs");
    const candidate = allRuns.filter(r => r.name === "Tests" && r.event === "pull_request"
      && r.head_sha === pr.head.sha
      && r.pull_requests?.some(p => p?.number === pr.number
        && p?.head?.sha === pr.head.sha))
      .sort((a, b) => b.run_number - a.run_number)[0];
    const jobs = candidate ? await pages(get, API + "/actions/runs/" + candidate.id
      + "/jobs", 3, 100, j => !!j && typeof j.name === "string", "jobs") : [];
    const ci = ciDecision(allRuns, jobs, pr);
    if (ci.reasons.length) return ci;

    // A code-changing main update after this PR was tested invalidates CI.
    // Generated-data-only movement is tolerated but never bypasses other gates.
    if (ci.testedBase !== pr.base.sha) {
      const comparison = await get(API + "/compare/" + ci.testedBase + "..." + pr.base.sha);
      if (!comparison || comparison.status !== "ahead"
          || !Array.isArray(comparison.files)
          || comparison.files.length > 299 || !comparison.files.every(f =>
            typeof f?.filename === "string" && SAFE_GENERATED.test(f.filename))) {
        return deny("Main changed materially since the validated CI base commit");
      }
    }

    const reviews = await pages(get, API + "/pulls/" + prNumber + "/reviews", 3, 100);
    const review = options.requireAutoMergeLabel
      ? ([...reviews].some(r => r?.state === "CHANGES_REQUESTED")
        ? deny("A reviewer requested changes: never override rejection")
        : { status: "REVIEW_OK", reasons: [] })
      : reviewDecision(reviews, pr);
    if (review.reasons.length) return review;

    // Avoid merging into another simultaneously active PR editing this test.
    const active = await pages(get, API + "/pulls?state=open", 5, 100,
      p => !!p && Number.isInteger(p.number));
    for (const other of active) {
      if (other.number === prNumber) continue;
      const otherFiles = await pages(get, API + "/pulls/" + other.number + "/files",
        3, 100, f => !!f && typeof f.filename === "string");
      if (otherFiles.some(f => f.filename === source.path))
        return deny("Another open pull request edits the approved file");
    }
    return { status: options.requireAutoMergeLabel
        ? "AUTO_MERGE_ELIGIBLE" : "ELIGIBLE_REPORT_ONLY",
      reasons: [], prNumber, head: pr.head.sha, task: Number(taskId),
      ciRun: ci.runId, base: pr.base.sha };
  } catch {
    // The full exception may contain privileged HTTP request context.
    return deny("Unable to verify all required GitHub evidence");
  }
}
export async function githubGet(url) {
  if (!url.startsWith(API + "/")) throw Error("Invalid read target");
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw Error("No read-only token");
  const res = await fetch(url, { headers: {
    Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw Error("GitHub read unavailable");
  const body = await res.text();
  if (body.length > 1_000_000) throw Error("Response too large");
  return JSON.parse(body);
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const number = Number(process.env.POLICY_PR_NUMBER);
  const decision = process.env.GITHUB_REPOSITORY === REPO
    ? await assess(number, githubGet)
    : deny("Unexpected repository");
  const lines = ["## GO Aider worker merge eligibility — REPORT ONLY",
    "", "**Decision:** " + decision.status,
    "", "**This result cannot merge, approve, block or deploy a PR.**",
    "", ...decision.reasons.map(reason => "- " + reason),
    ...(decision.ciRun ? ["", "Latest tested head: " + decision.head,
      "Full CI run: " + decision.ciRun] : [])];
  const summary = lines.join("\n") + "\n";
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log("GO_WORKER_REPORT_ONLY=" + decision.status);
  // All policy denials intentionally exit zero. This job is NOT a merge gate.
}
