# NeuroBridge extension 3.0

## Install (unpacked)
1. Chrome > `chrome://extensions` > turn on Developer mode > Load unpacked > pick this folder.
2. Open the NeuroBridge popup > Listen > Voice engine, paste your Sarvam key and press Test voice.
   (Or put the key in `config.js` as `SARVAM_API_KEY` before loading.)
3. Reload any tabs that were already open, or just press Read this page; the extension injects itself.

## What changed from 2.0
- New popup that matches the website: Display and Listen tabs, a live preview sheet, fonts shown in their own typeface.
- Before the assessment the person adjusts everything by hand. After it, the site's result sets font, size,
  letter/word/line/paragraph spacing and background automatically (`shared/profile.js`). Manual tweaks sit behind
  "Fine-tune manually" and can be undone with "Restore my profile". See `SITE_INTEGRATION.md` for the one
  `postMessage` the site must send when the test ends.
- Read aloud with Sarvam Bulbul v3 voices (11 Indian languages, auto-detected per sentence), sentence-by-sentence
  highlighting, pause / skip / speed, a floating player, a Listen bubble on any selected text, "From here",
  right-click menu and the Alt+Shift+R shortcut. Falls back to the device voice when there is no key or Sarvam errors.

## Files
- `manifest.json`, `config.js` (key, site URL), `background.js` (Sarvam calls, context menu, shortcut)
- `content/display.js` page styling, `content/reader.js` read-aloud, `content/bridge.js` talks to the website
- `shared/defaults.js` settings and validation, `shared/profile.js` result-to-settings mapping
- `popup/` the UI

## Before publishing
- Replace `http://localhost:5147` in `config.js` and in the `bridge.js` match pattern in `manifest.json`.
- A key inside an extension is readable by anyone who installs it. For a public release, route TTS through your own
  backend and set `SARVAM_URL` in `config.js` to that endpoint.
