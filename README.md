# Fishing Frenzy 2

A voiced maths adventure about parallelograms: part 2 of Fishing Frenzy, played the way part 1 is, as one journey:

1. **The front page** is Popo's live "Fishing Frenzy 2" banner (`parts/fishing`): Popo on his raft, the logo, Play.
2. **The hook** (`parts/fishing`, `STORY.hook`): a short scripted story with nothing to press. Popo's nets tangle in
   the water, three shapes in a row; a leaping fish knocks the last one's corner over and it becomes a parallelogram,
   which stays open; a school swims into it and Popo hauls up the catch. Swiftee names the shape, Popo wonders what it
   is, and on "Let's find out!" the scene dims, the net's four edges are traced, its mesh fades and its outline glides
   into the lesson's first shape as the camera dives under the water.
3. **Swiftee's parallelogram lesson** (`parts/lesson`), played over the game's own lake, as in part 1: the game goes on
   drawing its water and fish under the lesson's see-through frame. After the hook the lesson dissolves in over the
   net's outline and starts on that shape at once; opened first (`?start=lesson`), its camera glides the game's view
   down to the sand, where a seashell opens, its pearl blows up the lesson's card and Swiftee, in her diving mask,
   dives in. 59 screens: from a trapezium to a parallelogram, its sides,
   angles and diagonals, three checkpoints and a recall. Each screen moves on by itself once its voice is done; a
   screen that asks for something waits for it.
4. **Popo's parallelogram nets** (`parts/fishing`): the wave brings Popo back, Swiftee welcomes him ("Great job!"), and
   eight nets, each a property to set before the net goes down (a drag zooms in on the net; Check sends it down, right or
   tangled; Catch closes it on the bunch of fish the child picks), asked as the
   lesson asks it; then "The End", and Play Again goes back to the front page.

Two voices only: Popo's, and Swiftee's studio voice for every other line in both parts.

## Run it

Static files, no build step: `python3 -m http.server 8000` at this folder's root, then open http://localhost:8000/.

- `?dev=1`: one panel (bottom left, folds with the backtick key) that jumps to the front page, any lesson screen or any
  part of the fishing game.
- `?start=fishing`: Play skips the lesson. `?debug`: `window.lessonDebug` in the lesson, `window.popoDebug` in the game.
- `parts/lesson/index.html?solo`: the lesson on its own page.

## Languages

Every word on screen comes from `locales/locales.json` by key (`shell/i18n.js`): `T('key')` in the scripts,
`data-i18n="key"` in the pages, `{{tx.*}}` in the lesson's markup. Pick the language with `?lan=<code>` (e.g.
`index.html?lan=hi`); the journey passes it on to both parts, and a language not in the file plays in English.

- `locales.json` holds English only for now. A translation is one more object beside `en` with the same keys (and its
  code in `supportedLanguages`). Keep `{placeholders}`, `\n` (a line break in Swiftee's bubble), notation (AB, ∠A, 68°)
  and the `*stars*` (a starred word is a key word: Popo's stressed words, the lesson's gold terms) - star the matching
  words of the translation.
- After every edit of `locales.json`, regenerate `locales/locales.js` (the copy the pages load, so they also work from
  disk) with the command at the top of `shell/i18n.js`.
- The voice-over is still English: each clip is found by its line's English, so the game's data keeps the English
  (`I18n.source` / `I18n.plain`) and only the screen shows the translation (`I18n.tr`); the words then appear in step
  with the English voice. A line's key is also its voice key, ready for recordings in other languages
  (`I18n.voice(key)`: `assets/VO/<lang>/<key>.webm`).
- Not translated: the `?dev=1` panel (a developer's tool), the `<noscript>` line (shown only without JavaScript) and the
  painted "Fishing Frenzy 2" logo (an image).

## How it fits together

`index.html` and `shell/journey.js` are the journey: the fishing game plays in one full-window frame (its banner is
the front page), the lesson in another laid over it, and they hand over to each other with a dissolve. Every part loads
`shell/bridge.js` first, which connects it to the journey: the Play tap unlocks one AudioContext and one `<audio>` in
the journey's page and the lesson plays its voice through them, so it needs no tap of its own. Each part's README
describes its game.

## Deploy

On Vercel: no build command, no output folder. `vercel.json` makes browsers revalidate each file; `.vercelignore`
leaves the tests, tools and docs out.

## Tests (Python Playwright)

- `python3 tests/lesson.py [chromium|webkit] [WxH] [touch]`: the whole lesson with real taps and drags.
- `python3 tests/journey.py`: the journey, from the banner's Play to the fishing and back.
