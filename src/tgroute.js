// Which Telegram chat (and which Topic inside a group) each kind of message goes to.
//   events   - starting soon, saved-event reminders, the week ahead
//   pictures - infographics (with the buttons), the weekly picture, pictures forwarded from Discord
//   changes  - new events found, store changes, the daily nudge, announced-event alerts
//   system   - data checks, health alerts, the weekly data report
// Settings (all optional): TELEGRAM_GROUP_ID (the group) and TELEGRAM_TOPIC_EVENTS / _PICTURES / _CHANGES / _SYSTEM (each Topic's id).
// A category with no Topic id, or no group, goes to TELEGRAM_CHAT_ID as before, so nothing breaks if only some are set.
export const CATEGORIES = ["events", "pictures", "changes", "system"];
export function route(env, cat) {
  const group = String((env && env.TELEGRAM_GROUP_ID) || "").trim(), U = String(cat).toUpperCase(), topic = String((env && (env["TELEGRAM_TOPIC_" + U] || env["TELEGRAM_TOPICS_" + U])) || "").trim(); // TOPIC_ or TOPICS_ both work
  if (group && /^-?\d+$/.test(group)) return { chat: group, thread: /^\d+$/.test(topic) ? Number(topic) : 0 };
  return { chat: String((env && env.TELEGRAM_CHAT_ID) || ""), thread: 0 };
}
// Quiet hours per Topic: inside the window a message still arrives, but silently (no sound or buzz), so it is there to read in the morning.
// Defaults are 22-7 Melbourne time for everything except Pictures, which can ping any time. Change one with QUIET_EVENTS / QUIET_PICTURES /
// QUIET_CHANGES / QUIET_SYSTEM set to "from-to" in Melbourne hours (e.g. "23-6"), or "off" for never silent.
const QUIET_DEFAULT = { events: "22-7", pictures: "off", changes: "22-7", system: "22-7" };
export function quietWindow(env, cat) {
  const raw = String((env && env["QUIET_" + String(cat).toUpperCase()]) || QUIET_DEFAULT[cat] || "off").trim().toLowerCase();
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  return m && +m[1] < 24 && +m[2] < 24 ? [+m[1], +m[2]] : null;
}
export function isQuiet(env, cat, now = new Date()) {
  const w = quietWindow(env, cat); if (!w) return false;
  const h = +new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "numeric", hourCycle: "h23" }).format(now), [a, b] = w;
  return a === b ? false : a < b ? h >= a && h < b : h >= a || h < b;
}
// A fetch that sends every Telegram message for this job to the right chat and Topic. Other calls pass through untouched.
export function routed(env, cat, base = (...a) => fetch(...a), now = () => new Date()) {
  const dest = route(env, cat);
  return (url, opts = {}) => {
    const m = /api\.telegram\.org\/bot[^/]+\/(\w+)/.exec(String(url));
    if (!m || !dest.chat || !/^(send|edit)/.test(m[1])) return base(url, opts);
    const thread = dest.thread && /^send/.test(m[1]) ? dest.thread : 0, silent = /^send/.test(m[1]) && isQuiet(env, cat, now());
    if (typeof opts.body === "string") {
      try { const b = JSON.parse(opts.body); b.chat_id = dest.chat; if (thread) b.message_thread_id = thread; if (silent && b.disable_notification === undefined) b.disable_notification = true; return base(url, { ...opts, body: JSON.stringify(b) }); } catch { return base(url, opts); }
    }
    if (opts.body && typeof opts.body.set === "function") { opts.body.set("chat_id", dest.chat); if (thread) opts.body.set("message_thread_id", String(thread)); if (silent && !opts.body.has("disable_notification")) opts.body.set("disable_notification", "true"); }
    return base(url, opts);
  };
}
