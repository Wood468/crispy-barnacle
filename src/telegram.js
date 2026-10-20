// Approve (link to one or more events), unlink or discard infographics from Telegram. The nudge job sends each new picture with buttons; a tap arrives here
// (Telegram calls /api/telegram/hook) and is stored exactly like a tap in the app's review list, in ig_decisions.
// Only taps from your own chat count, and only requests carrying the secret handshake Telegram was given at link-up.
export const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

// The handshake is derived from the bot token, so no extra secret has to be set up anywhere.
export async function hookSecret(token) { return hex(await crypto.subtle.digest("SHA-256", enc.encode("gofn-telegram-hook:" + token))); }

// callback_data is "a|<id>|<n>" (link suggestion n), "x|<id>|<n>" (unlink the n-th linked event) or "r|<id>" (discard). Telegram allows 64 bytes.
export function parseTap(data) {
  const m = /^([arxwm])\|([a-z0-9:_.-]{1,60})(?:\|(\d))?$/i.exec(String(data || ""));
  if (!m) return null;
  if (m[1] === "r") return { act: "reject", id: m[2] };
  if (m[1] === "w") return { act: "week", id: m[2] };
  if (m[1] === "m") return { act: "month", id: m[2] };
  if (m[3] === undefined) return null;
  return { act: m[1] === "a" ? "approve" : "unlink", id: m[2], n: Number(m[3]) };
}
export const tapData = (act, id, n) => act === "r" || act === "w" || act === "m" ? act + "|" + id : act + "|" + id + "|" + n;


// A picture sent to the bot: the biggest size of a photo, or an image sent as a file. Returns { fileId, uniq, caption, msgId } or null.
export function photoOf(msg) {
  if (!msg) return null;
  const caption = String(msg.caption || msg.text || "").replace(/[<>]/g, "").trim().slice(0, 300);
  if (Array.isArray(msg.photo) && msg.photo.length) { const p = msg.photo[msg.photo.length - 1]; if (p && p.file_id && p.file_unique_id) return { fileId: p.file_id, uniq: String(p.file_unique_id).replace(/[^a-z0-9_-]/gi, ""), caption, msgId: msg.message_id }; }
  const d = msg.document; if (d && /^image\/(png|jpe?g|webp)$/i.test(d.mime_type || "") && d.file_id && d.file_unique_id) return { fileId: d.file_id, uniq: String(d.file_unique_id).replace(/[^a-z0-9_-]/gi, ""), caption, msgId: msg.message_id };
  return null;
}

// What is linked now, from a stored decision row: [{ id, title }]
export function linkedOf(dec) {
  if (!dec || dec.status !== "approved" || !dec.eventId) return [];
  const ids = String(dec.eventId).split(","), titles = String(dec.eventTitle || "").split(" | ");
  return ids.map((id, i) => ({ id, title: titles[i] || id }));
}
const join = list => ({ eventId: list.map(x => x.id).join(","), eventTitle: list.map(x => x.title).join(" | ") });

// Buttons under a picture: link a suggested event (more than one is fine), unlink one, discard, or open the app for another event.
export function keyboard(item, linked = [], app = "https://pogo.michaelpuff.com") {
  const rows = [];
  if (String(item.id).length <= 50) {
    linked.forEach((l, n) => rows.push([{ text: ("➖ Unlink " + l.title).slice(0, 60), callback_data: tapData("x", item.id, n) }]));
    const have = new Set(linked.map(l => l.id));
    (item.guesses || []).filter(g => g && g.eventId && !have.has(String(g.eventId))).slice(0, 3).forEach((g, n) => {
      const gi = (item.guesses || []).indexOf(g);
      rows.push([{ text: ((linked.length ? "➕ Also link " : "✅ Link to ") + (g.eventTitle || g.eventId)).slice(0, 60), callback_data: tapData("a", item.id, gi) }]);
    });
    rows.push([{ text: "📅 This week's picture", callback_data: tapData("w", item.id) }, { text: "🗓 Month overview", callback_data: tapData("m", item.id) }]);
    rows.push([{ text: "🗑 Discard", callback_data: tapData("r", item.id) }, { text: "🔎 Other event", url: app + "/#review" }]);
  } else rows.push([{ text: "Open in the app", url: app + "/#review" }]);
  return { inline_keyboard: rows };
}

// Decide what to store for a tap. `queue` is public/infographic-queue.json; `current` is the stored decision row (or null).
// Returns { decision, note, item, linked } or { error }.
export function decideTap(tap, queue, current) {
  let item = ((queue && queue.items) || []).find(i => i.id === tap.id);
  // A picture the Worker forwarded straight from Discord is not in the review list yet; discard / week / month still work for it.
  if (!item && /^discord:\d{5,30}$/.test(tap.id) && ["reject", "week", "month"].includes(tap.act)) item = { id: tap.id };
  if (!item) return { error: "Already handled, or not in the list any more." };
  const now = linkedOf(current);
  if (tap.act === "reject") return { decision: { id: tap.id, status: "rejected", eventId: "", eventTitle: "" }, note: "🗑 Discarded", item, linked: [] };
  if (tap.act === "week" || tap.act === "month") {
    const w = tap.act === "week";
    return { decision: { id: tap.id, status: tap.act, eventId: "", eventTitle: "" }, note: w ? "📅 Set as this week's picture (At a glance → Week)" : "🗓 Set as the month overview (At a glance → Month)", item, linked: [] };
  }
  if (tap.act === "unlink") {
    const gone = now[tap.n]; if (!gone) return { error: "That link is already gone." };
    const left = now.filter((_, i) => i !== tap.n);
    if (!left.length) return { decision: { id: tap.id, status: "unlinked", eventId: "", eventTitle: "" }, note: "➖ Unlinked from " + gone.title + ". It is back in your review list.", item, linked: [] };
    return { decision: { id: tap.id, status: "approved", ...join(left) }, note: "➖ Unlinked from " + gone.title + "\n✅ Linked to " + left.map(l => l.title).join(", "), item, linked: left };
  }
  const g = (item.guesses || [])[tap.n];
  if (!g || !g.eventId) return { error: "That suggestion is no longer available. Open the app to pick an event." };
  const next = now.some(l => l.id === String(g.eventId)) ? now : now.concat([{ id: String(g.eventId), title: String(g.eventTitle || g.eventId) }]);
  if (next.length > 8) return { error: "That is plenty of events for one picture." };
  return { decision: { id: tap.id, status: "approved", ...join(next) }, note: "✅ Linked to " + next.map(l => l.title).join(", "), item, linked: next };
}

async function tg(token, method, body, fetchFn) {
  try { return await (await fetchFn("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json(); } catch { return null; }
}

// Handles one webhook request. deps: { env, fetchFn, queue, save(decision) }. Always answers 200 once the request is genuine.
export async function handleHook(request, deps) {
  const { env, fetchFn, queue, save, current } = deps;
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { status: 404 };
  const given = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const want = await hookSecret(env.TELEGRAM_BOT_TOKEN);
  if (given.length !== want.length || [...given].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ want.charCodeAt(i)), 0) !== 0) return { status: 401 };
  let update; try { update = await request.json(); } catch { return { status: 400 }; }
  const msg = update && update.message;
  // The owner may talk to the bot in their own chat or in the Topics group; what matters is that the sender is the owner.
  const okChat = id => String(id) === String(env.TELEGRAM_CHAT_ID) || (env.TELEGRAM_GROUP_ID && String(id) === String(env.TELEGRAM_GROUP_ID));
  if (msg && String(msg.from && msg.from.id) === String(env.TELEGRAM_CHAT_ID) && /^\/here(@\w+)?\s*$/i.test(msg.text || "")) {
    // Setup helper (works from any chat, but only for you, so it can be used before the group id is saved): say /here inside a Topic and the bot tells you the group id and that Topic's id.
    await tg(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: msg.chat.id, ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}), text: "Group ID: " + msg.chat.id + "\nTopic ID: " + (msg.message_thread_id || "none (this is the General topic or a normal chat)") }, fetchFn);
    return { status: 200 };
  }
  if (msg) { // a picture sent to the bot from your own chat goes in the inbox; the next infographic check reads it
    if (!okChat(msg.chat && msg.chat.id) || String(msg.from && msg.from.id) !== String(env.TELEGRAM_CHAT_ID)) return { status: 200 };
    const ph = photoOf(msg);
    if (ph && deps.saveInbox) {
      await deps.saveInbox(ph);
      await tg(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: msg.chat.id, ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}), reply_to_message_id: msg.message_id, text: "📥 Got it. It will be read and added to your review list at the next check (within about 2 hours), then sent back here with buttons to link it to an event." }, fetchFn);
    } else if (!msg.text || !/^\/start/.test(msg.text)) await tg(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: msg.chat.id, text: "Send me a picture (an event infographic) and I will add it to your review list." }, fetchFn);
    return { status: 200 };
  }
  const cq = update && update.callback_query; if (!cq) return { status: 200 };
  const chat = cq.message && cq.message.chat && cq.message.chat.id;
  if (!okChat(chat) || String(cq.from && cq.from.id) !== String(env.TELEGRAM_CHAT_ID)) return { status: 200 };
  const tap = parseTap(cq.data);
  const reply = text => tg(env.TELEGRAM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: false }, fetchFn);
  if (!tap) { await reply("Unknown button."); return { status: 200 }; }
  const r = decideTap(tap, queue, current ? await current(tap.id) : null);
  if (r.error) { await reply(r.error); return { status: 200 }; }
  await save(r.decision);
  await reply(r.note.slice(0, 120));
  const base = cq.message.caption || cq.message.text || "";
  await tg(env.TELEGRAM_BOT_TOKEN, cq.message.photo ? "editMessageCaption" : "editMessageText", { chat_id: chat, message_id: cq.message.message_id, ...(cq.message.photo ? { caption: base.split("\n\n")[0] + "\n\n" + r.note } : { text: base + "\n\n" + r.note }), reply_markup: keyboard(r.item, r.linked) }, fetchFn);
  return { status: 200, decision: r.decision };
}
