// Compares what several sources say about one event. Agreement is by meaning (shared words), not exact text.
import { FIELDS } from "./extract.mjs";

const STOP = new Set(["the", "a", "an", "and", "of", "to", "in", "on", "at", "for", "is", "are", "will", "be", "with", "during", "event", "pokemon", "pokémon", "go", "from", "that", "this", "you", "your", "can", "all", "more"]);
const canon = s => String(s).replace(/\b1\s?\/\s?4\b/g, "quarter").replace(/\b1\s?\/\s?2\b/g, "half").replace(/\bdouble\b/gi, "2×").replace(/\btriple\b/gi, "3×").replace(/\b(\d(?:\.\d)?)x\b/gi, "$1×");
export const toks = s => new Set(canon(s).normalize("NFKD").toLowerCase().replace(/[^a-z0-9.×]+/g, " ").split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)));
export function similar(a, b) {
  const ra = /^rank (\d+)( deluxe)?/i.exec(a), rb = /^rank (\d+)( deluxe)?/i.exec(b);
  // A structured rank row never merges with prose, however many words they share ("Encounter Dynamax Meltan and earn a Silver Bottle Cap!" swallowed Rank 100).
  if (!!ra !== !!rb) return false;
  if (ra && rb) { if (ra[1] !== rb[1] || !!ra[2] !== !!rb[2]) return false; const nums = t => [...t.matchAll(/\d[\d,.]*/g)].map(x => x[0]).slice(1).join(","); if (nums(a) !== nums(b)) return false; }
  const A = toks(a), B = toks(b); if (!A.size || !B.size) return false;
  let n = 0; for (const t of A) if (B.has(t)) n++;
  return n / Math.min(A.size, B.size) >= 0.7 && n >= Math.min(2, A.size, B.size);
}
// "2× Catch XP" vs "3× Catch XP": same subject, different number.
function mult(s) { const m = canon(s).match(/(\d(?:\.\d)?)\s?[×x]\s*([a-z ]{2,40})/i); if (!m) return null; const subj = m[2].split(/\b(?:for|when|during|while|if|from|on|in|at|with|after|per)\b/i)[0]; const tail = m[2].slice(subj.length); return { n: m[1], subject: toks(subj), tail: toks(tail) }; }
export function disagree(a, b) {
  const x = mult(a), y = mult(b); if (!x || !y || x.n === y.n) return false;
  let n = 0; for (const t of x.subject) if (y.subject.has(t)) n++;
  if (!(n >= 1 && n / Math.max(x.subject.size, y.subject.size) >= 0.5)) return false;
  if (x.tail.size && y.tail.size) { let k = 0; for (const t of x.tail) if (y.tail.has(t)) k++; if (k === 0) return false; } // "from Power Spots" vs "from exploring" are different bonuses
  return true;
}

// results: [{ source: {id, name, trust, url}, fields }]  ->  merged entry
export function mergeSources(results) {
  const rank = r => (r.source.trust === "official" ? 0 : r.source.trust === "community" ? 1 : 2);
  const sorted = [...results].sort((a, b) => rank(a) - rank(b));
  const fields = {}, conflicts = [], gaps = [];
  for (const f of FIELDS) {
    const clusters = [];
    for (const r of sorted) for (const text of (r.fields[f] || [])) {
      let c = clusters.find(c => similar(c.text, text) || c.alts.some(a => similar(a, text)));
      if (!c) { c = { text, alts: [], sources: [], official: false }; clusters.push(c); } else if (c.text !== text) c.alts.push(text);
      if (!c.sources.includes(r.source.id)) c.sources.push(r.source.id);
      if (r.source.trust === "official") c.official = true;
    }
    if (f !== "dates") for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) if (!/^rank \d+/i.test(clusters[i].text) && disagree(clusters[i].text, clusters[j].text)) conflicts.push({ field: f, a: { text: clusters[i].text, sources: clusters[i].sources }, b: { text: clusters[j].text, sources: clusters[j].sources } });
    const have = results.filter(r => (r.fields[f] || []).length).map(r => r.source.id);
    if (have.length && have.length < results.length) gaps.push({ field: f, missingFrom: results.filter(r => !have.includes(r.source.id)).map(r => r.source.id) });
    const order = { official: 0, corroborated: 1, single: 2 };
    fields[f] = clusters.map(c => ({ text: c.text, sources: c.sources, status: c.official ? "official" : c.sources.length >= 2 ? "corroborated" : "single" })).sort((a, b) => order[a.status] - order[b.status]); { const isRk = x => /^rank \d+/i.test(x.text); let rk = fields[f].filter(isRk); /* Leek Duck's structured GO Pass table is the only rank-reward source that is parsed from markup; a prose rank line from another source (misspelt quantities, bonus text) must not sit beside it. */ if (rk.some(x => x.sources.includes("leekduck"))) rk = rk.filter(x => x.sources.includes("leekduck")); rk = rk.slice(0, 110); fields[f] = fields[f].filter(x => !isRk(x)).slice(0, 12).concat(rk); }
  }
  const taskMap = new Map();
  for (const r of sorted) for (const task of (r.fields.researchTasks || [])) {
    const key = JSON.stringify([task.category || "research", String(task.task || "").toLowerCase().replace(/\s+/g, " ").trim(), (task.rewards || []).map(x => [x.type, x.name, x.quantity, x.cpMin, x.cpMax]), task.occurrence || 1]);
    let item = taskMap.get(key);
    if (!item) { item = { ...task, sources: [], sourceRefs: [], official: false }; taskMap.set(key, item); }
    if (!item.sources.includes(r.source.id)) item.sources.push(r.source.id);
    const sourceRef = { id: r.source.id, name: r.source.name || r.source.id, trust: r.source.trust || "", url: r.source.url || "" };
    if (!item.sourceRefs.some(s => s.id === sourceRef.id && s.url === sourceRef.url)) item.sourceRefs.push(sourceRef);
    if (r.source.trust === "official") item.official = true;
  }
  const researchTasks = [...taskMap.values()].map(({ official, ...task }) => ({
    ...task, status: official ? "official" : task.sources.length >= 2 ? "corroborated" : "single"
  })).sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.task).localeCompare(String(b.task)));
  return { fields, conflicts, gaps, researchTasks };
}
