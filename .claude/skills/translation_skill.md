---
name: game-translation
description: Translate game UI strings in locales.json into hi, mr, te, gu, od using the project's fixed conventions. Use whenever the user asks to translate, localise, or add strings/languages to a game.
---

# Translation Skill — Game Locales (locales.json)

## 1. File structure
- Top keys: `defaultLanguage`, `languageLabels`, `supportedLanguages`, then one object per language: `en`, `hi`, `mr`, `te`, `gu`, `od`.
- `en` is the source of truth. Every language object has **exactly the same keys** as `en`, same order. No missing, no extra.
- New keys: add to `en` first, then to all 5 languages in one pass.
- Values are strings or arrays of strings (e.g. `feedbackCorrectRandom`). Keep same type and array length.

## 2. Copy verbatim — never translate
- Placeholders `{formedValue}`, `{targetValue}`, `{language}` — keep, but move to the natural word position.
- HTML tags/attributes: `<strong>`, `<br>`, `<span class="..." style="...">`, `&nbsp;`, emoji. Translate only text between tags.
- Numbers and symbols: `3`, `24,10,66,874`, `×10`, `+ 8`, `->`, `/`, `²`. ASCII digits only, never native numerals.
- Abbreviations in `.th-abbr` spans: `(TL)`, `(TTh)`, `(Th)`, `(C)`, `(TC)`.
- JSON escaping of inner quotes (`\"`).

## 3. Style rules
- Audience: school children (classes 4–6). Simple, warm, natural — not word-for-word.
- Respectful plural imperative: hi *करें*, mr *करा*, te *చేయండి*, gu *કરો*, od *କରନ୍ତୁ*.
- ALL-CAPS English buttons (`CHECK`, `NEXT`) → normal-case translation.
- Sentence end: **hi, od → `।`**; **mr, te, gu → `.`**. Keep `!`, `?`, `:` as in English.
- Transliterate, don't translate: app, audio, tap, drag, chart, type, star, tip, fullscreen, reset.
- `Question 1 of 9` → `प्रश्न 1 / 9` pattern in all languages.

## 4. Fixed glossary
| en | hi | mr | te | gu | od |
|---|---|---|---|---|---|
| Ones | इकाई | एकक | ఒకట్లు | એકમ | ଏକ |
| Tens | दहाई | दशक | పదులు | દશક | ଦଶ |
| Hundreds | सैकड़ा | शतक | వందలు | સો | ଶହ |
| Thousands | हज़ार | हजार | వేలు | હજાર | ହଜାର |
| Ten Thousands | दस हज़ार | दहा हजार | పది వేలు | દસ હજાર | ଦଶ ହଜାର |
| Lakhs | लाख | लाख | లక్షలు | લાખ | ଲକ୍ଷ |
| Crores | करोड़ | कोटी | కోట్లు | કરોડ | କୋଟି |
| Place Value | स्थान मान | स्थानमूल्य | స్థాన విలువ | સ્થાન કિંમત | ସ୍ଥାନ ମୂଲ୍ୟ |
| Standard Form | मानक रूप | मानक रूप | ప్రామాణిక రూపం | પ્રમાણિત સ્વરૂપ | ମାନକ ରୂପ |
| Expanded Form | विस्तारित रूप | विस्तारित रूप | విస్తరించిన రూపం | વિસ્તૃત સ્વરૂપ | ବିସ୍ତୃତ ରୂପ |
| Target Number | लक्ष्य संख्या | लक्ष्य क्रमांक | లక్ష్య సంఖ్య | લક્ષ્ય સંખ્યા | ଲକ୍ଷ୍ୟ ସଂଖ୍ୟା |
| Correct! | सही! | बरोबर! | సరియైనది! | સાચું! | ସଠିକ! |
| Try again | फिर से प्रयास करें | पुन्हा प्रयत्न करा | మళ్ళీ ప్రయత్నించండి | ફરી પ્રયાસ કરો | ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ |
| Well done! | शाबाश! | शाब्बास! | శభాష్! | શાબાશ! | ଶାବାଶ! |
| Hint | संकेत | संकेत | సూచన | સૂચના | ସଂକେତ |
| Tip | सुझाव | टिप | చిట్కా | ટિપ | ଟିପ |
| comma | अल्पविराम | स्वल्पविराम | కామా | અલ્પવિરામ | କମ |

For any other term, reuse its existing translation in the file before inventing one.

## 5. Workflow
1. Read `locales.json`; diff each language's keys against `en`.
2. Translate missing/new keys for all 5 languages per rules above.
3. Write back valid JSON (UTF-8, 2-space indent); re-verify key parity and placeholder/tag integrity.
4. Report keys added per language; flag any `en` string that looks stale vs. other languages.
