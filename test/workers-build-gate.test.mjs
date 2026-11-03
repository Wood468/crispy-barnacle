import test from "node:test";
import assert from "node:assert/strict";
import { waitForWorkersBuild, WORKERS_BUILD_CHECK_NAME, DEFAULT_WORKERS_BUILD_TIMEOUT_MS } from "../scripts/wait-for-workers-build.mjs";

const productionUrl = "https://dash.cloudflare.com/123/workers/services/view/go-field-notes/production/builds/build-123";
const previewUrl = "https://dash.cloudflare.com/123/workers/services/view/go-field-notes/production/previews/feature-branch/builds/preview-123";
const check = (status, conclusion = null, details_url = productionUrl, external_id = "build-123") => ({
  name: WORKERS_BUILD_CHECK_NAME,
  status,
  conclusion,
  external_id,
  details_url
});
const response = (checkRuns, status = 200) => new Response(
  JSON.stringify({ check_runs: checkRuns }),
  { status, headers: { "content-type": "application/json" } }
);
const context = (overrides = {}) => ({
  repository: "Wood468/crispy-barnacle",
  sha: "a".repeat(40),
  token: "test-token",
  timeoutMs: 100,
  pollIntervalMs: 10,
  ...overrides
});

test("production gate waits for the matching Cloudflare build and returns its build ID", async () => {
  const sequence = [
    response([]),
    response([check("in_progress")]),
    response([check("completed", "success")])
  ];
  let now = 0;
  let calls = 0;
  const result = await waitForWorkersBuild(context({
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.match(url, /\/commits\/[a]{40}\/check-runs/);
      assert.equal(init.headers.Authorization, "Bearer test-token");
      assert.equal(init.headers.Accept, "application/vnd.github+json");
      return sequence.shift();
    },
    sleep: async ms => { now += ms; },
    now: () => now
  }));
  assert.equal(calls, 3);
  assert.equal(result.buildId, "build-123");
  assert.match(result.detailsUrl, /build-123$/);
});

test("production gate ignores a successful preview and waits for the production build", async () => {
  const preview = check("completed", "success", previewUrl, "preview-123");
  const sequence = [
    response([preview]),
    response([preview, check("in_progress")]),
    response([preview, check("completed", "success")])
  ];
  let now = 0;
  const result = await waitForWorkersBuild(context({
    fetchImpl: async () => sequence.shift(),
    sleep: async ms => { now += ms; },
    now: () => now
  }));
  assert.equal(result.buildId, "build-123");
  assert.equal(result.detailsUrl, productionUrl);
});

test("production gate does not accept a preview-only success", async () => {
  let now = 0;
  await assert.rejects(
    waitForWorkersBuild(context({
      timeoutMs: 20,
      fetchImpl: async () => response([check("completed", "success", previewUrl, "preview-123")]),
      sleep: async ms => { now += ms; },
      now: () => now
    })),
    /only a preview build is reported; waiting for a production build/
  );
});

test("production gate fails closed when the matching Cloudflare build fails", async () => {
  await assert.rejects(
    waitForWorkersBuild(context({
      fetchImpl: async () => response([check("completed", "failure")]),
      sleep: async () => {},
      now: () => 0
    })),
    /Cloudflare Workers production build.*finished with failure/
  );
});

test("production gate retries transient GitHub API errors", async () => {
  let now = 0;
  let calls = 0;
  const result = await waitForWorkersBuild(context({
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response([], 503)
        : response([check("completed", "success")]);
    },
    sleep: async ms => { now += ms; },
    now: () => now
  }));
  assert.equal(calls, 2);
  assert.equal(result.buildId, "build-123");
});

test("production gate times out when Cloudflare never reports a build", async () => {
  let now = 0;
  await assert.rejects(
    waitForWorkersBuild(context({
      timeoutMs: 20,
      fetchImpl: async () => response([]),
      sleep: async ms => { now += ms; },
      now: () => now
    })),
    /Timed out waiting.*Cloudflare Workers build check has not appeared/
  );
});


test("default production gate allows a delayed Cloudflare build queue", async () => {
  let now = 0;
  let calls = 0;
  const result = await waitForWorkersBuild({
    repository: "Wood468/crispy-barnacle",
    sha: "a".repeat(40),
    token: "test-token",
    pollIntervalMs: 60_000,
    fetchImpl: async () => {
      calls += 1;
      return calls === 10
        ? response([check("completed", "success")])
        : response([]);
    },
    sleep: async ms => { now += ms; },
    now: () => now
  });
  assert.equal(DEFAULT_WORKERS_BUILD_TIMEOUT_MS, 15 * 60 * 1000);
  assert.equal(calls, 10);
  assert.equal(now, 9 * 60 * 1000);
  assert.equal(result.buildId, "build-123");
});
