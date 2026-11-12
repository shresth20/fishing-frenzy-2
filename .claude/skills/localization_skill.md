---
name: game-i18n
description: Key-based text + voice-over for games (HTML/CSS/JS). Apply from line one of any game and on every text or audio edit.
---

# game-i18n

- All text and audio by **key**. Never hard-code a string.
- Text: JS `T('key')`; HTML `data-i18n="key"`. Add the English line to `locales/locales.json` → `"en"` as you write it.
- Audio: `I18n.voice('key')` = `assets/VO/en/<key>.webm`; `I18n.say('key')` plays it. Same key as the text. 1 key = 1 spoken line; a line whose words vary gets a key per variant.
- Keys: camelCase `p01Hey`, `fbCorrect`, `btnNext`; array items `key.0`.
- `locales.json`: **English only**. No other language until explicitly asked. Keep `?lan=` working.
- Missing key shows the key itself — leave it visible, fix the JSON.
- Setup: copy `i18n.js` → `js/`, `locales.json` → `locales/`. In `index.html`: load `js/i18n.js`, then `I18n.load(() => { I18n.applyStatic(); /* append js/script.js */ })`.
- file:// needs `locales/locales.js` — command in `i18n.js` header.
