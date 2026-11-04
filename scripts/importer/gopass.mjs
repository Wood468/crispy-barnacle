import { decode } from "./text.mjs";

const TAG = /<\/?div\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
const OPEN_DIV = /<div\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
const GENERIC_ALTS = new Set(["pokemon", "item", "reward", "rewards", "icon", "candy", "xp", "stardust", "pokecoin"]);

function attr(tag, name) {
  const m = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}
function classes(tag) { return String(attr(tag, "class") || "").split(/\s+/).filter(Boolean); }
function cleanText(markup) {
  return decode(String(markup || "").replace(/<[^>]*>/g, " ").replace(/\u00a0/g, " "))
    .replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function stripNonMarkup(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
}

function containerBlock(html) {
  const source = stripNonMarkup(html);
  const matches = [];
  let m;
  OPEN_DIV.lastIndex = 0;
  while ((m = OPEN_DIV.exec(source))) {
    const cls = classes(m[0]);
    if (cls.includes("battle-pass-container")) matches.push({ start: m.index, openEnd: OPEN_DIV.lastIndex, cls });
  }
  OPEN_DIV.lastIndex = 0;
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error("Expected one battle-pass-container; found " + matches.length);
  const root = matches[0];
  if (!root.cls.includes("-has-toggle")) throw new Error("battle-pass-container is missing -has-toggle");
  let depth = 1, token;
  TAG.lastIndex = root.openEnd;
  while ((token = TAG.exec(source))) {
    const closing = /^<\//.test(token[0]);
    if (closing) depth--;
    else if (!/\/\s*>$/.test(token[0])) depth++;
    if (depth === 0) {
      const end = TAG.lastIndex;
      TAG.lastIndex = 0;
      return source.slice(root.start, end);
    }
  }
  TAG.lastIndex = 0;
  throw new Error("Unbalanced battle-pass-container div");
}

function divTree(markup) {
  const root = { classes: [], children: [], start: 0, openEnd: 0, closeStart: markup.length, end: markup.length };
  const stack = [root];
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(markup))) {
    if (/^<\//.test(m[0])) {
      if (stack.length === 1) throw new Error("Unexpected closing div in battle-pass markup");
      const node = stack.pop();
      node.closeStart = m.index;
      node.end = TAG.lastIndex;
    } else {
      if (/\/\s*>$/.test(m[0])) throw new Error("Self-closing div is not supported in battle-pass markup");
      const node = { tag: m[0], classes: classes(m[0]), children: [], start: m.index, openEnd: TAG.lastIndex, closeStart: null, end: null };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
  }
  TAG.lastIndex = 0;
  if (stack.length !== 1) throw new Error("Unbalanced div inside battle-pass markup");
  if (root.children.length !== 1) throw new Error("Expected one root battle-pass div");
  return root.children[0];
}
function descendants(node) {
  const out = [];
  for (const child of node.children || []) { out.push(child, ...descendants(child)); }
  return out;
}
function inner(node, markup) { return markup.slice(node.openEnd, node.closeStart); }
function has(node, token) { return node.classes.includes(token); }
function namedSpan(markup, token) {
  const re = /<span\b(?:"[^"]*"|'[^']*'|[^>"'])*>([\s\S]*?)<\/span\s*>/gi;
  const found = [];
  let m;
  while ((m = re.exec(markup))) {
    const openEnd = m[0].indexOf(">") + 1;
    if (classes(m[0].slice(0, openEnd)).includes(token)) found.push(cleanText(m[1]));
  }
  return found;
}
function imageAlts(markup) {
  const re = /<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
  const out = [];
  let m;
  while ((m = re.exec(markup))) {
    const value = attr(m[0], "alt");
    if (value !== null && cleanText(value)) out.push(cleanText(value));
  }
  return out;
}
function normalise(value) {
  return cleanText(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function validateAlt(name, alts, rank, track) {
  const target = normalise(name);
  for (const altText of alts) {
    const alt = normalise(altText);
    if (!alt || GENERIC_ALTS.has(alt)) continue;
    if (!target.includes(alt)) {
      throw new Error("img alt " + JSON.stringify(altText) + " does not match reward-name at rank " + rank + " (" + track + ")");
    }
  }
}
function parseRewardItem(node, markup, rank, track) {
  const opening = markup.slice(node.start, node.openEnd);
  const bonus = String(attr(opening, "data-bonus") || "").toLowerCase() === "true";
  const body = inner(node, markup);
  const names = namedSpan(body, "reward-name");
  if (names.length !== 1 || !names[0]) throw new Error("Expected one non-empty reward-name at rank " + rank + " (" + track + ")");
  const alts = imageAlts(body);
  validateAlt(names[0], alts, rank, track);
  return { name: names[0], alts, bonus };
}
function parseTrack(rankNode, markup, rank, kind) {
  const blocks = descendants(rankNode).filter(n => has(n, "rank-rewards") && has(n, kind));
  if (blocks.length !== 1) throw new Error("Expected one rank-rewards." + kind + " block at rank " + rank);
  const track = blocks[0];
  const rewardNodes = descendants(track).filter(n => has(n, "reward-item"));
  const emptyNodes = descendants(track).filter(n => has(n, "no-rewards"));
  if (!rewardNodes.length) {
    if (emptyNodes.length !== 1 || !["-", "–", "—"].includes(cleanText(inner(emptyNodes[0], markup)))) {
      throw new Error("Empty " + kind + " track at rank " + rank + " lacks an explicit no-rewards marker");
    }
    if (kind === "basic") throw new Error("Basic track is unexpectedly empty at rank " + rank);
    return { items: [], empty: true };
  }
  if (emptyNodes.length) throw new Error("Track at rank " + rank + " contains both rewards and no-rewards");
  const items = rewardNodes.map(n => parseRewardItem(n, markup, rank, kind));
  const bonuses = items.filter(x => x.bonus);
  if (bonuses.length && (kind !== "basic" || rank !== 1 || bonuses.length !== items.length)) {
    throw new Error("Unexpected data-bonus reward item at rank " + rank + " (" + kind + ")");
  }
  return { items, empty: false };
}

/**
 * Extract the rendered Leek Duck battle-pass DOM.
 * Returns null when the page has no battle-pass container. Ranks are only
 * returned when explicitly present in the markup; ellipses are recorded but
 * no missing rank numbers or rewards are inferred.
 */
export function extractLeekDuckGoPassRewards(html) {
  const markup = containerBlock(html);
  if (!markup) return null;
  const root = divTree(markup);
  if (!has(root, "battle-pass-container") || !has(root, "-has-toggle")) throw new Error("Unexpected battle-pass root structure");
  const rewardRoots = descendants(root).filter(n => has(n, "battle-pass-rewards"));
  if (rewardRoots.length !== 1) throw new Error("Expected one battle-pass-rewards container");
  const rankNodes = descendants(rewardRoots[0]).filter(n => has(n, "rank-item"));
  if (!rankNodes.length) throw new Error("battle-pass-rewards contains no rank-item blocks");
  if (rankNodes.length > 111) throw new Error("GO Pass rank-item count exceeds the supported 110 reward-row cap plus one ellipsis");

  const order = [], ranks = [], bonusItems = [], tickets = [], seen = new Set();
  let previous = 0, ellipsisCount = 0;
  for (const node of rankNodes) {
    if (has(node, "rank-ellipsis")) {
      ellipsisCount++;
      if (descendants(node).some(n => has(n, "rank-number") || has(n, "rank-rewards") || has(n, "reward-item"))) {
        throw new Error("rank-ellipsis unexpectedly contains rank rewards");
      }
      order.push({ type: "ellipsis" });
      continue;
    }
    const numberNodes = descendants(node).filter(n => has(n, "rank-number"));
    if (numberNodes.length !== 1) throw new Error("Expected one rank-number in rank-item");
    const rawRank = cleanText(inner(numberNodes[0], markup));
    if (!/^\d{1,3}$/.test(rawRank)) throw new Error("Invalid rank-number: " + JSON.stringify(rawRank));
    const rank = Number(rawRank);
    if (rank < 1 || rank > 999 || seen.has(rank)) throw new Error("Invalid or duplicate GO Pass rank " + rank);
    if (rank <= previous) throw new Error("GO Pass ranks are not in strictly increasing document order at rank " + rank);
    previous = rank; seen.add(rank);

    const trackNodes = descendants(node).filter(n => has(n, "rank-rewards"));
    if (trackNodes.length !== 2) throw new Error("Expected exactly Basic and Deluxe tracks at rank " + rank);
    const basic = parseTrack(node, markup, rank, "basic");
    const deluxe = parseTrack(node, markup, rank, "deluxe");
    if (trackNodes.filter(n => has(n, "basic")).length !== 1 || trackNodes.filter(n => has(n, "deluxe")).length !== 1) {
      throw new Error("Rank " + rank + " is missing one of the Basic/Deluxe tracks");
    }
    const rankBonuses = basic.items.filter(x => x.bonus);
    rankBonuses.forEach(item => bonusItems.push({ rank, track: "basic", name: item.name, imgAlts: item.alts }));
    const basicRewards = basic.items.filter(x => !x.bonus).map(x => x.name);
    const deluxeRewards = deluxe.items.filter(x => !x.bonus).map(x => x.name);
    if (basicRewards.length || deluxeRewards.length) {
      tickets.push("Rank " + rank + ": Free: " + (basicRewards.join(" · ") || "—") + " | Deluxe: " + (deluxeRewards.join(" · ") || "—"));
    }
    ranks.push({ rank, basic: basicRewards, deluxe: deluxeRewards, deluxeEmpty: deluxe.empty });
    order.push({ type: "rank", rank });
  }
  if (ellipsisCount > 1) throw new Error("More than one rank-ellipsis placeholder was found");
  if (ellipsisCount && (order[0]?.type === "ellipsis" || order[order.length - 1]?.type === "ellipsis")) {
    throw new Error("rank-ellipsis must appear between explicit rank blocks");
  }
  if (ranks.length > 110 || tickets.length > 110) throw new Error("GO Pass rank rewards exceed the 110-row cap");
  const gaps = [];
  order.forEach((item, index) => {
    if (item.type !== "ellipsis") return;
    const before = order.slice(0, index).reverse().find(x => x.type === "rank");
    const after = order.slice(index + 1).find(x => x.type === "rank");
    if (!before || !after) throw new Error("rank-ellipsis is not between numbered ranks");
    gaps.push({ beforeRank: before.rank, afterRank: after.rank });
  });
  return { ranks, gaps, bonusItems, tickets };
}
