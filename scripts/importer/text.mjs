// Turns an article's HTML into a flat list of headings, bullets and paragraphs. No dependencies.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", times: "×", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", eacute: "é", hellip: "…" };
export function decode(s) {
  return String(s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const clean = s => decode(String(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

export function htmlToLines(html) {
  let h = String(html || "");
  const main = h.match(/<(main|article)\b[\s\S]*<\/\1>/i);
  if (main) h = main[0];
  h = h.replace(/<(script|style|nav|footer|header|aside|form|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const out = [];
  const re = /<(h[1-4]|li|p|tr|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(h))) {
    const tag = m[1].toLowerCase();
    let inner = m[2];
    if (tag === "tr") inner = inner.replace(/<\/t[dh]>/gi, " | ");
    if (tag === "li" || tag === "p") inner = inner.replace(/<(ul|ol)\b[\s\S]*?<\/\1>/gi, " ");
    // Leek Duck's "Tier 2 – Rank 25" headings hold their bonuses in plain blocks the list/paragraph scan skips: read what sits between this heading and the next.
    if (tag[0] === "h" && h.slice(m.index + m[0].length).search(/<h[1-6]\b/i) > 0 && /^(?:tier\s*\d+\W*)?\(?rank\s*\d+/i.test(clean(inner))) {
      const rest = h.slice(m.index + m[0].length), stop = rest.search(/<h[1-6]\b/i);
      const seg = stop < 0 ? rest.slice(0, 1500) : rest.slice(0, stop);
      const label = clean(inner);
      out.push({ t: "h", level: +tag[1], text: label });
      seg.split(/<\/(?:div|li|p|span|figcaption|td)>|<br\s*\/?>/i).map(clean).filter(x => x.length >= 6 && x.length <= 200).forEach(x => out.push({ t: "li", text: x }));
      continue;
    }
    const text = clean(inner).replace(/(\s*\|\s*)+$/, "").replace(/^\|\s*/, "");
    if (!text || text.length < 2) continue;
    if (tag[0] === "h") out.push({ t: "h", level: +tag[1], text });
    else out.push({ t: tag === "li" ? "li" : "p", text });
  }
  return out;
}
export function pageTitle(html) {
  const og = String(html).match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const t = og ? og[1] : (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  return clean(t).replace(/\s*[|–-]\s*(Leek Duck|Pokémon GO Hub|Pokemon GO Hub|Pokémon GO).*$/i, "");
}
