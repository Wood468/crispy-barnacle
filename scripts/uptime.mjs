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

export async function runChecks() {
  const problems = [];
  const check = async (name, fn) => { try { await fn(); } catch (e) { problems.push(name + ": " + (e && e.message || e)); } };
  await check("home page", async () => { const t = await (await get("/")).text(); if (!/<html/i.test(t)) throw new Error("not a page"); });
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

async function previousConclusion() {
  const repo = process.env.GITHUB_REPOSITORY, tok = process.env.GITHUB_TOKEN;
  if (!repo || !tok) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/uptime.yml/runs?status=completed&per_page=1`, { headers: { authorization: "Bearer " + tok, accept: "application/vnd.github+json" } });
    const j = await r.json();
    return (j.workflow_runs || [])[0]?.conclusion || null;
  } catch { return null; }
}

async function tell(text) {
  const t = process.env.TELEGRAM_BOT_TOKEN; if (!t) return;
  const env = process.env, dest = (await import("../src/tgroute.js")).route(env, "system");
  if (!dest.chat) return;
  await routed(env, "system")("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: dest.chat, text, disable_web_page_preview: true }) });
}

if (import.meta.url === "file://" + process.argv[1]) {
  const problems = await runChecks(), prev = await previousConclusion();
  if (problems.length) {
    console.log(problems.map(p => "::error::" + p).join("\n"));
    if (prev !== "failure") await tell("🔴 Site is down or broken\n" + problems.slice(0, 5).map(p => "• " + p).join("\n") + "\n\n" + BASE);
    process.exit(1);
  }
  console.log("All checks passed.");
  if (prev === "failure") await tell("🟢 Site is back to normal.");
}
