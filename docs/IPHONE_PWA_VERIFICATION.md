# Installed iPhone PWA: physical-device verification protocol

Automated evidence (CI `webkit` and `browser (b)` jobs, `test/pwa_upgrade_browser.py`) covers the service-worker upgrade in real WebKit and Chromium. It is **not** an installed-iPhone proof. Use this checklist on the owner's iPhone and note the results in issue #364.

Keys that must survive: `gofn-dex-v1`, `gofn-us-v1`, `gofn-stamp`, `gofn-today-done-v1`.

## Before you start
- [ ] iPhone on iOS 17 or later, Safari. Note iOS version: ______
- [ ] Note the current shell version: open `https://pogo.michaelpuff.com/sw.js`, copy the `gofn-shell-vNNN` line: ______

## 1. Install and populate
- [ ] Safari: open the site, Share, **Add to Home Screen**. Open it from the Home Screen icon (no Safari bars).
- [ ] Collection: mark 3 Pokémon as owned and 1 as shiny. Open Today and **Mark done** on one event. Note which: ______
- [ ] Screenshot Collection (count of owned) and the Marked done list.

## 2. Offline with the installed shell
- [ ] Wait 10 seconds online, then force-close the app (swipe up) and enable **Airplane Mode**.
- [ ] Reopen from the icon: Today, Schedule, one Event Details page and Collection all render. The "You are offline" notice shows; no blank page.
- [ ] Collection counts and the Done event are unchanged.

## 3. Deploy the upgrade
- [ ] Turn Airplane Mode off. Ask for a deploy that bumps `gofn-shell-vNNN` (or wait for the next one). Confirm `/sw.js` shows the new version: ______
- [ ] Open the app from the icon, wait about 10 seconds, force-close and reopen (the new worker takes over on the next launch or reload).

## 4. Offline after the upgrade
- [ ] Airplane Mode on again, force-close, reopen from the icon.
- [ ] Today, Schedule, Event Details and Collection still render from cache.
- [ ] Collection counts, the shiny mark and the Marked done entry are exactly as in step 1.
- [ ] Undo the Done event: it returns to Today. Mark it done again.

## 5. Storage failure (optional, Safari Private Browsing)
- [ ] In a Private tab, open the site and Mark done: expect the message "Couldn't save — storage is full or unavailable" with **Try again** and the event stays on Today.

## Pass criteria
All boxes ticked, no data loss, no blank screen. Record: iOS version, old and new shell versions, screenshots. Any failure: do not reinstall; report it first so the data can be inspected.
