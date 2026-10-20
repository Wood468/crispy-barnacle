#!/usr/bin/env node
// G47IX image discovery + event verification for GO Field Notes.
// Reddit is the primary image source. Other platforms are optional official API adapters.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mergeReviewState } from "./g47ix-review.mjs";

const OUT = process.env.OUTPUT_FILE || "artifacts/g47ix-candidates.json";
const STATE_FILE = process.env.STATE_FILE || "data/g47ix-infographics-review.json";
const EVENT_FILE = process.env.EVENT_FILE || "public/data.json";
const USER_AGENT = "GO-Field-Notes-G47IX-Discovery/2.0 (GitHub Actions; Reddit public post discovery)";
const headers = { "user-agent": USER_AGENT, accept: "application/json" };
const candidates = [];
const sourceStatus = [];

async function get(url, opts = {}) {
  const response = await fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + new URL(url).hostname);
  return response;
}

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim().replaceAll("&amp;", "&"));
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function add(source, item) {
  const url = safeUrl(item?.url);
  if (!url || !item?.id) return;
  candidates.push({
    id: source + ":" + item.id,
    source,
    creator: "G47IX",
    title: String(item.title || "").replace(/\s+/g, " ").trim().slice(0, 400),
    url,
    publishedAt: item.publishedAt || null,
    imageUrl: safeUrl(item.imageUrl),
    ...(item.history ? { history: true } : {}),
    discoveredAt: new Date().toISOString()
  });
}

function redditImage(post) {
  const preview = post.preview?.images?.[0]?.source?.url;
  if (preview) return safeUrl(preview);
  const gallery = post.gallery_data?.items || [];
  for (const item of gallery) {
    const original = post.media_metadata?.[item.media_id]?.s?.u;
    if (original) return safeUrl(original);
  }
  const direct = safeUrl(post.url_overridden_by_dest || post.url);
  if (direct && /\.(?:jpe?g|png|webp|gif|avif)(?:$|\?)/i.test(direct)) return direct;
  if (post.post_hint === "image" && direct) return direct;
  return null;
}

// LOOKBACK_DAYS = 0 reads the newest 100 posts (the normal run). A larger number pages back through the account's history.
const LOOKBACK_DAYS = Math.min(120, Math.max(0, +process.env.G47IX_LOOKBACK_DAYS || 0));
export async function redditPosts(fetchPage, lookbackDays = LOOKBACK_DAYS, now = Date.now()) {
  const cutoff = now / 1000 - lookbackDays * 86400, posts = [];
  let after = "";
  for (let page = 0; page < 12; page++) {
    const body = await fetchPage(after);
    const kids = body.data?.children || [];
    posts.push(...kids);
    after = body.data?.after || "";
    const oldest = kids.length ? kids[kids.length - 1]?.data?.created_utc : 0;
    if (!lookbackDays || !after || !kids.length || (oldest && oldest < cutoff)) break;
  }
  return lookbackDays ? posts.filter(w => !w?.data?.created_utc || w.data.created_utc >= cutoff) : posts;
}
// Reddit itself refuses GitHub's servers (HTTP 403). Arctic Shift is a public archive of Reddit posts; it returns the same post fields.
export async function archivePosts(fetchJson, lookbackDays = LOOKBACK_DAYS || 14, now = Date.now()) {
  const cutoff = Math.floor(now / 1000 - lookbackDays * 86400), posts = [];
  let before = "";
  for (let page = 0; page < 8; page++) {
    const q = "https://arctic-shift.photon-reddit.com/api/posts/search?author=g47onik&sort=desc&limit=100&after=" + cutoff + (before ? "&before=" + before : "");
    const rows = (await fetchJson(q)).data || [];
    posts.push(...rows.map(data => ({ data })));
    if (rows.length < 100) break;
    before = rows[rows.length - 1].created_utc; if (!before) break;
  }
  return posts;
}
async function reddit() {
  const base = "https://www.reddit.com/user/g47onik/submitted.json?limit=100&sort=new&raw_json=1";
  let posts, mode = "public Reddit JSON endpoint";
  try { posts = await redditPosts(async after => { if (after) await new Promise(r => setTimeout(r, 1500)); return (await get(base + (after ? "&after=" + encodeURIComponent(after) : ""))).json(); }); }
  catch (e) {
    console.log("::warning::Reddit refused (" + e.message + "); trying the Arctic Shift archive");
    posts = await archivePosts(async u => (await get(u)).json()); mode = "Arctic Shift archive of Reddit posts";
  }
  let imageCount = 0;
  for (const wrapper of posts) {
    const post = wrapper?.data;
    if (!post || post.is_self || post.is_video) continue;
    const imageUrl = redditImage(post);
    if (!imageUrl) continue;
    imageCount++;
    add("reddit", {
      id: post.id,
      title: post.title || "G47IX Reddit image post",
      url: post.permalink ? "https://www.reddit.com" + post.permalink : null,
      publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
      imageUrl,
      history: !!post.created_utc && Date.now() / 1000 - post.created_utc > 14 * 86400
    });
  }
  sourceStatus.push({
    source: "reddit",
    state: "ok",
    username: "g47onik",
    scanned: posts.length,
    imagePosts: imageCount,
    mode
  });
}

async function xApi() {
  const token = process.env.G47IX_X_BEARER_TOKEN;
  if (!token) { sourceStatus.push({ source: "x", state: "not_configured" }); return; }
  const user = (await (await get("https://api.x.com/2/users/by/username/g47ix", {
    headers: { authorization: "Bearer " + token }
  })).json()).data;
  if (!user?.id) throw new Error("X API did not return G47IX user");
  const response = await get("https://api.x.com/2/users/" + user.id +
    "/tweets?max_results=20&tweet.fields=created_at,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type", {
      headers: { authorization: "Bearer " + token }
    });
  const data = await response.json();
  const media = new Map((data.includes?.media || []).map(m => [m.media_key, m]));
  for (const post of data.data || []) {
    const image = (post.attachments?.media_keys || []).map(key => media.get(key))
      .find(item => item?.type === "photo" && item.url);
    if (image) add("x", {
      id: post.id, title: post.text || "G47IX image post",
      url: "https://x.com/g47ix/status/" + post.id,
      publishedAt: post.created_at, imageUrl: image.url
    });
  }
  sourceStatus.push({ source: "x", state: "ok", count: (data.data || []).length, mode: "official X API; photo posts only" });
}

async function instagramApi() {
  const userId = process.env.G47IX_INSTAGRAM_USER_ID;
  const token = process.env.G47IX_INSTAGRAM_ACCESS_TOKEN;
  if (!userId || !token) { sourceStatus.push({ source: "instagram", state: "not_configured" }); return; }
  const fields = "id,caption,media_type,media_url,permalink,timestamp";
  const url = "https://graph.facebook.com/v24.0/" + encodeURIComponent(userId) +
    "/media?fields=" + encodeURIComponent(fields) + "&limit=25&access_token=" + encodeURIComponent(token);
  const data = await (await get(url)).json();
  for (const post of data.data || []) {
    if (post.permalink && post.media_url && ["IMAGE", "CAROUSEL_ALBUM"].includes(post.media_type)) {
      add("instagram", { id: post.id, title: post.caption || "G47IX image post",
        url: post.permalink, publishedAt: post.timestamp, imageUrl: post.media_url });
    }
  }
  sourceStatus.push({ source: "instagram", state: "ok", count: (data.data || []).length, mode: "official Instagram Graph API; image posts only" });
}

async function facebookApi() {
  const pageId = process.env.G47IX_FACEBOOK_PAGE_ID;
  const token = process.env.G47IX_FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) { sourceStatus.push({ source: "facebook", state: "not_configured" }); return; }
  const fields = "id,message,permalink_url,created_time,full_picture";
  const url = "https://graph.facebook.com/v24.0/" + encodeURIComponent(pageId) +
    "/posts?fields=" + encodeURIComponent(fields) + "&limit=25&access_token=" + encodeURIComponent(token);
  const data = await (await get(url)).json();
  for (const post of data.data || []) {
    if (post.permalink_url && post.full_picture) add("facebook", {
      id: post.id, title: post.message || "G47IX image post",
      url: post.permalink_url, publishedAt: post.created_time, imageUrl: post.full_picture
    });
  }
  sourceStatus.push({ source: "facebook", state: "ok", count: (data.data || []).length, mode: "official Facebook Graph API; image posts only" });
}

async function optionalSources() {
  await Promise.allSettled([
    xApi().catch(error => sourceStatus.push({ source: "x", state: "error", note: error.message })),
    instagramApi().catch(error => sourceStatus.push({ source: "instagram", state: "error", note: error.message })),
    facebookApi().catch(error => sourceStatus.push({ source: "facebook", state: "error", note: error.message }))
  ]);
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error("Cannot read " + path + ": " + error.message);
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

async function main() {
  try {
    await reddit();
  } catch (error) {
    sourceStatus.push({ source: "reddit", state: "error", note: error.message });
    console.error("Reddit discovery failed:", error.message);
  }
  await optionalSources();

  const eventData = await readJson(EVENT_FILE, { events: [] });
  const events = Array.isArray(eventData.events) ? eventData.events : [];
  const previous = await readJson(STATE_FILE, null);
  const state = mergeReviewState(previous, candidates, events);
  const oldSerialized = previous ? JSON.stringify(previous) : null;
  const newSerialized = JSON.stringify(state);

  await writeJson(OUT, {
    ...state,
    generatedAt: new Date().toISOString(),
    sourceStatus,
    eventsChecked: events.length
  });

  // The persistent registry has no per-run timestamp churn: commit only when
  // discoveries or their meaningful metadata change.
  if (oldSerialized !== newSerialized) {
    await writeJson(STATE_FILE, state);
    console.log("Review registry updated:", STATE_FILE);
  } else {
    console.log("No new candidates or material changes; review registry left untouched.");
  }

  console.log(JSON.stringify({
    output: OUT,
    persistentState: STATE_FILE,
    eventsChecked: events.length,
    discoveredThisRun: candidates.length,
    totalReviewCandidates: state.candidates.length,
    sourceStatus
  }, null, 2));

  console.log("::notice::G47IX sources: " + JSON.stringify(sourceStatus).slice(0, 900));
  // A blocked or failing source (Reddit often rejects cloud IPs) must not stop the other sources or the review steps.
  for (const source of sourceStatus.filter(s => s.state === "error")) {
    console.log("::warning::G47IX source " + source.source + " failed: " + (source.error || source.note || "see sourceStatus"));
  }
}

if (import.meta.url === "file://" + process.argv[1]) main().catch(error => {
  console.error("Fatal G47IX discovery error:", error.message);
  process.exitCode = 1;
});
