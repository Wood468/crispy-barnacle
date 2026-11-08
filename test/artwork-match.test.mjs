import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseIconPath, buildIndex, treeFileToPaths } from '../scripts/inventory-pokeminers.mjs';
import { extractIconRefs, costumeLabelFromAlt, candidatesFromPage, gameMasterForms, isAvatarItemName, missingIdentities, slug } from '../scripts/artwork-match.mjs';
const V = createRequire(import.meta.url)('../public/variant-art.js');
const html = fs.readFileSync(new URL('./fixtures/leekduck-future-event.html', import.meta.url), 'utf8');
const dexNames = JSON.parse(fs.readFileSync(new URL('../public/dex.json', import.meta.url), 'utf8')).map(p => [p[0], p[1]]).concat([[1100, 'Futuremon']]);
const index = JSON.parse(fs.readFileSync(new URL('../docs/asset-inventory/pokeminers-index.json', import.meta.url), 'utf8'));
const gm = gameMasterForms([{ data: { formSettings: { pokemon: 'PIKACHU', forms: [{ form: 'PIKACHU_NORMAL' }, { form: 'PIKACHU_GOFEST_2024_STIARA', isCostume: true }] } } },
  { data: { formSettings: { pokemon: 'ESPEON', forms: [{ form: 'ESPEON_GOFEST_2024_SSCARF', isCostume: true }] } } }]);

test('PokeMiners icon names parse into dex, prefix, code, gender and shiny; portraits and clothing do not', () => {
  assert.deepEqual(parseIconPath('Images/Pokemon/Addressable Assets/pm25.fGOFEST_2024_STIARA.s.icon.png'), { dex: 25, prefix: 'f', code: 'GOFEST_2024_STIARA', female: false, shiny: true });
  assert.deepEqual(parseIconPath('Images/Pokemon/Addressable Assets/pm25.cFALL_2018.g2.icon.png'), { dex: 25, prefix: 'c', code: 'FALL_2018', female: true, shiny: false });
  assert.deepEqual(parseIconPath('Images/Pokemon/Addressable Assets/pm854.icon.png'), { dex: 854, prefix: '', code: '', female: false, shiny: false });
  assert.equal(parseIconPath('Images/Pokemon/Addressable Assets/pm115.fMEGA.portrait.png'), null);
  assert.equal(parseIconPath('Images/Clothing/Shirts/m_shirt_whitecoat_00_bundle_icon.png'), null);
});
test('the committed index is built from a real tree and knows the approved files, not the missing ones', () => {
  assert.match(index.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(index.pokemon[25].fGOFEST_2024_STIARA, /n.*s|ns/); assert.ok(index.pokemon[25].fGOFEST_2024_STIARA.includes('n') && index.pokemon[25].fGOFEST_2024_STIARA.includes('s'));
  assert.equal(index.pokemon[854].fP_HALLOWEEN_2026_01, undefined);
  assert.ok(index.pokemon[6].fGIGANTAMAX);
  assert.equal(buildIndex(treeFileToPaths('100644 blob abc\tImages/Pokemon/Addressable Assets/pm1.fX.icon.png\n100644 blob def\tImages/Pokemon/Addressable Assets/pm1.fX.s.icon.png')).pokemon[1].fX, 'ns');
});
test('alt text yields the costume label', () => {
  assert.equal(costumeLabelFromAlt('Pikachu wearing a sun crown'), 'sun crown');
  assert.equal(costumeLabelFromAlt('Gengar wearing a Spooky Festival costume'), 'Spooky Festival');
  assert.equal(costumeLabelFromAlt('Sinistea'), '');
});
test('event page icons are extracted once, from the expected host only', () => {
  const refs = extractIconRefs(html);
  assert.deepEqual(refs.map(r => r.file), ['pm196.fGOFEST_2024_SSCARF.icon.png', 'pm25.fGOFEST_2024_STIARA.icon.png', 'pm854.fP_HALLOWEEN_2026_01.icon.png', 'pm1100.fPARTY_2027_01.icon.png']);
});
test('future-announcement ingestion: new costumes become reviewable candidates, never approved', () => {
  const c = candidatesFromPage({ html, pageUrl: 'https://leekduck.com/events/x/', dexNames, index, gm, now: '2026-11-08' });
  const by = Object.fromEntries(c.map(x => [x.id, x]));
  assert.deepEqual(Object.keys(by).sort(), ['espeon-sun-scarf', 'futuremon-party-hat', 'pikachu-sun-crown', 'sinistea-bow']);
  assert.equal(by['pikachu-sun-crown'].strength, 'source+pokeminers+gamemaster');
  assert.equal(by['espeon-sun-scarf'].gameMaster.isCostume, true);
  assert.equal(by['sinistea-bow'].inPokeMiners.normal, false);
  assert.equal(by['sinistea-bow'].strength, 'source-only');
  assert.equal(by['futuremon-party-hat'].strength, 'source-only');
  assert.ok(c.every(x => x.status === 'candidate'), 'machine checks never approve');
});
test('already-known identities are skipped', () => {
  const known = new Set(['25|sun-crown|fGOFEST_2024_STIARA']);
  assert.ok(!candidatesFromPage({ html, dexNames, index, gm, known }).some(x => x.id === 'pikachu-sun-crown'));
});
test('trainer clothing is classified as an avatar item, not a costume', () => {
  assert.equal(isAvatarItemName('Tee'), true); assert.equal(isAvatarItemName('GO Wild Area 2026 Tee (Purple)'), true);
  assert.equal(isAvatarItemName('Pikachu'), false); assert.equal(isAvatarItemName('Espeon wearing a sun scarf'), false);
});
test('a catalogue shaped like a new event lists only the costumes that lack approved art', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../public/artwork-manifest.json', import.meta.url), 'utf8')).entries;
  const events = [{ eventId: 'future', pokemon: [
    { speciesId: '25', name: 'Pikachu', costumeId: 'suncrown', label: 'sun crown' },
    { speciesId: '854', name: 'Sinistea', costumeId: 'bow', label: 'Bow' },
    { speciesId: '1100', name: 'Futuremon', costumeId: 'partyhat', label: 'party hat' },
    { speciesId: '25', name: 'Tee', costumeId: 'purple', label: 'Purple' },
    { speciesId: '25', name: 'Pikachu' }] }];
  assert.deepEqual(missingIdentities(events, manifest, V.variantKey).map(x => x.label), ['Bow', 'party hat']);
});
test('slug is stable', () => assert.equal(slug('Sun Crown!'), 'sun-crown'));
