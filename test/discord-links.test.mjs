import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const LIB = require("../public/lib.js");
const read = (f) => readFileSync(new URL("../public/" + f, import.meta.url), "utf8");

test("isPrivateLink: Discord channel/message links are private, other links are not", () => {
  for (const u of ["https://discord.com/channels/@me/1558793395198099618/1558796039035682828", "https://discord.com/channels/123/456/789", "https://www.discord.com/channels/1/2", "https://ptb.discord.com/channels/1/2", "https://discordapp.com/channels/1/2/3", "HTTPS://DISCORD.COM/channels/@me/1/2", "http://discord.com/channels/1/2"]) assert.equal(LIB.isPrivateLink(u), true, u);
  for (const u of ["https://pokemongo.com/news/x", "https://leekduck.com/events/x/", "https://discord.com/invite/abc", "https://discord.gg/abc", "https://example.com/discord.com/channels/1", "https://cdn.discordapp.com/attachments/1/2/x.png", "", null, undefined, 5]) assert.equal(LIB.isPrivateLink(u), false, String(u));
});

test("isPrivateLink: spelling tricks do not make a private Discord channel link look public", () => {
  for (const u of ["https://discord.com\\channels\\1\\2", "https://user@discord.com/channels/1/2", "https://user:pw@discord.com/channels/1/2", "https://discord.com./channels/1/2", "https://app.discord.com/channels/1/2", "https://a.b.discordapp.com/channels/1/2", "https://DISCORD.COM:443/Channels/1/2", "https://discord.com//channels/1/2", "https://discord.com/%63hannels/1/2", "https://discord.com/./channels/1", "  https://discord.com/channels/1/2  ", "https://www.discord.com./channels/@me/1/2"]) assert.equal(LIB.isPrivateLink(u), true, u);
  for (const u of ["https://discord.gg/abc", "https://discord.gg/channels/1", "https://cdn.discordapp.com/attachments/1/2/x.png", "https://media.discordapp.net/attachments/1/2/x.png", "https://discord.com/invite/abc", "https://discord.com/channelsx/1", "https://notdiscord.com/channels/1", "https://discord.com.evil.example/channels/1", "https://evil.example/?u=discord.com/channels/1", "https://user@evil.example/discord.com/channels/1", "https://evil.example#discord.com/channels/1"]) assert.equal(LIB.isPrivateLink(u), false, u);
  assert.equal(LIB.publicLink("https://discord.com\\channels\\1\\2", "https://app.discord.com/channels/1/2", "https://pokemongo.com/x"), "https://pokemongo.com/x");
});

test("isPrivateLink: a Discord channel link the URL parser rejects (bad port) is still private", () => {
  for (const u of ["https://discord.com:99999/channels/1/2", "https://user:pw@discord.com:99999/channels/1/2", "https://discord.com.:99999/channels/1", "https://app.discordapp.com:abc/channels/1", "https://discord.com:99999\\channels\\1", "https://discord.com:99999/%63hannels/1", "HTTPS://DISCORD.COM:99999/Channels"]) {
    assert.throws(() => new URL(u.replace(/\\/g, "/")), undefined, "fixture really is unparseable: " + u);
    assert.equal(LIB.isPrivateLink(u), true, u);
  }
  for (const u of ["https://discord.com:99999/invite/abc", "https://discord.com.evil.example:99999/channels/1", "https://notdiscord.com:99999/channels/1", "https://evil.example:99999/discord.com/channels/1", "https://discord.com:99999/channelsx/1", "https://user@evil.example:99999/discord.com/channels/1", "https://cdn.discordapp.com:99999/attachments/1/2/x.png"]) assert.equal(LIB.isPrivateLink(u), false, u);
});

test("publicLink: picks the first https link a visitor can open (the event's own official link before a private Discord post)", () => {
  const discord = "https://discord.com/channels/@me/1/2", official = "https://pokemongo.com/news/fall-marathon-buddy-trek-2026";
  assert.equal(LIB.publicLink(discord, official), official, "a Discord post is skipped in favour of the official link");
  assert.equal(LIB.publicLink(official, discord), official);
  assert.equal(LIB.publicLink(discord), "", "nothing public: no link at all, never a dead one");
  assert.equal(LIB.publicLink(discord, "", null, undefined, "http://insecure.example/x", "/relative"), "", "only https links count");
  assert.equal(LIB.publicLink(undefined), "");
  assert.equal(LIB.publicLink(), "");
});

test("every place that shows a source or post link to visitors goes through the private-link rule", () => {
  for (const f of ["dash.js", "detail.js", "infographic.js"]) assert.match(read(f), /function safe(Url)?\(u\) \{[^\n]*isPrivateLink\(u\)/, f + " refuses private links in its URL check");
  assert.match(read("weekly.js"), /GOLIB\.publicLink\(it\.post\)/, "the weekly picture no longer links to the private Discord post");
  assert.match(read("infographic.js"), /sourceUrl: window\.GOLIB\.publicLink\(it\.post\)/, "approved pictures waiting for publish do not link to Discord");
  const review = read("review.js");
  assert.match(review, /isPrivateLink\(it\.post\) \? 'Open in Discord \(owner only\)'/, "the owner's review screen keeps the Discord link, clearly labelled");
});

test("published data may still hold Discord links, and the presentation layer hides them without touching the data", () => {
  const info = JSON.parse(read("event-info.json")).events;
  let private_ = 0;
  for (const e of Object.values(info)) {
    if (e.source && LIB.isPrivateLink(e.source.url)) private_++;
    for (const i of e.infographics || []) if (LIB.isPrivateLink(i.sourceUrl)) { private_++; assert.equal(LIB.publicLink(i.sourceUrl), ""); }
  }
  assert.ok(private_ > 0, "the stored data is left as it is");
});
