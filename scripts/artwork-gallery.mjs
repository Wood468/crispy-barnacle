// Renders docs/asset-inventory/approval-gallery.html from candidate-queue.json: one card per identity with the exact evidence,
// candidate pictures (linked from their source, never copied into this repository), checksums and the review reasoning.
//   node scripts/artwork-gallery.mjs            write the page
//   node scripts/artwork-gallery.mjs --check    exit 1 if the committed page is stale
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? u : '';
const STATUS = { approved: 'Approved for use', candidate: 'Needs owner decision', 'not-found': 'Not found', rejected: 'Rejected' };

function pic(f, label) {
  const src = safe(f.url);
  return '<figure class="pic">' + (src ? '<img src="' + esc(src) + '" alt="' + esc(label) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<div class="none">no image</div>')
    + '<figcaption><b>' + esc(label) + '</b><br>' + esc(f.width) + '×' + esc(f.height) + ' px · ' + esc(f.bytes) + ' bytes<br><code>sha256 ' + esc(f.sha256) + '</code>'
    + (f.blobSha ? '<br><code>git blob ' + esc(f.blobSha) + '</code>' : '') + (src ? '<br><a href="' + esc(src) + '" rel="noopener noreferrer">source file</a>' : '') + '</figcaption></figure>';
}

export function renderGallery(queue) {
  const cards = queue.items.map(it => {
    const title = it.item || (it.species + ' wearing ' + (it.label || it.costume).toLowerCase() + (it.form && it.form !== 'normal' ? ' (' + it.form + ' form)' : ''));
    let pics = '';
    if (it.approvedAsset) {
      const a = it.approvedAsset, base = 'https://raw.githubusercontent.com/' + a.sourceRepository + '/' + a.sourceCommit + '/';
      for (const k of ['normal', 'shiny']) pics += pic({ ...a[k], url: base + encodeURI(a[k].path) }, k === 'shiny' ? 'Shiny' : 'Normal');
    } else for (const c of it.candidates || []) pics += pic(c, c.kind || c.source);
    const review = it.approvedAsset ? it.approvedAsset.review : null;
    return '<article class="card ' + esc(it.status) + '" id="' + esc(it.id) + '"><header><h2>' + esc(title) + '</h2><span class="st">' + esc(STATUS[it.status] || it.status) + '</span></header>'
      + '<p class="meta">' + esc(it.kind) + (it.dex ? ' · dex ' + esc(it.dex) : '') + (it.asset || it.expectedAsset ? ' · asset <code>pm' + esc(it.dex) + '.' + esc((it.asset || it.expectedAsset).prefix + (it.asset || it.expectedAsset).code) + '</code>' : '') + ' · queue id <code>' + esc(it.id) + '</code></p>'
      + '<div class="pics">' + (pics || '<p class="none">No candidate image.</p>') + '</div>'
      + '<h3>Identity evidence</h3><ul>' + (it.identityEvidence || []).map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'
      + (review ? '<h3>Visual review</h3><p>' + esc(review.status) + ' by ' + esc(review.by) + ' on ' + esc(review.date) + '. ' + esc(review.notes) + '</p>' : '')
      + (it.candidates && !it.approvedAsset && it.candidates.some(c => c.review) ? '<h3>Visual review</h3><ul>' + it.candidates.map(c => '<li><b>' + esc(c.kind) + ':</b> ' + esc((c.review || {}).notes) + '</li>').join('') + '</ul>' : '')
      + (it.approvedAsset ? '<h3>Rights</h3><p>' + esc(it.approvedAsset.rights) + '</p>' : '')
      + (it.blockedBy && it.blockedBy.length ? '<h3>Why it is not live</h3><ul>' + it.blockedBy.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '')
      + (it.nextStep ? '<p class="next"><b>Next:</b> ' + esc(it.nextStep) + '</p>' : '')
      + '<p class="decide">Owner decision: <b>approve</b> or <b>reject</b> <code>' + esc(it.id) + '</code> (set <code>status</code> and <code>approvedAsset</code> in <code>docs/asset-inventory/candidate-queue.json</code>, then run <code>node scripts/artwork-manifest.mjs</code>).</p></article>';
  }).join('\n');
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artwork approval gallery</title>\n<style>\n'
    + ':root{--bg:#f6f6f8;--card:#fff;--ink:#1c1c22;--mut:#5a5a66;--line:#d9d9e0;--ok:#0b6b3a;--warn:#8a5a00;--bad:#9b1c1c}\n@media (prefers-color-scheme:dark){:root{--bg:#121216;--card:#1b1b22;--ink:#ececf2;--mut:#a3a3b2;--line:#34343f;--ok:#58d38f;--warn:#f2bf5a;--bad:#ff8a8a}}\n'
    + 'body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}main{max-width:900px;margin:0 auto}h1{font-size:1.4rem}h2{font-size:1.1rem;margin:0}h3{font-size:.85rem;margin:14px 0 4px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}\n'
    + '.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:14px 0}.card header{display:flex;gap:8px;justify-content:space-between;align-items:baseline;flex-wrap:wrap}.st{font-weight:700;font-size:.8rem}.approved .st{color:var(--ok)}.candidate .st{color:var(--warn)}.not-found .st,.rejected .st{color:var(--bad)}\n'
    + '.meta,.decide,.next{color:var(--mut);font-size:.85rem}.pics{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}.pic{margin:0;width:200px}.pic img{display:block;width:200px;height:200px;object-fit:contain;background:repeating-conic-gradient(#8883 0 25%,transparent 0 50%) 50%/16px 16px;border-radius:10px}.pic figcaption{font-size:.72rem;color:var(--mut);overflow-wrap:anywhere}code{font-size:.72rem;overflow-wrap:anywhere}ul{padding-left:18px;margin:4px 0}li{margin:2px 0}.none{color:var(--mut)}\n'
    + '</style></head><body><main><h1>Artwork approval gallery</h1>\n<p>Generated from <code>candidate-queue.json</code> (' + esc(queue.generatedAt) + '). Pictures are linked from their source and are not stored in this repository. Pokémon and Pokémon GO artwork is Niantic / The Pokémon Company / Nintendo / Game Freak property; nothing here grants a licence. Identity is checked from several sources and the pixels were viewed; rights remain the owner\'s call.</p>\n'
    + cards + '\n</main></body></html>\n';
}

async function main() {
  const queue = JSON.parse(await readFile('docs/asset-inventory/candidate-queue.json', 'utf8')), html = renderGallery(queue), target = 'docs/asset-inventory/approval-gallery.html';
  if (process.argv.includes('--check')) { let cur = ''; try { cur = await readFile(target, 'utf8'); } catch { /* missing */ } if (cur !== html) { console.error(target + ' is stale: run node scripts/artwork-gallery.mjs'); process.exit(1); } console.log('gallery is current'); return; }
  await writeFile(target, html); console.log('wrote ' + target + ' (' + queue.items.length + ' identities)');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
