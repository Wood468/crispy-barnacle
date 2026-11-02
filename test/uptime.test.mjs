import test from "node:test";
import assert from "node:assert/strict";
import { extractCoreAssetUrls, runChecks } from "../scripts/uptime.mjs";

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
    if (path === "/weekly.json") return ok({ items: [{ image: "/infographics/a.png" }] });
    if (path === "/infographic-queue.json") return ok({ items: [] });
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
  assert.ok(!result.assets.some(path => path.includes("fonts.googleapis.com")));
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
