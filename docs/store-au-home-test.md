# One-off test: read the Pokémon GO web store from home in Melbourne (Windows)

Why: the hourly GitHub reader runs from a US address and sees US$ prices. From your home connection the same store should show A$ prices and Australia-only items (for example a separate Dynamax Trails GO Pass at A$7.99, or a Pawniard Community Day ticket). This is a single manual run. Nothing is scheduled, nothing signs in, and no password, token or secret is needed. It does not touch the repo: it only writes one file in a folder you choose.

Do this on the Windows 11 PC at home, on your normal home internet (no VPN, and not Tailscale exit-node mode).

## Steps (PowerShell)

1. Install Python (skip if `py --version` already prints 3.10 or newer). Open **PowerShell** and run:
   ```powershell
   winget install -e --id Python.Python.3.12
   ```
   Then **close PowerShell and open a new one** so Python is found.

2. Make a work folder and go into it:
   ```powershell
   mkdir $HOME\store-test
   cd $HOME\store-test
   ```

3. Install Playwright and its Chromium browser (about 150 MB, a few minutes):
   ```powershell
   py -m pip install playwright
   py -m playwright install chromium
   ```

4. Download the one script file (no git needed):
   ```powershell
   Invoke-WebRequest https://raw.githubusercontent.com/Wood468/crispy-barnacle/main/scripts/store_snapshot.py -OutFile store_snapshot.py
   ```

5. Run it. It opens an invisible browser, scrolls the store for about a minute, then saves the file:
   ```powershell
   py store_snapshot.py au-home-store.json
   ```
   Success ends with `Saved N items`.

6. Find the output. It is in the folder you are in:
   ```powershell
   explorer $HOME\store-test
   ```
   The file is `au-home-store.json` (that is `C:\Users\<you>\store-test\au-home-store.json`). Attach that file in chat.

## What to look for (open the file in Notepad)

- `"price"` values starting with `A$` (for example `"A$7.99"`). If they start with `US$` or `$`, the store still thinks you are not in Australia; tell me.
- The Australia-only items: a separate Dynamax Trails GO Pass, a Pawniard Community Day ticket. Search the file for `Pawniard` and `Trails`.
- Any sign-in wall or captcha: the error line in PowerShell, or item names/text such as "sign in", "verify you are human", "access denied".
- `"loadComplete": true` near the bottom, which means the page finished loading.

## If something goes wrong

- `py` is not recognised: close and reopen PowerShell after step 1, or install Python from python.org and tick "Add python.exe to PATH".
- The script prints `::error title=Store page did not load::...`: copy that whole line and paste it in chat. This is the login wall / captcha / block case, and the line says what the page showed.
- `Store page returned too few items`: same, paste the message. No file is written.
- Chromium will not install or will not start (antivirus, work-managed PC, firewall): try once more from a normal (non-admin) PowerShell; if it still fails, skip the script and instead open store.pokemongo.com in your normal browser at home, set it to the Australian store if asked, and send a screenshot of the prices. Do not sign in or enter any card details for this test.
- Do not run it more than a couple of times; repeated automated visits can trigger blocking.

When you are done you can delete the folder: `Remove-Item -Recurse $HOME\store-test`.

Tested only in a Linux sandbox for syntax and unit tests. It has not been run from Melbourne or on Windows.
