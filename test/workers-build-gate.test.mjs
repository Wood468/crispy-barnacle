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
    fetchImpl: async url => url.includes("api.github.com") ? sequence.shift() : new Response("live-differs"),
    readLocal: () => Buffer.from("local"),
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

// Real payloads recorded from the API for main merge commits 6da8e65 (#373) and 34ea8bd (#374):
// Cloudflare reported only a completed preview-style check, never a /production/builds/ URL.
import { readFileSync } from "node:fs";
import { productionServesCommit } from "../scripts/wait-for-workers-build.mjs";
const recorded = sha => JSON.parse(readFileSync(new URL(`./fixtures/workers-check-runs-${sha}.json`, import.meta.url), "utf8"));
const bytesResponse = body => new Response(body, { status: 200 });

for (const sha of ["6da8e65", "34ea8bd"]) {
  test(`recorded ${sha} payload: preview-only is not accepted by itself`, async () => {
    let now = 0;
    await assert.rejects(waitForWorkersBuild(context({
      timeoutMs: 30,
      fetchImpl: async url => url.includes("api.github.com") ? new Response(JSON.stringify(recorded(sha))) : bytesResponse("old"),
      readLocal: () => Buffer.from("new"),
      sleep: async ms => { now += ms; },
      now: () => now
    })), /only a preview build is reported.*differs from this commit/);
  });

  test(`recorded ${sha} payload: accepted once production serves this commit's sw.js and shell`, async () => {
    let now = 0;
    let liveReady = false;
    const result = await waitForWorkersBuild(context({
      timeoutMs: 1000,
      fetchImpl: async url => {
        if (url.includes("api.github.com")) return new Response(JSON.stringify(recorded(sha)));
        return bytesResponse(liveReady ? "same" : "old");
      },
      readLocal: () => Buffer.from("same"),
      sleep: async ms => { now += ms; liveReady = now >= 20; },
      now: () => now
    }));
    assert.equal(result.verifiedBy, "content");
    assert.equal(result.buildId, null);
  });
}

test("content proof is not attempted when the preview check has not completed successfully", async () => {
  let now = 0;
  let liveCalls = 0;
  await assert.rejects(waitForWorkersBuild(context({
    timeoutMs: 20,
    fetchImpl: async url => {
      if (url.includes("api.github.com")) return response([check("completed", "failure", previewUrl, "p")]);
      liveCalls += 1;
      return bytesResponse("same");
    },
    readLocal: () => Buffer.from("same"),
    sleep: async ms => { now += ms; },
    now: () => now
  })), /only a preview build/);
  assert.equal(liveCalls, 0);
});

test("productionServesCommit reports HTTP errors and network failures as no match", async () => {
  const http = await productionServesCommit({ fetchImpl: async () => new Response("", { status: 503 }), readLocal: () => Buffer.from("x") });
  assert.equal(http.match, false);
  const net = await productionServesCommit({ fetchImpl: async () => { throw new Error("boom"); }, readLocal: () => Buffer.from("x") });
  assert.match(net.reason, /boom/);
});
