import test from "node:test";
import assert from "node:assert/strict";
import { waitForWorkersBuild, WORKERS_BUILD_CHECK_NAME } from "../scripts/wait-for-workers-build.mjs";

const check = (status, conclusion = null) => ({
  name: WORKERS_BUILD_CHECK_NAME,
  status,
  conclusion,
  external_id: "build-123",
  details_url: "https://dash.cloudflare.com/example/build-123"
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
