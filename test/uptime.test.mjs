import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractCoreAssetUrls, runChecks, previousLiveCheckConclusion, containsPrivateDiscordSource, equivalentEventDetails } from "../scripts/uptime.mjs";

const EXPECTED_EVENT_DETAILS = JSON.parse(
  readFileSync(new URL("../public/event-details.json", import.meta.url), "utf8")
);

const HTML = [
  "<html><head>",
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk">',
  '<link rel="stylesheet" href="/styles.css?v=1">',
  '<link rel="stylesheet" href="/dash.css?v=2">',
  '<link rel="preload" href="/dash.js?v=4" as="script">',
  "</head><body>",
  '<script src="/lib.js?v=3"></script>',
  '<script src="/app.js?v=5"></script>',
  '<script src="/pwa.js"></script>',
  "</body></html>"
].join("");

const SERVICE_WORKER = `const SHELL_CACHE = 'gofn-shell-v1';
const SHELL_URLS = [
  '/styles.css?v=1', '/dash.css?v=2', '/dash.js?v=4',
  '/lib.js?v=3', '/app.js?v=5', '/pwa.js', '/review.js?v=6'
];`;

const ASSET_PATHS = new Set([
  "/styles.css", "/dash.css", "/dash.js", "/lib.js",
  "/app.js", "/pwa.js", "/review.js"
]);

const ok = (body, type = "application/json") => new Response(
  typeof body === "string" ? body : JSON.stringify(body),
  { status: 200, headers: { "content-type": type } }
);

function mockFetch(options = {}) {
  return async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || "GET";
    const path = url.pathname;
    if (path === "/") return ok(HTML, "text/html");
    if (path === "/sw.js") return ok(options.serviceWorker || SERVICE_WORKER, "application/javascript");
    if (path === "/data.json") return ok({ events: [{ id: "event-1" }] });
    if (path === "/world-events.json") return ok({ events: [] });
    if (path === "/prices.json") return ok({});
    if (path === "/event-details.json") {
      const catalogue = options.mismatchedDetails ? structuredClone(EXPECTED_EVENT_DETAILS) : EXPECTED_EVENT_DETAILS;
      if (options.mismatchedDetails) {
        const first = Object.keys(catalogue.events)[0];
        catalogue.events[first].name = "Incorrect unsourced event";
      }
      return ok(catalogue);
    }

    const privateLink = "https://discord.com/channels/@me/111/222";
    if (path === "/event-info.json") return ok({ events: {
      fixture: { source: { label: "G47IX", ...(options.privateFile === "event-info" ? { url: privateLink } : {}) },
        infographics: [{ url: "/infographics/a.png", source: "G47IX" }] }
    } });
    if (path === "/weekly.json") return ok({ items: [{ image: "/infographics/a.png",
      ...(options.privateFile === "weekly" ? { post: privateLink } : {}) }] });
    if (path === "/infographic-queue.json") return ok({ items: options.privateFile === "queue"
      ? [{ image: "/infographics/a.png", post: privateLink }] : [] });
    if (path === "/infographics/a.png") {
      return options.r2Status && options.r2Status !== 200
        ? new Response("", { status: options.r2Status })
        : ok("image", "image/png");
    }
    if (ASSET_PATHS.has(path)) {
      if (options.missingAsset === path) return new Response(null, { status: 404 });
      if (method === "HEAD" && options.headUnsupported) return new Response(null, { status: 405 });
      const type = options.badMime && options.badMime.path === path
        ? options.badMime.type
        : path.endsWith(".css") ? "text/css" : "application/javascript";
      return new Response(method === "HEAD" ? null : "asset", {
        status: 200,
        headers: { "content-type": type }
      });
    }
    return new Response("", { status: 404 });
  };
}

async function withFetch(options, fn) {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = mockFetch(options);
    await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("core assets match the homepage and exact offline-shell versions", () => {
  const result = extractCoreAssetUrls(HTML, SERVICE_WORKER);
  assert.equal(result.cacheName, "gofn-shell-v1");
  assert.deepEqual(result.assets, [
    "/styles.css?v=1", "/dash.css?v=2", "/app.js?v=5",
    "/dash.js?v=4", "/lib.js?v=3", "/pwa.js", "/review.js?v=6", "/sw.js"
  ]);
});

test("privacy scanner rejects disguised Discord channel links without confusing public sources", () => {
  assert.equal(containsPrivateDiscordSource({ event: {
    source: { url: "https://ptb.discord.com/%63hannels/111/222" }
  } }), true);
  assert.equal(containsPrivateDiscordSource({ source: { url: "https://discord.com/invite/sample" },
    infographics: [{ url: "/infographics/a.png", source: "G47IX" }] }), false);
});

test("live uptime check fails closed on private links in each public infographic feed", async () => {
  for (const privateFile of ["event-info", "queue", "weekly"]) {
    await withFetch({ privateFile }, async () => {
      const problems = await runChecks();
      assert.equal(problems.length, 1, privateFile);
      assert.match(problems[0], /public infographic provenance: \/(?:event-info|infographic-queue|weekly)\.json/);
      assert.doesNotMatch(problems.join("\n"), /@me|111|222/, "never log private channel/message IDs");
    });
  }
});

test("production catalogue parity ignores timestamp-only refreshes and JSON field order", () => {
  const expected = {
    updated: "2026-11-11T00:00:00Z",
    events: { synthetic: { name: "Synthetic event", updated: "2026-11-11T00:00:00Z",
      researchTasks: [{ task: "Catch 5 Pokémon", rewards: [{ name: "Stardust", quantity: 500 }] }] } }
  };
  const copy = {
    events: { synthetic: { researchTasks: [{ rewards: [{ quantity: 500, name: "Stardust" }],
      task: "Catch 5 Pokémon" }], updated: "2026-11-11T05:55:00Z", name: "Synthetic event" } },
    updated: "2026-11-11T05:55:00Z"
  };
  assert.equal(equivalentEventDetails(expected, copy), true);
  copy.events.synthetic.researchTasks[0].rewards[0].quantity = 100;
  assert.equal(equivalentEventDetails(expected, copy), false, "reward changes must be deployed");
  assert.equal(equivalentEventDetails(expected, { events: {} }), false, "missing events cannot pass");
  assert.equal(equivalentEventDetails(expected, null), false);
});

test("live site check catches stale event details without leaking event data", async () => {
  await withFetch({ mismatchedDetails: true }, async () => {
    const problems = await runChecks();
    assert.equal(problems.length, 1);
    assert.match(problems[0], /event-details\.json production parity: deployed Event Details differs from validated main/);
    assert.doesNotMatch(problems.join("\n"), /Incorrect unsourced event|Catch 5 Pokémon|Stardust/);
  });
});

test("uptime check passes when the page, data, images and app assets are healthy", async () => {
  await withFetch({}, async () => {
    assert.deepEqual(await runChecks(), []);
  });
});

test("uptime check reports a missing owner-review asset", async () => {
  await withFetch({ missingAsset: "/review.js" }, async () => {
    const problems = await runChecks();
    assert.ok(problems.some(problem => /versioned app assets.*review\.js\?v=6 HTTP 404/.test(problem)));
  });
});

test("uptime check falls back to GET when the static host does not support HEAD", async () => {
  await withFetch({ headUnsupported: true }, async () => {
    assert.deepEqual(await runChecks(), []);
  });
});

test("uptime check rejects a JavaScript asset served with an HTML content type", async () => {
  await withFetch({ badMime: { path: "/dash.js", type: "text/html" } }, async () => {
    const problems = await runChecks();
    assert.ok(problems.some(problem => /dash\.js.*unexpected content-type/.test(problem)));
  });
});

test("homepage and offline shell version mismatches fail closed", () => {
  const mismatched = SERVICE_WORKER.replace("/dash.js?v=4", "/dash.js?v=99");
  assert.throws(() => extractCoreAssetUrls(HTML, mismatched), /version differs/);
});

test("missing owner-review precache entry fails closed", () => {
  const missingReview = SERVICE_WORKER.replace(", '/review.js?v=6'", "");
  assert.throws(() => extractCoreAssetUrls(HTML, missingReview), /does not precache \/review\.js/);
});

test("uptime check still reports a failing R2 picture", async () => {
  await withFetch({ r2Status: 404 }, async () => {
    const problems = await runChecks();
    assert.ok(problems.some(problem => /R2 picture/.test(problem)));
  });
});


test("site-state history ignores runs that failed before the live-site check", async () => {
  const requests = [];
  const result = await previousLiveCheckConclusion({
    repository: "Wood468/crispy-barnacle",
    token: "test-token",
    fetchImpl: async (url, init) => {
      requests.push(url);
      assert.equal(init.headers.authorization, "Bearer test-token");
      if (url.endsWith("/actions/workflows/uptime.yml/runs?status=completed&per_page=20")) {
        return new Response(JSON.stringify({ workflow_runs: [{ id: 99 }, { id: 98 }] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/actions/runs/99/jobs?per_page=100")) {
        return new Response(JSON.stringify({ jobs: [{ steps: [
          { name: "Wait for the Cloudflare Workers production build", status: "completed", conclusion: "failure" },
          { name: "Check the live site", status: "completed", conclusion: "skipped" }
        ] }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/actions/runs/98/jobs?per_page=100")) {
        return new Response(JSON.stringify({ jobs: [{ steps: [
          { name: "Check the live site", status: "completed", conclusion: "success" }
        ] }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("Unexpected API request: " + url);
    }
  });
  assert.equal(result, "success");
  assert.equal(requests.length, 3);
});

test("site-state history records a failure only when the live-site check itself failed", async () => {
  const result = await previousLiveCheckConclusion({
    repository: "Wood468/crispy-barnacle",
    token: "test-token",
    fetchImpl: async url => {
      if (url.endsWith("/actions/workflows/uptime.yml/runs?status=completed&per_page=20")) {
        return new Response(JSON.stringify({ workflow_runs: [{ id: 97 }] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/actions/runs/97/jobs?per_page=100")) {
        return new Response(JSON.stringify({ jobs: [{ steps: [
          { name: "Check the live site", status: "completed", conclusion: "failure" }
        ] }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("Unexpected API request: " + url);
    }
  });
  assert.equal(result, "failure");
});

test("site-state history is unknown when no completed run reached the live-site check", async () => {
  const result = await previousLiveCheckConclusion({
    repository: "Wood468/crispy-barnacle",
    token: "test-token",
    fetchImpl: async url => {
      if (url.endsWith("/actions/workflows/uptime.yml/runs?status=completed&per_page=20")) {
        return new Response(JSON.stringify({ workflow_runs: [{ id: 96 }] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/actions/runs/96/jobs?per_page=100")) {
        return new Response(JSON.stringify({ jobs: [{ steps: [
          { name: "Check the live site", status: "completed", conclusion: "skipped" }
        ] }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("Unexpected API request: " + url);
    }
  });
  assert.equal(result, null);
});
