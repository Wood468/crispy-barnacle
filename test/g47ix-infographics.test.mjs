import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchEvent, mergeReviewState } from "../scripts/g47ix-review.mjs";
import { buildQueue } from "../scripts/g47ix-publish.mjs";

test("discovery script has valid Node.js syntax", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/g47ix-infographics.mjs", import.meta.url));
  execFileSync(process.execPath, ["--check", scriptPath], { stdio: "pipe" });
});

test("matches a Reddit infographic title to an app event", () => {
  const events = [
    { id: "zorua", t: "Zorua Community Day", p: ["3x catch XP and boosted Zorua spawns"] },
    { id: "sandile", t: "Sandile Hatch Day", p: ["Boosted shiny odds"] }
  ];
  const match = matchEvent({ title: "Zorua Community Day Infographic October 2026" }, events);
  assert.equal(match?.eventId, "zorua");
  assert.ok(match.score > 0.34);
  assert.equal(match.requiresHumanVerification, true);
});

test("unrelated titles stay unmatched", () => {
  const match = matchEvent({ title: "Funny Pokémon meme" }, [
    { id: "zorua", t: "Zorua Community Day" }
  ]);
  assert.equal(match, null);
});

test("a newer post for an event is flagged as a proposed update, not auto-approved", () => {
  const events = [{ id: "zorua", t: "Zorua Community Day" }];
  const first = {
    id: "reddit:abc", source: "reddit", title: "Zorua Community Day infographic",
    url: "https://www.reddit.com/r/pokemongo/comments/abc/example/",
    imageUrl: "https://i.redd.it/first.png", publishedAt: "2026-10-10T00:00:00.000Z"
  };
  const initial = mergeReviewState(null, [first], events, "2026-10-10T01:00:00.000Z");
  assert.equal(initial.candidates[0].reviewStatus, "needs_review");
  assert.equal(initial.eventImages.zorua.approvedCandidateId, null);

  const update = {
    ...first, id: "reddit:def",
    url: "https://www.reddit.com/r/pokemongo/comments/def/example/",
    imageUrl: "https://i.redd.it/second.png", publishedAt: "2026-10-11T00:00:00.000Z"
  };
  const next = mergeReviewState(initial, [update], events, "2026-10-11T01:00:00.000Z");
  const newer = next.candidates.find(candidate => candidate.id === "reddit:def");
  assert.equal(newer.reviewStatus, "possible_update");
  assert.equal(newer.supersedesCandidateId, "reddit:abc");
  assert.equal(newer.decision, "pending");
  assert.equal(next.eventImages.zorua.approvedCandidateId, null);
  assert.equal(next.eventImages.zorua.proposedCandidateId, "reddit:def");
});

test("identical discoveries do not change persistent registry timestamp", () => {
  const events = [{ id: "zorua", t: "Zorua Community Day" }];
  const item = {
    id: "reddit:abc", source: "reddit", title: "Zorua Community Day infographic",
    url: "https://www.reddit.com/r/pokemongo/comments/abc/example/",
    imageUrl: "https://i.redd.it/first.png", publishedAt: "2026-10-10T00:00:00.000Z"
  };
  const state = mergeReviewState(null, [item], events, "2026-10-10T01:00:00.000Z");
  const again = mergeReviewState(state, [item], events, "2026-10-10T02:00:00.000Z");
  assert.equal(again.updatedAt, state.updatedAt);
  assert.equal(again.candidates.length, 1);
});

import { redditPosts } from "../scripts/g47ix-infographics.mjs";
test("history paging stops at the look-back date and drops older posts", async () => {
  const now = Date.UTC(2026, 9, 12) ;
  const day = n => ({ data: { id: "p" + n, created_utc: now / 1000 - n * 86400 } });
  const pages = [{ data: { children: [day(1), day(40)], after: "a" } }, { data: { children: [day(80), day(100)], after: "b" } }, { data: { children: [day(200)], after: null } }];
  let i = 0; const got = await redditPosts(async () => pages[i++], 90, now);
  assert.deepEqual(got.map(p => p.data.id), ["p1", "p40", "p80"]); assert.equal(i, 2);
  i = 0; assert.equal((await redditPosts(async () => pages[i++], 0, now)).length, 2); assert.equal(i, 1);
});

import { archivePosts } from "../scripts/g47ix-infographics.mjs";
test("the archive fallback pages by time and wraps posts like Reddit does", async () => {
  const mk = (n, t) => Array.from({ length: n }, (_, i) => ({ id: "a" + t + i, created_utc: 2000 - t * 100 - i }));
  const pages = [mk(100, 0), mk(30, 1)]; let i = 0; const urls = [];
  const got = await archivePosts(async u => { urls.push(u); return { data: pages[i++] }; }, 90, Date.UTC(2026, 9, 12));
  assert.equal(got.length, 130); assert.ok(got[0].data.id); assert.match(urls[1], /before=/); assert.equal(i, 2);
});

test("review queue identifies Telegram and Discord and preserves useful OCR context", () => {
  const q = buildQueue({ candidates: [
    { id: "tg:1", source: "telegram", title: "Picture sent from Telegram", stagedPath: "/infographics/tg.jpg", reviewStatus: "needs_review", ocrText: "Giratina raid counters", reviewNote: "No exact event match." },
    { id: "discord:2", source: "discord", title: "Raid guide", stagedPath: "/infographics/d.jpg", reviewStatus: "unmatched", ocrText: "Sableye weakness chart" }
  ] });
  assert.equal(q.items[0].source, "telegram");
  assert.equal(q.items[0].text, "Giratina raid counters");
  assert.equal(q.items[1].source, "discord");
  assert.equal(q.items[1].text, "Sableye weakness chart");
});
