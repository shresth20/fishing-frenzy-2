// Builds a language's recorded voice-over (e.g. Hindi: assets/VO-HI/, Marathi: assets/VO-MR/) from its masters, for both parts of the journey.
//
//   node tools/vo_lang_build.js hi [--all]
//
// In assets/VO-<LANG>/:
//   vo_script_<lang>.json   the script: one clip per line key of locales.json (file, key, speaker, text as shown, spoken)
//   masters/<file>.mp3      the recordings as they came from the studio (ElevenLabs: tools/vo_lang_record.js), kept out of the deploy
//   <file>.ogg              made here: Ogg Opus, 32 kbps, mono, matched to the English voice-over's loudness (-16.4 LUFS),
//                           with parts/lesson/tools/vo_build.js's encoder (Chromium's WebCodecs: no ffmpeg)
//   vo_<lang>.js            made here: key -> [seconds, start of each word as the lesson's bubble shows it (s), end of its
//                           speech (s)], measured from the audio as the English map is (vo_build.js alignWords)
// The pages load vo_<lang>.js; shell/i18n.js finds a line's clip by its key (I18n.voiceClip) when ?lan=<lang>.
// Only masters newer than their clip are encoded again (--all: every one). Clips no line uses are deleted. Lines the game
// says that have no clip are listed. Needs Playwright (`npm i --no-save playwright`, or NODE_PATH); CHROME=/path/to/chrome
// if its own Chromium is not installed.
const fs = require('fs'), path = require('path');
const { encodeAll, envelopes, alignWords, oggSeconds, LUFS } = require('../parts/lesson/tools/vo_build.js');

const ROOT = path.join(__dirname, '..');
const LANG = (process.argv[2] || '').toLowerCase(), ALL = process.argv.includes('--all');
if (!/^[a-z]{2,3}$/.test(LANG)) { console.error('usage: node tools/vo_lang_build.js <lang> [--all]'); process.exit(1); }
const REL = 'assets/VO-' + LANG.toUpperCase() + '/', DIR = path.join(ROOT, REL), MASTERS = path.join(DIR, 'masters');
const SCRIPT = path.join(DIR, 'vo_script_' + LANG + '.json'), MAP = path.join(DIR, 'vo_' + LANG + '.js');
const LOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'locales.json'), 'utf8'));

// the lesson's bubble's own split of a line in another language (shownWords in parts/lesson/js/game-engine.js): a number
// and its unit, and short equations, stay one word; \n is a break, not a word
function shownWords(text) {
  const unit = String(LOC[LANG].unitCm || 'cm').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const glue = new RegExp('(\\d) (cm|' + unit + ')(?=$|[\\s.,;:!?)।])', 'g'), out = [];
  text.split('\n').forEach((part) => part.replace(glue, '$1 $2').replace(/ ([=+−]) /g, ' $1 ').split(/[ \t]+/)
    .forEach((tok) => { const t = tok.replace(/\*/g, ''); if (t) out.push(t); }));
  return out;
}
// how long a shown word is when said (as the script's spoken form says notation), to share a phrase's time out
const SAID = {
  hi: {
    num: { 0: 'शून्य', 1: 'एक', 2: 'दो', 3: 'तीन', 4: 'चार', 5: 'पाँच', 6: 'छह', 7: 'सात', 8: 'आठ', 9: 'नौ', 12: 'बारह', 25: 'पच्चीस',
      65: 'पैंसठ', 68: 'अड़सठ', 70: 'सत्तर', 72: 'बहत्तर', 90: 'नब्बे', 108: 'एक सौ आठ', 110: 'एक सौ दस', 115: 'एक सौ पंद्रह', 180: 'एक सौ अस्सी' },
    letters: { A: 'ए', B: 'बी', C: 'सी', D: 'डी', O: 'ओ' },
    words: { '∥': ' के समांतर है ', '∠': 'कोण ', '°': ' डिग्री', '+': ' जमा ', '=': ' बराबर ', '−': ' घटा ', 'सेमी': 'सेंटीमीटर' },
  },
  mr: {
    num: { 0: 'शून्य', 1: 'एक', 2: 'दोन', 3: 'तीन', 4: 'चार', 5: 'पाच', 6: 'सहा', 7: 'सात', 8: 'आठ', 9: 'नऊ', 12: 'बारा', 25: 'पंचवीस',
      65: 'पासष्ट', 68: 'अडुसष्ट', 70: 'सत्तर', 72: 'बहात्तर', 90: 'नव्वद', 108: 'एकशे आठ', 110: 'एकशे दहा', 115: 'एकशे पंधरा', 180: 'एकशे ऐंशी' },
    letters: { A: 'ए', B: 'बी', C: 'सी', D: 'डी', O: 'ओ' },
    words: { '∥': ' ला समांतर आहे ', '∠': 'कोन ', '°': ' अंश', '+': ' अधिक ', '=': ' बरोबर ', '−': ' वजा ', 'सेमी': 'सेंटीमीटर' },
  },
};
function saidLen(w) {
  const S = SAID[LANG];
  if (!S) return w.length + 1;
  let s = w.replace(/ /g, ' ').replace(/\d+/g, (d) => (S.num[d] ? ' ' + S.num[d] + ' ' : 'xxxx'.repeat(d.length)));
  Object.keys(S.words).forEach((k) => { s = s.split(k).join(S.words[k]); });
  s = s.replace(/\b[A-Z]+\b/g, (m) => m.split('').map((c) => S.letters[c] || c).join(' '));
  return s.replace(/\s+/g, ' ').trim().length + 1;
}
const norm = (t) => String(t).replace(/\*/g, '').replace(/…/g, '...').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

(async () => {
  const script = JSON.parse(fs.readFileSync(SCRIPT, 'utf8')), clips = script.clips, files = new Set(clips.map((c) => c.file));
  // 1. masters -> clips
  const todo = new Map(), noMaster = [];
  clips.forEach((c) => {
    const m = path.join(MASTERS, c.file + '.mp3'), o = path.join(DIR, c.file + '.ogg');
    if (!fs.existsSync(m)) { if (!fs.existsSync(o)) noMaster.push(c.file); return; }
    if (ALL || !fs.existsSync(o) || fs.statSync(m).mtimeMs > fs.statSync(o).mtimeMs) todo.set(c.file, fs.readFileSync(m));
  });
  if (todo.size) {
    const enc = await encodeAll(todo);
    Object.keys(enc).forEach((f) => {
      const o = path.join(DIR, f + '.ogg');
      fs.writeFileSync(o, enc[f]);
      const sec = oggSeconds(o);
      if (Math.abs(sec - enc[f].decoded) > 0.05) console.log('WARNING ' + f + ': granule length ' + sec.toFixed(2) + ' s, decodes to ' + enc[f].decoded.toFixed(2) + ' s');
    });
    const lv = Object.values(enc).map((e) => e.level).filter((v) => v != null);
    console.log('encoded ' + todo.size + ' clip(s), matched to ' + LUFS + ' LUFS (they came in at ' + Math.min(...lv).toFixed(1) + ' .. ' + Math.max(...lv).toFixed(1) + ')');
  }
  fs.readdirSync(DIR).forEach((f) => { const m = /^(.+)\.ogg$/.exec(f); if (m && !files.has(m[1])) { fs.unlinkSync(path.join(DIR, f)); console.log('removed ' + REL + f); } });

  // 2. the map: each clip's length, and when each shown word starts (a line of a key; not a value variant: key.<value>)
  const have = clips.filter((c) => fs.existsSync(path.join(DIR, c.file + '.ogg')));
  const env = await envelopes(have.map((c) => [c.file, path.join(DIR, c.file + '.ogg')]));
  if (!env) { console.error('Playwright not found: run `npm i --no-save playwright` (or set NODE_PATH).'); process.exit(1); }
  const map = {};
  let aligned = 0, bounds = 0;
  have.forEach((c) => {
    const e = [Math.round(oggSeconds(path.join(DIR, c.file + '.ogg')) * 100) / 100];
    if (c.file === c.key) {
      const words = shownWords(c.text), tw = alignWords(words, words.map(saidLen), env[c.file]);
      e.push(tw.t, tw.end); aligned += tw.matched; bounds += tw.bounds;
    }
    map[c.file] = e;
  });
  fs.writeFileSync(MAP, '// GENERATED by tools/vo_lang_build.js from ' + REL + 'vo_script_' + LANG + '.json. Do not edit by hand.\n' +
    '// The ' + LANG + ' voice-over (shell/i18n.js I18n.voiceClip): line key -> [seconds, start of each word as the lesson shows it (s),\n' +
    '// end of its speech (s)]; a value variant (key.<value>) has its length only.\n' +
    '(window.VO_LANGS = window.VO_LANGS || {}).' + LANG + ' = { dir: ' + JSON.stringify(REL) + ', ext: \'ogg\', clips: {\n' +
    Object.keys(map).map((k) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k])).join(',\n') + '\n} };\n');
  const total = Object.values(map).reduce((t, v) => t + v[0], 0);
  const bytes = fs.readdirSync(DIR).filter((f) => f.endsWith('.ogg')).reduce((t, f) => t + fs.statSync(path.join(DIR, f)).size, 0);
  console.log(REL + 'vo_' + LANG + '.js: ' + Object.keys(map).length + ' clips, ' + (total / 60).toFixed(1) + ' min, ' + (bytes / 1024).toFixed(0) + ' KB of clips; word timings: ' +
    aligned + ' of ' + bounds + ' comma / full-stop pauses found in the speech');
  if (noMaster.length) console.log('no master and no clip:\n  ' + noMaster.join('\n  '));

  // 3. every line the game says has a clip: the lesson's (parts/lesson/js/vo_lines.js) and the fishing game's
  // (parts/fishing/src/voice-data.js), each found by its English as shell/i18n.js finds it (I18n.keyOf)
  const byText = new Map();
  Object.keys(LOC.en).forEach((k) => { if (typeof LOC.en[k] === 'string' && !byText.has(norm(LOC.en[k]))) byText.set(norm(LOC.en[k]), k); });
  const said = [];
  const lesson = new Function(fs.readFileSync(path.join(ROOT, 'parts/lesson/js/vo_lines.js'), 'utf8') + '; return VO_LINES;')();
  Object.keys(lesson).forEach((t) => said.push(['lesson', t]));
  const fishing = fs.readFileSync(path.join(ROOT, 'parts/fishing/src/voice-data.js'), 'utf8');
  for (const m of fishing.matchAll(/^ {2}"[a-z]+:(.*?)":/gm)) said.push(['fishing', m[1]]);
  const unvoiced = said.filter(([, t]) => { const k = byText.get(norm(t)); return !k || !map[k]; });
  console.log('lines the game says: ' + said.length + ', with a clip: ' + (said.length - unvoiced.length));
  if (unvoiced.length) console.log('said with no ' + LANG + ' clip (shown silently):\n  ' + unvoiced.map(([p, t]) => p + ': ' + t).join('\n  '));
})().catch((e) => { console.error(e); process.exit(1); });
