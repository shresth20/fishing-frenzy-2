# Voice-over

Every line Swiftee says is a recorded clip: 110 clips, about 10 minutes of audio, in `assets/vo/` (Ogg Opus, 32 kbps,
mono), every one at the same loudness (-16.4 LUFS) and saying each word the same way. The game plays the clip for a
line and types the words at the clip's pace.

| File | What it is |
|---|---|
| `assets/vo/voNNN.ogg` | one clip per line, numbered in the order a learner first hears them |
| `tools/vo_script.json` | the script: `id`, `line` (exactly as the bubble shows it), `spoken` (what the voice was given), `devanagari` (what the studio actually spoke), `where` (screen and moment) |
| `js/vo_lines.js` | generated map, line as shown → `[clip, seconds, start of each word]`; never edit by hand |
| `js/voice.js` | the player |
| `tools/vo_build.js` | rebuild tool: studio zip(s) → clips (loudness-matched) + map |

This is the English voice-over. In Hindi (`?lan=hi`) the same player plays the Hindi recordings instead, from
`assets/VO-HI/` at the repository's root, each line's clip found by its key (see the README's Languages section):
`js/voice.js` gives each English word of a line the time its Hindi words are said (`assets/VO-HI/vo_hi.js`), so the
bubble's Hindi words come with the Hindi voice. `../../tools/vo_lang_build.js` builds those clips with this folder's
`tools/vo_build.js` (its encoder and its word timing).

## How the clips were made

- **Studio:** *Ai Wala Human By Aamir*, https://ai-wala-human-by-aamir-809572708022.asia-southeast1.run.app/, tab
  **Batch Generation**. It takes an `.xlsx` with a header row; we use two columns, `filename` (the clip id) and `text`
  (the spoken form).
- **Settings:** Language **Hindi** · Format **.MP3** · Voice **Female Teacher (Standard)** (Gemini voice Kore, clear
  North Indian accent) · Text Column `text` · Filename Column `filename` · Start Row 1 · Quantity = rows · Concurrency
  **3 (Recommended)**. `DOWNLOAD ALL (.ZIP)` gives `voiceovers_batch.zip` with `voiceovers/<id>.mp3`.
- **Why Hindi for English lines:** the studio first rewrites each line in the language's script (a Gemini text call),
  then speaks that (a Gemini TTS call). English written in Devanagari ("Look again." → "लुक अगेन।") is spoken as English
  with an Indian accent, and the words stay English. Choosing English would give a neutral accent.
- **Rate limit:** 100 requests per 15 minutes per IP, at the studio's proxy (headers `ratelimit-limit`,
  `ratelimit-remaining`, `ratelimit-reset`; over the limit it answers `429 Too many requests from this IP`). Each line
  costs two requests, so at most about **48 lines per 15-minute window**. The first 118 lines took three windows (and one
  re-run of 25 lines after an interrupted session).

## One voice: each word said one way, every line at one level

Lines recorded at different times did not sound like one narrator. Two things differed, and both are fixed for every
line Swiftee or the narrator says, in the lesson and in the game:

- **The same word was said differently.** The studio first spells a line in Devanagari, and it spelled the same English
  word differently from line to line, so the voice said it differently: "opposite" was ऑपोजिट in 20 lines and अपोजिट
  ("uh-pozit") in 11, and parallelogram, diagonal(s), trapezium, lengths, degrees, "is", "a" and others varied too. Every
  word now has one spelling, the one most lines used, and every line that spelled a word otherwise was recorded again
  with that spelling (58 lesson lines and all of the game's narrator and Swiftee lines). Given Devanagari, the studio
  speaks it as written, so those lines were sent in Devanagari (Single Generation, the same voice and language); a take
  the studio respelled anyway was not used.
- **Lines were louder or quieter.** The clips ranged from -19.1 to -14.1 LUFS, so one line could be 5 dB louder than the
  last. `tools/vo_build.js` now matches every clip to -16.4 LUFS (BS.1770) as it encodes it, and the game's own clips sit
  at the same level.

Each line recorded again was taken up to three times, and the take closest to the rest of the lesson's voice was kept:
its pitch (two pitch trackers), its pace and its tone (MFCC) against the lesson's other clips. Lines whose pitch was
2.5 semitones or more from the rest (a flat, low question, an overexcited reply) were recorded again the same way.

**One pitch (29 Oct).** Takes recorded at different times still sat at different pitches - from 4.1 semitones below
the lesson's normal voice to 4.2 above - so a line could sound like someone else (a high, sing-song "Which pair of
sides...", a low, flat "Which of these are parallelograms?"). New takes would not match: the studio's output today is up
to 7 dB brighter than the lesson's clips. So 90 clips were evened instead, from their own audio: pitch moved to within
0.4 semitones of the normal voice where it was 1 or more away (Praat PSOLA: the voice and its timing kept; shifted
only where two pitch trackers agree on the offset, else by the smaller reading), intonation drawn partly toward the
normal range where it was flat or sing-song (exclamations never flattened), and treble matched with a gentle shelf
where it was 2 dB or more off. Then `tools/vo_build.js` as usual. 106 of 110 lines are now within 1 semitone (55
before); every adjusted clip was transcribed again - word for word as before, the recogniser just as sure (0.921
mean word confidence against 0.922) - and the word timings moved at most 0.03 s.

## Spoken form

The bubble keeps the written form; the voice is given words. `spoken` in the script differs from `line` where needed:

- `=` → "equals", `+` → "plus", `∥` → "is parallel to", `∠A` → "angle A", `°` → "degrees", `cm` → "centimetres".
- Point names are spaced so they are read as letters: AB → "A B", AO → "A O".
- **Numbers are written as English words** ("seven", "sixty-eight", "one hundred and eighty"), never digits: the
  script step sometimes *translates* a digit into Hindi (7 → सात), and then the voice says it in Hindi.
- A sentence that now starts with a number word or "angle" is capitalised.

**Devanagari check.** For every line, the Devanagari the studio produced (now in `vo_script.json`) was scanned for Hindi
number words (एक दो तीन … पचास सौ, and compounds such as सत्तर), leftover Latin letters or digits, and odd names or
letters. All of them came out clean: numbers as transliterated English (सेवेन, वन हंड्रेड एंड एटी), letters as ए बी सी डी ओ.

**Pace check.** Spoken characters ÷ seconds is 9.0–19.6 for every clip (expected 6–22), so none is rushed or stalled.

## Conversion

`tools/vo_build.js` turns the studio's MP3s (24 kHz, mono, 128 kbps) into Ogg Opus, 32 kbps, mono, with no ffmpeg:
headless Chromium decodes the MP3, resamples to 48 kHz and encodes Opus (WebCodecs `AudioEncoder`); the tool writes the
Ogg pages itself (RFC 7845: OpusHead with the encoder's pre-skip, granule positions at 48 kHz, the last page's granule
set to the real length so the padding is trimmed). Each new clip is decoded back and its length checked against the
granule length. It then measures every clip and regenerates `js/vo_lines.js`, deletes clips no line uses, and lists
lines that have no clip yet, and lesson lines missing from the script. Safe to run again.

A browser that cannot play Ogg Opus shows each line's words without a voice in the journey (below).

## How the game uses the clips

All in `say()` (`js/game-engine.js`), the one function that puts a line in Swiftee's bubble, and `js/voice.js`:

1. **Lookup** by the exact plain text the bubble shows (line breaks as spaces); a voice-only line (`keep`) by its `s`.
2. **One reused audio element.** In the journey it is the shell's, unlocked by the Play tap on the front page, so the
   lesson is heard from its first line; on the lesson's own page (`?solo`) its Next tap unlocks it. A screen's clips,
   and the next screen's, are fetched quietly, one at a time, as it opens (`VO.want`), so the voice-over never loads
   all at once. Each clip starts 60 ms before its first word (a seek once its header has loaded; Safari rounded a `#t=`
   fragment to the next second): the studio's clips open with ~0.3 s of quiet, which Fishing Frenzy trims from its own.
3. **Words when they are said:** `vo_build.js` measures every clip's loudness (10 ms steps): where speech starts and
   ends (each clip opens with ~0.3 s of silence) and its pauses, which it matches in order to the line's commas and full
   stops, weighing each pause's length as well as its place; inside each phrase the words share the time by their spoken length. The map stores each
   word's start, and the game reveals a word when the clip's own playhead (`currentTime`) reaches it, so start-up lag
   or buffering never puts words ahead of the voice (measured: within ~0.05 s). Every word cue - side glows, cards,
   pulses, the angle focus - fires on its word. A line without timings falls back to its share of the spoken
   characters, `max(16, (seconds − 0.35) × 1000 / characters)` ms each. Screen 1's outline is drawn in the clip's length.
4. **The clip is the clock:** the line ends when the clip ends (safety: its length + 600 ms), and only then does a
   screen move on, an answer unlock, or the next line start. A new line, a screen change, mute, a jump or restart
   stops the voice.
5. **One voice (as in Fishing Frenzy's lesson):** while the recordings are on, a line with no clip, a missing file,
   `play()` refused or a clip that never starts (2.5 s) shows its words on a timer, silently, never in the device's
   voice. Only on the lesson's own page with the recordings off (no Ogg Opus support, or `?vo=0`) does the device's
   speech voice read the lines; in the journey, never. Nothing ever blocks the lesson.
6. `?speed=2` plays clips faster (0.5–4), for QA. There is no background music, so nothing needs ducking.

## Remake a line

1. Edit the line's `spoken` in `tools/vo_script.json` (keep `id` and `line`; for a new line, add a row with the
   next id and its `line` exactly as the bubble shows it).
2. Give the studio the line in Devanagari, every word spelled as the other lines spell it (the table below; e.g.
   ऑपोजिट, पैरेलल, पैरेललोग्राम, इज, ए), so it is said as they say it: Single Generation, the settings above, the
   Devanagari as the text. Check its SPEAKER SCRIPT is exactly what you gave it (now and then it respells a word: take it
   again), and put that script in the line's `devanagari`. Batch Generation works too, with the Devanagari in `text`.
3. Zip the clips as `voiceovers/<id>.mp3` (or `.wav`), then, in the game folder, `npm i --no-save playwright` (once) and

   ```
   node tools/vo_build.js voiceovers.zip
   ```

   (`CHROME=/path/to/chrome` if Playwright's own Chromium is not installed). Several zips can be passed at once. Each
   clip is matched to the lesson's loudness as it is encoded.

## All lines

`=` means the voice was given exactly the text shown.

| Clip | Line as shown | Spoken as | Devanagari sent to the voice | s |
|---|---|---|---|---|
| vo001 | We learnt about quadrilaterals earlier. | = | वी लर्न्ट अबाउट क्वाड्रिलैटरल्स अर्लियर। | 3.22 |
| vo002 | Any polygon with 4 sides is called a quadrilateral. | Any polygon with four sides is called a quadrilateral. | एनी पॉलीगन विद फोर साइड्स इज कॉल्ड ए क्वाड्रिलैटरल। | 4.37 |
| vo003 | This is a special type of quadrilateral called trapezium. | This is a special type of quadrilateral called Trapezium. | दिस इज ए स्पेशल टाइप ऑफ क्वाड्रिलैटरल कॉल्ड ट्रेपीज़ियम। | 4.32 |
| vo004 | A trapezium has one pair of opposite sides parallel. | = | ए ट्रेपीज़ियम हैज़ वन पेयर ऑफ ऑपोजिट साइड्स पैरेलल। | 4.24 |
| vo005 | Which pair of sides are parallel to each other? | = | विच पेयर ऑफ साइड्स आर पैरेलल टू ईच अदर? | 3.62 |
| vo006 | Look again. AD and BC lean towards each other, so they would meet if we made them longer. | Look again. A D and B C lean towards each other, so they would meet if we made them longer. | लुक अगेन। ए डी एंड बी सी लीन टुवर्ड्स ईच अदर, सो दे वुड मीट इफ वी मेड देम लॉन्गर। | 7.10 |
| vo007 | That's correct! AB ∥ CD. | That's correct! A B is parallel to C D. | दैट्स करेक्ट! ए बी इज पैरेलल टू सी डी। | 3.86 |
| vo008 | What if we made the other pair of opposite sides parallel too? | = | वॉट इफ वी मेड द अदर पेयर ऑफ ऑपोजिट साइड्स पैरेलल टू? | 4.32 |
| vo009 | Drag vertex B to make BC parallel to AD. | Drag vertex B to make B C parallel to A D. | ड्रैग वर्टेक्स बी टू मेक बी सी पैरेलल टू ए डी। | 4.73 |
| vo010 | BC is not parallel to AD yet. Keep dragging B to the right. | B C is not parallel to A D yet. Keep dragging B to the right. | बी सी इज नॉट पैरेलल टू ए डी येट। कीप ड्रैगिंग बी टू द राइट। | 5.28 |
| vo011 | B went too far. Drag it back a little. | = | बी वेंट टू फ़ार। ड्रैग इट बैक ए लिटिल। | 2.96 |
| vo013 | Well done! Now BC is parallel to AD. | Well done! Now B C is parallel to A D. | वेल डन! नाउ बी सी इज पैरेलल टू ए डी। | 4.68 |
| vo014 | Now both pairs of opposite sides are parallel. | = | नाउ बोथ पेयर्स ऑफ ऑपोजिट साइड्स आर पैरेलल। | 3.94 |
| vo016 | We call this a parallelogram. | We call this a Parallelogram. | वी कॉल दिस ए पैरेललोग्राम। | 2.92 |
| vo017 | A quadrilateral where both pairs of opposite sides are parallel is called a parallelogram. | = | ए क्वाड्रिलैटरल व्हेयर बोथ पेयर्स ऑफ ऑपोजिट साइड्स आर पैरेलल इज कॉल्ड ए पैरेललोग्राम। | 6.12 |
| vo018 | But what about the side lengths? | = | बट वॉट अबाउट द साइड लेंथ्स? | 3.26 |
| vo019 | Are they equal too? | = | आर दे इक्वल टू? | 2.18 |
| vo021 | There is something interesting about the lengths. | = | देयर इज समथिंग इंटरेस्टिंग अबाउट द लेंथ्स। | 3.12 |
| vo022 | What do you notice about the sides? | = | वॉट डू यू नोटिस अबाउट द साइड्स? | 2.69 |
| vo023 | Look at the lengths again. AB is 6 cm, but AD is only 3 cm. | Look at the lengths again. A B is six centimetres, but A D is only three centimetres. | लुक एट द लेंथ्स अगेन। ए बी इज सिक्स सेंटीमीटर्स, बट ए डी इज ओनली थ्री सेंटीमीटर्स। | 7.04 |
| vo024 | That's correct! Opposite sides are equal. | = | दैट्स करेक्ट! ऑपोजिट साइड्स आर इक्वल। | 3.56 |
| vo025 | In any parallelogram, opposite sides are of equal lengths. | = | इन एनी पैरेललोग्राम, ऑपोजिट साइड्स आर ऑफ इक्वल लेंथ्स। | 4.84 |
| vo027 | So, in any parallelogram, opposite sides are parallel and equal. | = | सो, इन एनी पैरेललोग्राम, ऑपोजिट साइड्स आर पैरेलल एंड इक्वल। | 6.04 |
| vo028 | Which of these are parallelograms? Select all that apply. | = | विच ऑफ दीज़ आर पैरेललोग्राम्स? सिलेक्ट ऑल दैट अप्लाई। | 4.24 |
| vo033 | In this parallelogram, AB = 7 cm. What is the length of CD? | In this parallelogram, A B equals seven centimetres. What is the length of C D? | इन दिस पैरेललोग्राम, ए बी इक्वल्स सेवन सेंटीमीटर्स। वॉट इज द लेंथ ऑफ सी डी? | 5.56 |
| vo034 | CD is not double AB. Opposite sides of a parallelogram are equal. | C D is not double A B. Opposite sides of a parallelogram are equal. | सी डी इज नॉट डबल ए बी। ऑपोजिट साइड्स ऑफ ए पैरेललोग्राम आर इक्वल। | 6.32 |
| vo035 | CD is not half of AB. Opposite sides of a parallelogram are equal. | C D is not half of A B. Opposite sides of a parallelogram are equal. | सी डी इज नॉट हाफ ऑफ ए बी। ऑपोजिट साइड्स ऑफ ए पैरेललोग्राम आर इक्वल। | 6.00 |
| vo037 | That's right! Opposite sides are equal, so CD = 7 cm. | That's right! Opposite sides are equal, so C D equals seven centimetres. | दैट्स राइट! ऑपोजिट साइड्स आर इक्वल, सो सी डी इक्वल्स सेवन सेंटीमीटर्स। | 5.72 |
| vo038 | In this parallelogram, AB = 8 cm and BC = 5 cm. Find the lengths of CD and AD. | In this parallelogram, A B equals eight centimetres and B C equals five centimetres. Find the lengths of C D and A D. | इन दिस पैरेललोग्राम, ए बी इक्वल्स एट सेंटीमीटर्स एंड बी सी इक्वल्स फाइव सेंटीमीटर्स। फाइंड द लेंथ्स ऑफ सी डी एंड ए डी। | 9.24 |
| vo041 | Brilliant! CD = AB = 8 cm and AD = BC = 5 cm. | Brilliant! C D equals A B equals eight centimetres and A D equals B C equals five centimetres. | ब्रिलियंट! सी डी इक्वल्स ए बी इक्वल्स एट सेंटीमीटर्स एंड ए डी इक्वल्स बी सी इक्वल्स फाइव सेंटीमीटर्स. | 8.93 |
| vo042 | We learnt all about the sides of a parallelogram. | = | वी लर्न्ट ऑल अबाउट द साइड्स ऑफ ए पैरेललोग्राम। | 3.84 |
| vo043 | But what about its angles? Are they equal too? | = | बट वॉट अबाउट इट्स एंगल्स? आर दे इक्वल टू? | 3.94 |
| vo045 | There is something interesting here too. | = | देयर इज समथिंग इंटरेस्टिंग हियर टू। | 2.80 |
| vo046 | Some angles are equal to one another. | = | सम एंगल्स आर इक्वल टू वन अनदर। | 3.02 |
| vo047 | Tap the angle which is equal to ∠A. | Tap the angle which is equal to angle A. | टैप द एंगल विच इज इक्वल टू एंगल ए। | 3.92 |
| vo048 | Not quite. Compare its size with ∠A. Look at the corner opposite A. | Not quite. Compare its size with angle A. Look at the corner opposite A. | नॉट क्वाइट। कंपेयर इट्स साइज विद एंगल ए। लुक एट द कॉर्नर ऑपोजिट ए। | 6.02 |
| vo050 | That's correct! ∠A is equal to ∠C. | That's correct! Angle A is equal to angle C. | दैट्स करेक्ट! एंगल ए इज इक्वल टू एंगल सी। | 4.24 |
| vo051 | Tap the angle which is equal to ∠D. | Tap the angle which is equal to angle D. | टैप द एंगल विच इज इक्वल टू एंगल डी। | 3.58 |
| vo052 | Not quite. Compare its size with ∠D. Look at the corner opposite D. | Not quite. Compare its size with angle D. Look at the corner opposite D. | नॉट क्वाइट। कंपेयर इट्स साइज विद एंगल डी। लुक एट द कॉर्नर ऑपोजिट डी। | 6.56 |
| vo054 | That's correct! ∠D is equal to ∠B. | That's correct! Angle D is equal to angle B. | दैट्स करेक्ट! एंगल डी इज इक्वल टू एंगल बी। | 3.94 |
| vo055 | So in any parallelogram, the pairs of opposite angles are also equal. | = | सो इन एनी पैरेललोग्राम, द पेयर्स ऑफ ऑपोजिट एंगल्स आर ऑल्सो इक्वल। | 6.20 |
| vo056 | But I see something else too. | = | बट आई सी समथिंग एल्स टू। | 2.78 |
| vo057 | Look at ∠A and ∠D. | Look at angle A and angle D. | लुक एट एंगल ए एंड एंगल डी। | 2.98 |
| vo058 | They add up to make 180°. | They add up to make one hundred and eighty degrees. | दे ऐड अप टू मेक वन हंड्रेड एंड एटी डिग्रीज़। | 3.82 |
| vo059 | Which other angles add up to 180°? | Which other angles add up to one hundred and eighty degrees? | विच अदर एंगल्स ऐड अप टू वन हंड्रेड एंड एटी डिग्रीज़? | 3.64 |
| vo060 | ∠B and ∠D are opposite angles. 70° + 70° is not 180°. | Angle B and angle D are opposite angles. Seventy degrees plus seventy degrees is not one hundred and eighty degrees. | एंगल बी एंड एंगल डी आर ऑपोजिट एंगल्स। सेवेंटी डिग्रीज़ प्लस सेवेंटी डिग्रीज़ इज नॉट वन हंड्रेड एंड एटी डिग्रीज़। | 8.60 |
| vo063 | Yes! ∠B + ∠C = 180° and ∠A + ∠B = 180°. | Yes! Angle B plus angle C equals one hundred and eighty degrees and angle A plus angle B equals one hundred and eighty degrees. | येस! एंगल बी प्लस एंगल सी इक्वल्स वन हंड्रेड एंड एटी डिग्रीज़ एंड एंगल ए प्लस एंगल बी इक्वल्स वन हंड्रेड एंड एटी डिग्रीज़। | 9.65 |
| vo064 | All the adjacent angles of this parallelogram add up to 180°. | All the adjacent angles of this parallelogram add up to one hundred and eighty degrees. | ऑल द एडजेसेंट एंगल्स ऑफ दिस पैरेललोग्राम ऐड अप टू वन हंड्रेड एंड एटी डिग्रीज़। | 5.98 |
| vo065 | In this parallelogram, ∠A = 68°. What is the measure of ∠C? | In this parallelogram, angle A equals sixty-eight degrees. What is the measure of angle C? | इन दिस पैरेललोग्राम, एंगल ए इक्वल्स सिक्सटी एट डिग्रीज़। वॉट इज द मेजर ऑफ एंगल सी? | 6.72 |
| vo067 | Look again. Opposite angles of a parallelogram are equal. | = | लुक अगेन। ऑपोजिट एंगल्स ऑफ ए पैरेललोग्राम आर इक्वल। | 4.76 |
| vo069 | That's right! Opposite angles are equal, so ∠C = 68°. | That's right! Opposite angles are equal, so angle C equals sixty-eight degrees. | दैट्स राइट! ऑपोजिट एंगल्स आर इक्वल, सो एंगल सी इक्वल्स सिक्सटी एट डिग्रीज़। | 6.80 |
| vo070 | In this parallelogram, ∠A = 72°. What is the measure of ∠B? | In this parallelogram, angle A equals seventy-two degrees. What is the measure of angle B? | इन दिस पैरेललोग्राम, एंगल ए इक्वल्स सेवेंटी टू डिग्रीज़। वॉट इज द मेजर ऑफ एंगल बी? | 7.04 |
| vo071 | ∠B is next to ∠A, not opposite it. Adjacent angles add up to 180°. | Angle B is next to angle A, not opposite it. Adjacent angles add up to one hundred and eighty degrees. | एंगल बी इज नेक्स्ट टू एंगल ए, नॉट ऑपोजिट इट। एडजेसेंट एंगल्स ऐड अप टू वन हंड्रेड एंड एटी डिग्रीज़। | 7.44 |
| vo072 | 180° is the sum of ∠A and ∠B, not ∠B by itself. | One hundred and eighty degrees is the sum of angle A and angle B, not angle B by itself. | वन हंड्रेड एंड एटी डिग्रीज़ इज द सम ऑफ एंगल ए एंड एंगल बी, नॉट एंगल बी बाय इटसेल्फ। | 6.92 |
| vo074 | Correct! 72° + 108° = 180°. | Correct! Seventy-two degrees plus one hundred and eight degrees equals one hundred and eighty degrees. | करेक्ट! सेवेंटी-टू डिग्रीज़ प्लस वन हंड्रेड एंड एट डिग्रीज़ इक्वल्स वन हंड्रेड एंड एटी डिग्रीज़। | 6.86 |
| vo075 | In this parallelogram, ∠A = 65°. Find the measures of ∠B, ∠C and ∠D. | In this parallelogram, angle A equals sixty-five degrees. Find the measures of angle B, angle C and angle D. | इन दिस पैरेललोग्राम, एंगल ए इक्वल्स सिक्सटी फाइव डिग्रीज़। फाइंड द मेज़र्स ऑफ एंगल बी, एंगल सी एंड एंगल डी। | 9.24 |
| vo078 | Amazing! ∠B = 115°, ∠C = 65° and ∠D = 115°. | Amazing! Angle B equals one hundred and fifteen degrees, angle C equals sixty-five degrees and angle D equals one hundred and fifteen degrees. | अमेजिंग! एंगल बी इक्वल्स वन हंड्रेड एंड फिफ्टीन डिग्रीज़, एंगल सी इक्वल्स सिक्सटी फाइव डिग्रीज़ एंड एंगल डी इक्वल्स वन हंड्रेड एंड फिफ्टीन डिग्रीज़। | 10.08 |
| vo079 | We have explored all about the sides and angles of a parallelogram. | = | वी हैव एक्सप्लोर्ड ऑल अबाउट द साइड्स एंड एंगल्स ऑफ ए पैरेललोग्राम। | 4.56 |
| vo080 | Let's learn about its diagonals. | = | लेट्स लर्न अबाउट इट्स डायगोनल्स। | 2.45 |
| vo081 | Draw all the diagonals of this parallelogram. | = | ड्रॉ ऑल द डायगोनल्स ऑफ दिस पैरेललोग्राम। | 3.74 |
| vo082 | That is a side. A diagonal joins two opposite corners. | = | दैट इज ए साइड। ए डायगोनल जॉइन्स टू ऑपोजिट कॉर्नर्स। | 5.16 |
| vo084 | Great! You drew both diagonals. | = | ग्रेट! यू ड्रू बोथ डायगोनल्स. | 3.62 |
| vo085 | AC and BD are the diagonals of this parallelogram. | A C and B D are the diagonals of this parallelogram. | ए सी एंड बी डी आर द डायगोनल्स ऑफ दिस पैरेललोग्राम। | 5.12 |
| vo086 | They meet each other at point O. | = | दे मीट ईच अदर एट पॉइंट ओ। | 2.69 |
| vo087 | Each diagonal divides the other into 2 segments. | Each diagonal divides the other into two segments. | ईच डायगोनल डिवाइड्स द अदर इनटू टू सेगमेंट्स। | 4.04 |
| vo089 | Let's compare the lengths of these segments. | = | लेट्स कंपेयर द लेंथ्स ऑफ दीज़ सेगमेंट्स। | 3.64 |
| vo090 | Drag the segments to their correct place. | = | ड्रैग द सेगमेंट्स टू देयर करेक्ट प्लेस। | 3.26 |
| vo091 | Those two are not the same length. Look at the lengths again. | = | दोज़ टू आर नॉट द सेम लेंथ। लुक एट द लेंथ्स अगेन। | 4.22 |
| vo093 | That's correct! The segments of the same diagonal are equal. | = | दैट्स करेक्ट! द सेगमेंट्स ऑफ द सेम डायगोनल आर इक्वल। | 4.76 |
| vo094 | Each diagonal is divided into two equal parts by the other. | = | ईच डायगोनल इज डिवाइडेड इनटू टू इक्वल पार्ट्स बाय द अदर। | 5.02 |
| vo095 | So the diagonals of a parallelogram bisect each other. | = | सो द डायगोनल्स ऑफ ए पैरेललोग्राम बाईसेक्ट ईच अदर। | 3.84 |
| vo096 | In this parallelogram, AO = 6 cm. What is the length of OC? | In this parallelogram, A O equals six centimetres. What is the length of O C? | इन दिस पैरेललोग्राम, ए ओ इक्वल्स सिक्स सेंटीमीटर्स। वॉट इज द लेंथ ऑफ ओ सी? | 6.60 |
| vo101 | In this parallelogram, AO = 5 cm and BO = 3 cm. Find the lengths of OC and OD. | In this parallelogram, A O equals five centimetres and B O equals three centimetres. Find the lengths of O C and O D. | इन दिस पैरेललोग्राम, ए ओ इक्वल्स फाइव सेंटीमीटर्स एंड बी ओ इक्वल्स थ्री सेंटीमीटर्स। फाइंड द लेंथ्स ऑफ ओ सी एंड ओ डी। | 10.08 |
| vo104 | Well done! OC = AO = 5 cm and OD = BO = 3 cm. | Well done! O C equals A O equals five centimetres and O D equals B O equals three centimetres. | वेल डन! ओ सी इक्वल्स ए ओ इक्वल्स फाइव सेंटीमीटर्स एंड ओ डी इक्वल्स बी ओ इक्वल्स थ्री सेंटीमीटर्स। | 8.74 |
| vo105 | Which of the following are true for this parallelogram? Select all that apply. | = | विच ऑफ द फॉलोइंग आर ट्रू फॉर दिस पैरेललोग्राम? सिलेक्ट ऑल दैट अप्लाई। | 5.45 |
| vo106 | AO and BO are parts of different diagonals, so they need not be equal. | A O and B O are parts of different diagonals, so they need not be equal. | ए ओ एंड बी ओ आर पार्ट्स ऑफ डिफरेंट डायगोनल्स, सो दे नीड नॉट बी इक्वल। | 6.28 |
| vo107 | The two diagonals of this parallelogram have different lengths. | = | द टू डायगोनल्स ऑफ दिस पैरेललोग्राम हैव डिफरेंट लेंथ्स। | 4.54 |
| vo109 | Perfect! AO = OC, BO = OD, so the diagonals bisect each other. | Perfect! A O equals O C, B O equals O D, so the diagonals bisect each other. | परफेक्ट! ए ओ इक्वल्स ओ सी, बी ओ इक्वल्स ओ डी, सो द डायगोनल्स बाईसेक्ट ईच अदर। | 7.22 |
| vo110 | Let's recall what we learnt about parallelograms. | = | लेट्स रिकॉल वॉट वी लर्न्ट अबाउट पैरेललोग्राम्स. | 3.58 |
| vo111 | A parallelogram is a quadrilateral with two pairs of opposite sides parallel. | = | ए पैरेललोग्राम इज ए क्वाड्रिलैटरल विद टू पेयर्स ऑफ ऑपोजिट साइड्स पैरेलल। | 5.57 |
| vo112 | Opposite sides are parallel. | = | ऑपोजिट साइड्स आर पैरेलल। | 2.69 |
| vo114 | Opposite sides are equal. | = | ऑपोजिट साइड्स आर इक्वल। | 2.74 |
| vo115 | Opposite angles are equal. | = | ऑपोजिट एंगल्स आर इक्वल। | 2.56 |
| vo116 | Adjacent angles are supplementary. They add up to 180°. | Adjacent angles are supplementary. They add up to one hundred and eighty degrees. | एडजेसेंट एंगल्स आर सप्लीमेंट्री। दे ऐड अप टू वन हंड्रेड एंड एटी डिग्रीज़। | 6.24 |
| vo117 | Diagonals bisect each other. | = | डायगोनल्स बाईसेक्ट ईच अदर। | 2.60 |
| vo118 | Amazing work! You know all about parallelograms now. | = | अमेज़िंग वर्क! यू नो ऑल अबाउट पैरेललोग्राम्स नाउ. | 4.25 |
| vo119 | Watch! BC must lean the same way as AD. | Watch! B C must lean the same way as A D. | वॉच! बी सी मस्ट लीन द सेम वे एज़ ए डी। | 4.92 |
| vo120 | Now BC is parallel to AD. | Now B C is parallel to A D. | नाउ बी सी इज पैरेलल टू ए डी। | 3.20 |
| vo121 | Let's find out! | = | लेट्स फाइंड आउट! | 1.64 |
| vo122 | ∠A and ∠C are opposite angles. 110° + 110° is not 180°. | Angle A and angle C are opposite angles. One hundred and ten degrees plus one hundred and ten degrees is not one hundred and eighty degrees. | एंगल ए एंड एंगल सी आर ऑपोजिट एंगल्स। वन हंड्रेड एंड टेन डिग्रीज़ प्लस वन हंड्रेड एंड टेन डिग्रीज़ इज नॉट वन हंड्रेड एंड एटी डिग्रीज़। | 9.72 |
| vo123 | This shape is a trapezium. Only one pair of its sides is parallel. | = | दिस शेप इज ए ट्रेपीज़ियम। ओनली वन पेयर ऑफ इट्स साइड्स इज पैरेलल। | 5.56 |
| vo124 | This shape has five sides, so it is not a quadrilateral. | = | दिस शेप हैज़ फाइव साइड्स, सो इट इज नॉट ए क्वाड्रिलैटरल। | 4.80 |
| vo125 | Yes! Both these shapes have two pairs of parallel sides. | = | येस! बोथ दीज़ शेप्स हैव टू पेयर्स ऑफ पैरेलल साइड्स। | 4.60 |
| vo126 | 25° + 65° is only 90°. ∠A and ∠B must add up to 180°. | Twenty-five degrees plus sixty-five degrees is only ninety degrees. Angle A and angle B must add up to one hundred and eighty degrees. | ट्वेंटी फाइव डिग्रीज़ प्लस सिक्सटी फाइव डिग्रीज़ इज ओनली नाइंटी डिग्रीज़। एंगल ए एंड एंगल बी मस्ट ऐड अप टू वन हंड्रेड एंड एटी डिग्रीज़। | 8.88 |
| vo127 | ∠B is next to ∠A, not opposite it. ∠A + ∠B = 180°. | Angle B is next to angle A, not opposite it. Angle A plus angle B equals one hundred and eighty degrees. | एंगल बी इज नेक्स्ट टू एंगल ए, नॉट ऑपोजिट इट। एंगल ए प्लस एंगल बी इक्वल्स वन हंड्रेड एंड एटी डिग्रीज़। | 9.04 |
| vo128 | 180° is ∠A and ∠B together. Take away the 65° of ∠A. | One hundred and eighty degrees is angle A and angle B together. Take away the sixty-five degrees of angle A. | वन हंड्रेड एंड एटी डिग्रीज़ इज एंगल ए एंड एंगल बी टुगेदर। टेक अवे द सिक्सटी फाइव डिग्रीज़ ऑफ एंगल ए। | 8.44 |
| vo129 | ∠C is opposite ∠A, so it is equal to ∠A, not 25°. | Angle C is opposite angle A, so it is equal to angle A, not twenty-five degrees. | एंगल सी इज ऑपोजिट एंगल ए, सो इट इज इक्वल टू एंगल ए, नॉट ट्वेंटी फाइव डिग्रीज़। | 6.32 |
| vo130 | 115° is the size of an angle next to ∠A. ∠C is opposite ∠A, so ∠C = ∠A. | One hundred and fifteen degrees is the size of an angle next to angle A. Angle C is opposite angle A, so angle C equals angle A. | वन हंड्रेड एंड फिफ्टीन डिग्रीज़ इज द साइज ऑफ एन एंगल नेक्स्ट टू एंगल ए। एंगल सी इज ऑपोजिट एंगल ए, सो एंगल सी इक्वल्स एंगल ए। | 10.44 |
| vo131 | ∠C is opposite ∠A, so it is equal to ∠A, not 180°. | Angle C is opposite angle A, so it is equal to angle A, not one hundred and eighty degrees. | एंगल सी इज ऑपोजिट एंगल ए, सो इट इज इक्वल टू एंगल ए, नॉट वन हंड्रेड एंड एटी डिग्रीज़। | 6.20 |
| vo132 | 25° + 65° is only 90°. ∠A and ∠D must add up to 180°. | Twenty-five degrees plus sixty-five degrees is only ninety degrees. Angle A and angle D must add up to one hundred and eighty degrees. | ट्वेंटी फाइव डिग्रीज़ प्लस सिक्सटी फाइव डिग्रीज़ इज ओनली नाइंटी डिग्रीज़। एंगल ए एंड एंगल डी मस्ट ऐड अप टू वन हंड्रेड एंड एटी डिग्रीज़। | 9.96 |
| vo133 | ∠D is next to ∠A, not opposite it. ∠A + ∠D = 180°. | Angle D is next to angle A, not opposite it. Angle A plus angle D equals one hundred and eighty degrees. | एंगल डी इज नेक्स्ट टू एंगल ए, नॉट ऑपोजिट इट। एंगल ए प्लस एंगल डी इक्वल्स वन हंड्रेड एंड एटी डिग्रीज़। | 8.16 |
| vo134 | 180° is ∠A and ∠D together. Take away the 65° of ∠A. | One hundred and eighty degrees is angle A and angle D together. Take away the sixty-five degrees of angle A. | वन हंड्रेड एंड एटी डिग्रीज़ इज एंगल ए एंड एंगल डी टुगेदर। टेक अवे द सिक्सटी फाइव डिग्रीज़ ऑफ एंगल ए। | 7.76 |
| vo135 | OC is not half of AO. OC = AO. | O C is not half of A O. O C equals A O. | ओ सी इज नॉट हाफ ऑफ ए ओ। ओ सी इक्वल्स ए ओ। | 5.04 |
| vo136 | 12 cm is the whole of AC. OC is only half of it. | Twelve centimetres is the whole of A C. O C is only half of it. | ट्वेल्व सेंटीमीटर्स इज द होल ऑफ ए सी। ओ सी इज ओनली हाफ ऑफ इट। | 5.32 |
| vo137 | Yes! O cuts AC in half, so OC = 6 cm. | Yes! O cuts A C in half, so O C equals six centimetres. | येस! ओ कट्स ए सी इन हाफ, सो ओ सी इक्वल्स सिक्स सेंटीमीटर्स। | 6.12 |
| vo138 | CD is opposite AB, so CD = AB. | C D is opposite A B, so C D equals A B. | सी डी इज ऑपोजिट ए बी, सो सी डी इक्वल्स ए बी। | 4.44 |
| vo139 | AD is opposite BC, so AD = BC. | A D is opposite B C, so A D equals B C. | ए डी इज ऑपोजिट बी सी, सो ए डी इक्वल्स बी सी। | 4.84 |
| vo140 | OC is the other half of AC, so OC = AO. | O C is the other half of A C, so O C equals A O. | ओ सी इज द अदर हाफ ऑफ ए सी, सो ओ सी इक्वल्स ए ओ । | 4.84 |
| vo141 | OD is the other half of BD, so OD = BO. | O D is the other half of B D, so O D equals B O. | ओ डी इज द अदर हाफ ऑफ बी डी, सो ओ डी इक्वल्स बी ओ। | 5.04 |
| vo142 | Are the two segments of each diagonal equal? | = | आर द टू सेगमेंट्स ऑफ ईच डायगोनल इक्वल? | 3.64 |
