import test from "node:test";
import assert from "node:assert/strict";
import { route, routed, isQuiet } from "../src/tgroute.js";
import { handleHook, hookSecret } from "../src/telegram.js";

const ENV = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "42", TELEGRAM_GROUP_ID: "-1001", TELEGRAM_TOPIC_EVENTS: "5", TELEGRAM_TOPIC_SYSTEM: "9" };
test("each kind of message goes to its Topic; anything unset falls back to the main chat", () => {
  assert.deepEqual(route(ENV, "events"), { chat: "-1001", thread: 5 });
  assert.deepEqual(route(ENV, "pictures"), { chat: "-1001", thread: 0 }, "group set but no Topic id: the group's General topic");
  assert.deepEqual(route({ TELEGRAM_CHAT_ID: "42" }, "events"), { chat: "42", thread: 0 });
  assert.deepEqual(route({ ...ENV, TELEGRAM_GROUP_ID: "oops" }, "events"), { chat: "42", thread: 0 }, "a bad group id is ignored");
});
test("routed fetch rewrites the chat and Topic for sends, leaves other calls alone", async () => {
  const seen = []; const base = async (u, o) => { seen.push([u, o]); return { ok: true }; };
  const f = routed(ENV, "system", base, () => new Date("2026-10-15T03:00:00Z")); // 2pm Melbourne
  await f("https://api.telegram.org/botT/sendMessage", { method: "POST", body: JSON.stringify({ chat_id: "42", text: "hi" }) });
  assert.deepEqual(JSON.parse(seen[0][1].body), { chat_id: "-1001", text: "hi", message_thread_id: 9 });
  await f("https://api.telegram.org/botT/editMessageCaption", { method: "POST", body: JSON.stringify({ chat_id: "42", message_id: 1, caption: "x" }) });
  assert.equal(JSON.parse(seen[1][1].body).message_thread_id, undefined, "edits do not need a Topic");
  assert.equal(JSON.parse(seen[1][1].body).chat_id, "-1001");
  await f("https://api.telegram.org/botT/answerCallbackQuery", { method: "POST", body: JSON.stringify({ callback_query_id: "1" }) });
  assert.equal(JSON.parse(seen[2][1].body).chat_id, undefined);
  await f("https://example.com/x", { body: "raw" }); assert.equal(seen[3][1].body, "raw");
  const fd = new FormData(); fd.set("chat_id", "42"); await f("https://api.telegram.org/botT/sendPhoto", { method: "POST", body: fd });
  assert.equal(fd.get("chat_id"), "-1001"); assert.equal(fd.get("message_thread_id"), "9");
});
test("the owner can use the buttons and /here in the group; anyone else is ignored", async () => {
  const sent = []; const fetchFn = async (u, o) => { sent.push(JSON.parse(o.body)); return { json: async () => ({ ok: true }) }; };
  const hdr = { "x-telegram-bot-api-secret-token": await hookSecret("t") };
  const req = body => ({ headers: { get: k => hdr[k.toLowerCase()] || "" }, json: async () => body });
  const here = (from) => handleHook(req({ message: { chat: { id: -1001 }, from: { id: from }, text: "/here", message_thread_id: 9, message_id: 3 } }), { env: ENV, fetchFn, queue: { items: [] }, save: async () => {} });
  await here(42);
  assert.match(sent[0].text, /Group ID: -1001\nTopic ID: 9/); assert.equal(sent[0].message_thread_id, 9);
  const sent0 = sent.length; await handleHook(req({ message: { chat: { id: -555 }, from: { id: 42 }, text: "/here@GoBot", message_id: 4 } }), { env: { ...ENV, TELEGRAM_GROUP_ID: "" }, fetchFn, queue: { items: [] }, save: async () => {} });
  assert.equal(sent.length, sent0 + 1, "/here works in a brand-new group before its id is saved");
  const n = sent.length; await here(777); assert.equal(sent.length, n, "a stranger in the group gets no answer");
  let saved = null;
  await handleHook(req({ callback_query: { id: "c", data: "r|discord:1234567", from: { id: 42 }, message: { chat: { id: -1001 }, message_id: 8, caption: "x" } } }), { env: ENV, fetchFn, queue: { items: [{ id: "discord:1234567" }] }, save: async d => { saved = d; } });
  assert.equal(saved && saved.status, "rejected");
});

test("quiet hours are per Topic and make messages silent, not late", async () => {
  const night = new Date("2026-10-15T13:00:00Z"), day = new Date("2026-10-15T03:00:00Z"); // 12am and 2pm Melbourne
  assert.equal(isQuiet({}, "changes", night), true); assert.equal(isQuiet({}, "changes", day), false);
  assert.equal(isQuiet({}, "pictures", night), false, "Pictures can ping any time by default");
  assert.equal(isQuiet({ QUIET_PICTURES: "23-6" }, "pictures", night), true);
  assert.equal(isQuiet({ QUIET_CHANGES: "off" }, "changes", night), false);
  assert.equal(isQuiet({ QUIET_CHANGES: "junk" }, "changes", night), false);
  const seen = []; const base = async (u, o) => { seen.push(JSON.parse(o.body)); return { ok: true }; };
  await routed(ENV, "changes", base, () => night)("https://api.telegram.org/botT/sendMessage", { method: "POST", body: JSON.stringify({ chat_id: "42", text: "x" }) });
  await routed(ENV, "changes", base, () => day)("https://api.telegram.org/botT/sendMessage", { method: "POST", body: JSON.stringify({ chat_id: "42", text: "x" }) });
  await routed(ENV, "pictures", base, () => night)("https://api.telegram.org/botT/sendMessage", { method: "POST", body: JSON.stringify({ chat_id: "42", text: "x" }) });
  assert.equal(seen[0].disable_notification, true); assert.equal(seen[1].disable_notification, undefined); assert.equal(seen[2].disable_notification, undefined);
});
test("TOPICS_ spelling also works", () => { assert.deepEqual(route({ TELEGRAM_GROUP_ID: "-1", TELEGRAM_TOPICS_EVENTS: "3" }, "events"), { chat: "-1", thread: 3 }); });
