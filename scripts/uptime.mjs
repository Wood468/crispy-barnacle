// Live-site check, run every 15 minutes by .github/workflows/uptime.yml.
// Fetches the home page, the main data files and one R2-served picture. A Telegram message (System topic) goes out only when the
// state changes: once when the site starts failing, once when it recovers. The previous state is the last finished run of this workflow.
import { routed } from "../src/tgroute.js";
const BASE = (process.env.SITE_URL || "https://pogo.michaelpuff.com").replace(/\/$/, "");

async function get(path, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + path, { headers: { "user-agent": "go-field-notes-uptime" }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return r;
      last = new Error("HTTP " + r.status);
    } catch (e) { last = e; }
    if (i + 1 < tries) await new Promise(r => setTimeout(r, 15000));
  }
  throw last;
}
async function json(path) { return (await get(path)).json(); }

async function headAsset(path) {
  const headers = { "user-agent": "go-field-notes-uptime" };
  let response = null, headStatus = null, headError = null;
  try {
    response = await fetch(BASE + path, { method: "HEAD", headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) headStatus = response.status;
  } catch (error) { headError = error; }
  // Some static hosts do not implement HEAD consistently. A safe GET fallback
  // distinguishes an unsupported HEAD response from a genuinely missing asset.
  if (!response || !response.ok) {
    try {
      response = await fetch(BASE + path, { method: "GET", headers, signal: AbortSignal.timeout(20000) });
    } catch (error) {
      throw new Error(path + " HEAD/GET failed: " + (error && error.message || error || headError || "request failed"));
    }
  }
  if (!response.ok) {
    throw new Error(path + " HTTP " + response.status + (headStatus ? " (HEAD " + headStatus + ")" : ""));
  }
  return response;
}

function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(['\"])(.*?)\\1", "i"));
  return match ? match[2] : "";
}

function isJavaScriptMime(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  return [
    "application/javascript", "text/javascript",
    "application/ecmascript", "text/ecmascript",
    "application/x-javascript", "text/x-javascript"
  ].includes(mime);
}

export function extractCoreAssetUrls(homeHtml, serviceWorker) {
  const origin = new URL(BASE).origin;
  const htmlAssets = new Map();
  const tags = String(homeHtml || "").match(/<(?:script|link)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const script = /^<script\b/i.test(tag);
    const rel = htmlAttribute(tag, "rel").toLowerCase().split(/\s+/);
    const relevant = script || rel.includes("stylesheet") ||
      (rel.includes("preload") && htmlAttribute(tag, "as").toLowerCase() === "script");
    if (!relevant) continue;
    const raw = htmlAttribute(tag, script ? "src" : "href");
    if (!raw) continue;
    try {
      const url = new URL(raw, BASE);
      if (url.origin !== origin || !/\.(?:js|css)$/i.test(url.pathname)) continue;
      htmlAssets.set(url.pathname, url.pathname + url.search);
    } catch (_) { /* Ignore malformed or non-URL attributes; required assets are checked below. */ }
  }

  const cacheMatch = String(serviceWorker || "").match(/const\s+SHELL_CACHE\s*=\s*(['"])([^'"]+)\1/);
  if (!cacheMatch || !/^gofn-shell-v\d+$/.test(cacheMatch[2])) {
    throw new Error("service worker shell cache version is missing");
  }
  const shellMatch = String(serviceWorker || "").match(/const\s+SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
  if (!shellMatch) throw new Error("service worker offline asset list is missing");

  const shellAssets = new Map();
  for (const match of shellMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
    try {
      const url = new URL(match[1], BASE);
      if (url.origin !== origin || !/\.(?:js|css)$/i.test(url.pathname)) continue;
      shellAssets.set(url.pathname, url.pathname + url.search);
    } catch (_) { /* Ignore non-URL list entries. */ }
  }

  const required = ["styles.css", "dash.css", "app.js", "dash.js", "lib.js", "pwa.js", "review.js"];
  const requiredInHtml = new Set(["styles.css", "dash.css", "app.js", "dash.js", "lib.js", "pwa.js"]);
  const assets = [];
  for (const name of required) {
    const path = "/" + name;
    const shellUrl = shellAssets.get(path);
    if (!shellUrl) throw new Error("offline shell does not precache " + path);
    const htmlUrl = htmlAssets.get(path);
    if (requiredInHtml.has(name) && !htmlUrl) throw new Error("homepage does not reference " + path);
    if (htmlUrl && htmlUrl !== shellUrl) {
      throw new Error(path + " version differs between homepage and offline shell");
    }
    assets.push(shellUrl);
  }
  // The worker itself is not part of its own precache list, but it must be
  // fetchable for pwa.js to register offline support.
  assets.push("/sw.js");
  return { cacheName: cacheMatch[2], assets };
}

export async function runChecks() {
  const problems = [];
  let homeHtml = "";
  const check = async (name, fn) => { try { await fn(); } catch (e) { problems.push(name + ": " + (e && e.message || e)); } };
  await check("home page", async () => {
    homeHtml = await (await get("/")).text();
    if (!/<html/i.test(homeHtml)) throw new Error("not a page");
  });
  await check("versioned app assets", async () => {
    if (!homeHtml) {
      homeHtml = await (await get("/")).text();
      if (!/<html/i.test(homeHtml)) throw new Error("not a page");
    }
    const worker = await get("/sw.js");
    if (!isJavaScriptMime(worker.headers.get("content-type"))) {
      throw new Error("/sw.js has an unexpected content-type");
    }
    const serviceWorker = await worker.text();
    const shell = extractCoreAssetUrls(homeHtml, serviceWorker);
    await Promise.all(shell.assets.filter(path => path !== "/sw.js").map(async path => {
      const response = await headAsset(path);
      const type = response.headers.get("content-type") || "";
      const pathname = new URL(path, BASE).pathname;
      if (pathname.endsWith(".css") && !/^text\/css(?:;|$)/i.test(type)) {
        throw new Error(path + " has an unexpected content-type");
      }
      if (pathname.endsWith(".js") && !isJavaScriptMime(type)) {
        throw new Error(path + " has an unexpected content-type");
      }
    }));
  });
  await check("data.json", async () => { const d = await json("/data.json"); if (!Array.isArray(d.events) || !d.events.length) throw new Error("no events"); });
  await check("world-events.json", async () => { const d = await json("/world-events.json"); if (!Array.isArray(d.events)) throw new Error("no events list"); });
  await check("prices.json", async () => { await json("/prices.json"); });
  await check("R2 picture", async () => {
    const w = await json("/weekly.json").catch(() => ({}));
    const q = await json("/infographic-queue.json").catch(() => ({}));
    const img = ((w.items || [])[0] || {}).image || ((q.items || [])[0] || {}).image;
    if (!img) return; // nothing to test yet
    const r = await get(img.startsWith("/") ? img : "/" + img);
    if (!/^image\//.test(r.headers.get("content-type") || "")) throw new Error(img + " did not come back as a picture");
  });
  return problems;
}

export async function previousLiveCheckConclusion(options = {}) {
  const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!repository || !token) return null;

  const [owner, name, extra] = repository.split("/");
  if (!owner || !name || extra) return null;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const headers = {
    authorization: "Bearer " + token,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "go-field-notes-site-check"
  };

  try {
    const runsResponse = await fetchImpl(
      base + "/actions/workflows/uptime.yml/runs?status=completed&per_page=20",
      { headers, signal: AbortSignal.timeout(10000) }
    );
    if (!runsResponse.ok) return null;
    const runs = await runsResponse.json();

    // A push can fail before the live check if Cloudflare has not reported its
    // production build yet. Such a run says nothing about the live site's state.
    for (const run of runs.workflow_runs || []) {
      if (!run || !run.id) continue;
      const jobsResponse = await fetchImpl(
        base + "/actions/runs/" + encodeURIComponent(run.id) + "/jobs?per_page=100",
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!jobsResponse.ok) return null;
      const jobs = await jobsResponse.json();
      for (const job of jobs.jobs || []) {
        const step = (job.steps || []).find(item => item && item.name === "Check the live site");
        if (!step || step.status !== "completed") continue;
        if (step.conclusion === "success" || step.conclusion === "failure") return step.conclusion;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function tell(text) {
  const t = process.env.TELEGRAM_BOT_TOKEN; if (!t) return;
  const env = process.env, dest = (await import("../src/tgroute.js")).route(env, "system");
  if (!dest.chat) return;
  await routed(env, "system")("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: dest.chat, text, disable_web_page_preview: true }) });
}

if (import.meta.url === "file://" + process.argv[1]) {
  const [problems, prev] = await Promise.all([runChecks(), previousLiveCheckConclusion()]);
  if (problems.length) {
    console.log(problems.map(p => "::error::" + p).join("\n"));
    if (prev !== "failure") await tell("🔴 Site is down or broken\n" + problems.slice(0, 5).map(p => "• " + p).join("\n") + "\n\n" + BASE);
    process.exit(1);
  }
  console.log("All checks passed.");
  if (prev === "failure") await tell("🟢 Site is back to normal.");
}
