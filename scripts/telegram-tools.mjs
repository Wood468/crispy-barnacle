// One-off helpers for setting up the Telegram nudge. The bot token comes only from the TELEGRAM_BOT_TOKEN secret and is never printed.
//   find: lists the chats that have messaged the bot, so you can copy your chat ID (an ID is not a secret).
//   link: points Telegram's button taps at the site (needed once, for Approve / Reject under infographics). unlink: undoes it.
//   test: sends one short message to TELEGRAM_CHAT_ID.
import { hookSecret } from "../src/telegram.js";
const token = process.env.TELEGRAM_BOT_TOKEN, mode = process.argv[2];
const say = (kind, msg) => console.log("::" + kind + "::" + msg);
async function api(method, body) {
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return r.json();
}
if (!token) { say("error", "TELEGRAM_BOT_TOKEN secret is not set in the repository."); process.exit(1); }
if (mode === "find") {
  const j = await api("getUpdates");
  if (!j.ok) { say("error", "Telegram refused the token: " + (j.description || "unknown error")); process.exit(1); }
  const chats = new Map();
  for (const u of j.result || []) { const c = (u.message || u.edited_message || {}).chat; if (c) chats.set(c.id, c); }
  if (!chats.size) { say("warning", "No messages found. Open your bot in Telegram, send it a message, then run this again."); process.exit(0); }
  for (const c of chats.values()) say("notice", "Chat ID " + c.id + " (" + [c.first_name, c.last_name, c.username && "@" + c.username].filter(Boolean).join(" ") + "). Save this number as the TELEGRAM_CHAT_ID secret.");
} else if (mode === "link" || mode === "unlink") {
  if (mode === "unlink") { const j = await api("deleteWebhook"); say(j.ok ? "notice" : "error", j.ok ? "Buttons unlinked." : "Telegram said: " + j.description); process.exit(j.ok ? 0 : 1); }
  const url = (process.env.APP_URL || "https://pogo.michaelpuff.com") + "/api/telegram/hook";
  const j = await api("setWebhook", { url, secret_token: await hookSecret(token), allowed_updates: ["callback_query", "message"] });
  if (!j.ok) { say("error", "Telegram said: " + (j.description || "unknown error")); process.exit(1); }
  const info = await api("getWebhookInfo");
  say("notice", "Buttons linked to " + url + (info.result && info.result.last_error_message ? ". Last error from Telegram: " + info.result.last_error_message : ". Telegram will now send Approve / Reject taps to your site."));
} else if (mode === "test") {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) { say("error", "TELEGRAM_CHAT_ID secret is not set yet."); process.exit(1); }
  const j = await api("sendMessage", { chat_id: chat, text: "GO Field Notes: test message. Your daily nudge is connected." });
  if (!j.ok) { say("error", "Telegram said: " + (j.description || "unknown error")); process.exit(1); }
  say("notice", "Test message sent. Check Telegram.");
}
