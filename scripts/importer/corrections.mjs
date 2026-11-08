// Source lines that a stronger source contradicts or does not confirm are rewritten here, from
// data/line-corrections.json ({ lines: [{ match, text, reason }] }), so every importer run keeps them
// consistent with the curated record instead of re-publishing the secondary-source wording.
export function applyLineCorrections(events, corrections = []) {
  const byText = new Map((corrections || []).filter(c => c && c.match && c.text).map(c => [c.match, c.text]));
  let changed = 0;
  if (!byText.size) return changed;
  for (const record of Object.values(events || {})) {
    for (const lines of Object.values((record && record.fields) || {})) {
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        if (line && typeof line === 'object' && byText.has(line.text)) { line.text = byText.get(line.text); changed++; }
      }
    }
  }
  return changed;
}
