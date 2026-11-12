// Records a language's voice-over masters with ElevenLabs from assets/VO-<LANG>/vo_script_<lang>.json
// (then run tools/vo_lang_build.js <lang> to make the game's clips and map).
//
//   node tools/vo_lang_record.js mr --count                      no network: words, characters, estimated credits / minutes
//   ELEVENLABS_API_KEY=... node tools/vo_lang_record.js mr --voices        the voice library's voices for the language
//   ELEVENLABS_API_KEY=... node tools/vo_lang_record.js mr --only a,b,c    record these clips (files) only
//   ELEVENLABS_API_KEY=... node tools/vo_lang_record.js mr [--redo]        record every clip with no master (--redo: all)
//
// The script names the model, the voice of each speaker (voices.<speaker>.voice_id) and its settings. Masters go to
// masters/<file>.mp3 (44.1 kHz, 128 kbps). The key is read from the environment only; never write it into a file.
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const LANG = (process.argv[2] || '').toLowerCase();
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const has = (n) => process.argv.includes(n);
if (!/^[a-z]{2,3}$/.test(LANG)) { console.error('usage: node tools/vo_lang_record.js <lang> [--count|--voices|--only a,b|--redo]'); process.exit(1); }
const DIR = path.join(ROOT, 'assets/VO-' + LANG.toUpperCase()), MASTERS = path.join(DIR, 'masters');
const SCRIPT = path.join(DIR, 'vo_script_' + LANG + '.json');
const script = JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));
const KEY = process.env.ELEVENLABS_API_KEY, API = 'https://api.elevenlabs.io';
const perChar = /flash|turbo|eleven_v4/.test(script.model) ? 0.5 : 1; // (eleven_v4 charged ~0.49 per character, Nov 2026)

function counts(clips) {
  const words = clips.reduce((t, c) => t + c.spoken.split(/\s+/).filter(Boolean).length, 0);
  const chars = clips.reduce((t, c) => t + c.spoken.length, 0);
  return { clips: clips.length, words, chars, credits: Math.ceil(chars * perChar) };
}
async function api(p, opt) {
  for (let i = 0; ; i++) {
    const r = await fetch(API + p, { ...opt, headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', ...(opt && opt.headers) } });
    if ((r.status === 429 || r.status === 409 || r.status >= 500) && i < 6) { await new Promise((s) => setTimeout(s, 2000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status + ': ' + (await r.text()).slice(0, 400));
    return r;
  }
}
const used = async () => { try { return await (await api('/v1/user/subscription')).json(); } catch (e) { return null; } }; // needs user_read

(async () => {
  if (has('--count')) {
    const c = counts(script.clips);
    console.log(JSON.stringify({ ...c, model: script.model, credits_per_char: perChar }));
    return;
  }
  if (!KEY) { console.error('set ELEVENLABS_API_KEY'); process.exit(1); }
  if (has('--voices')) {
    const out = [];
    for (let page = 0; page < 5; page++) {
      const j = await (await api('/v1/shared-voices?page_size=100&language=' + LANG + '&page=' + page)).json();
      j.voices.forEach((v) => out.push({ id: v.voice_id, name: v.name, gender: v.gender, age: v.age, accent: v.accent, use: v.use_case,
        category: v.category, desc: (v.description || '').slice(0, 160), langs: (v.verified_languages || []).filter((l) => l.language === LANG).map((l) => l.model_id + (l.accent ? '/' + l.accent : '')).join(' '),
        cloned: v.cloned_by_count, owner: v.public_owner_id, preview: v.preview_url }));
      if (!j.has_more) break;
    }
    console.log(JSON.stringify(out, null, 1));
    return;
  }
  const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
  fs.mkdirSync(MASTERS, { recursive: true });
  const todo = script.clips.filter((c) => (only ? only.has(c.file) : has('--redo') || !fs.existsSync(path.join(MASTERS, c.file + '.mp3'))));
  if (only && todo.length !== only.size) { console.error('not in the script: ' + [...only].filter((f) => !todo.some((c) => c.file === f))); process.exit(1); }
  todo.forEach((c) => { if (!script.voices[c.speaker] || !script.voices[c.speaker].voice_id) throw new Error('no voice for ' + c.speaker); });
  const before = await used(), t0 = Date.now();
  let done = 0, next = 0, cost = 0;
  const one = async (c) => {
    const s = script.settings[c.speaker], body = { text: c.spoken, model_id: script.model, voice_settings: s };
    if (script.language_code) body.language_code = script.language_code;
    if (script.settings.seed != null) body.seed = script.settings.seed;
    const r = await api('/v1/text-to-speech/' + script.voices[c.speaker].voice_id + '?output_format=mp3_44100_128', { method: 'POST', body: JSON.stringify(body) });
    fs.writeFileSync(path.join(MASTERS, c.file + '.mp3'), Buffer.from(await r.arrayBuffer()));
    const k = +(r.headers.get('character-cost') || r.headers.get('x-character-count') || 0); cost += k;
    console.log(++done + '/' + todo.length + ' ' + c.file + ' (' + c.speaker + ', ' + c.spoken.length + ' chars, cost ' + (k || '?') + ')');
  };
  const workers = Array.from({ length: Math.min(+(arg('--jobs') || 3), todo.length) }, async () => { while (next < todo.length) await one(todo[next++]); });
  await Promise.all(workers);
  const after = await used();
  console.log(JSON.stringify({ recorded: todo.length, ...counts(todo), credits_charged: cost, credits_used: before && after ? after.character_count - before.character_count : null,
    credits_left: after ? after.character_limit - after.character_count : null, seconds_taken: Math.round((Date.now() - t0) / 1000) }));
})().catch((e) => { console.error(e.message || e); process.exit(1); });
