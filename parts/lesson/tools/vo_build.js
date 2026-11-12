// Builds the recorded voice-over from the studio's zips (see docs/VOICEOVER.md).
//
//   node tools/vo_build.js [voiceovers_batch.zip ...]
//
// 1. Every voiceovers/<id>.mp3 (or .wav) in the zips whose id is in tools/vo_script.json becomes assets/vo/<id>.ogg
//    (Ogg Opus, 32 kbps, mono, 48 kHz, matched to LUFS): Chromium decodes the MP3 and encodes Opus (WebCodecs); the Ogg pages are
//    written here (RFC 7845). No ffmpeg needed. Needs Playwright: `npm i --no-save playwright` (or NODE_PATH).
// 2. js/vo_lines.js is regenerated from tools/vo_script.json and the clips' real lengths.
// 3. Clips no line uses are deleted. Lines with no clip, and lesson lines missing from the script, are listed.
// Safe to run again; with no zips it only re-measures the clips and rewrites the map.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(__dirname, 'vo_script.json'), VO = path.join(ROOT, 'assets', 'vo'), MAP = path.join(ROOT, 'js', 'vo_lines.js');
const RATE = 48000, BITRATE = 32000;
// every clip is matched to one loudness as it is encoded (BS.1770 integrated, LUFS): the level the lesson's lines and
// the game's sit at, so no line is louder or quieter than the one before it
const LUFS = -16.4;

// ---------- zip (read) ----------
function readZip(file) {
  const b = fs.readFileSync(file);
  let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error(file + ': not a zip');
  const n = b.readUInt16LE(e + 10); let p = b.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
    const lo = b.readUInt32LE(p + 42), name = b.slice(p + 46, p + 46 + nl).toString('utf8');
    const ds = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28), raw = b.slice(ds, ds + csize);
    if (!name.endsWith('/')) out.push({ name: name, data: method === 8 ? zlib.inflateRawSync(raw) : raw });
    p += 46 + nl + xl + cl;
  }
  return out;
}

// ---------- Ogg Opus (write / measure) ----------
const CRC = new Uint32Array(256).map((_, i) => { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; return r >>> 0; });
const crc = (buf) => { let c = 0; for (const x of buf) c = ((c << 8) ^ CRC[((c >>> 24) ^ x) & 255]) >>> 0; return c; };
function oggPage(type, granule, serial, seq, packets) {
  const segs = [];
  packets.forEach((pk) => { let l = pk.length; while (l >= 255) { segs.push(255); l -= 255; } segs.push(l); });
  const h = Buffer.alloc(27 + segs.length);
  h.write('OggS', 0); h[4] = 0; h[5] = type; h.writeBigInt64LE(BigInt(granule), 6);
  h.writeUInt32LE(serial, 14); h.writeUInt32LE(seq, 18); h[26] = segs.length; segs.forEach((s, i) => { h[27 + i] = s; });
  const pg = Buffer.concat([h, ...packets]); pg.writeUInt32LE(crc(pg), 22); return pg;
}
// packets: 20 ms Opus packets (960 samples at 48 kHz); n: real samples at 48 kHz; the last page's granule trims the padding
function oggOpus(packets, n, preSkip, srcRate) {
  const head = Buffer.alloc(19); head.write('OpusHead', 0); head[8] = 1; head[9] = 1; head.writeUInt16LE(preSkip, 10); head.writeUInt32LE(srcRate, 12);
  const vendor = Buffer.from('vo_build'), tags = Buffer.alloc(16 + vendor.length);
  tags.write('OpusTags', 0); tags.writeUInt32LE(vendor.length, 8); vendor.copy(tags, 12); tags.writeUInt32LE(0, 12 + vendor.length);
  const serial = 0x766f0000 + (n % 65536), pages = [oggPage(2, 0, serial, 0, [head]), oggPage(0, 0, serial, 1, [tags])];
  const end = preSkip + n;
  for (let i = 0, seq = 2; i < packets.length; i += 50, seq++) {
    const grp = packets.slice(i, i + 50), last = i + 50 >= packets.length;
    pages.push(oggPage(last ? 4 : 0, last ? end : Math.min(end, (i + grp.length) * 960), serial, seq, grp));
  }
  return Buffer.concat(pages);
}
// length in seconds from the last page's granule and the pre-skip
function oggSeconds(file) {
  const b = fs.readFileSync(file), pre = b.readUInt16LE(28 + 10); // OpusHead starts after the first page's 27-byte header + 1 lacing byte
  let i = b.lastIndexOf('OggS');
  return Number(b.readBigInt64LE(i + 6) - BigInt(pre)) / RATE;
}

// ---------- encode with Chromium ----------
async function encodeAll(mp3s) {
  let pw;
  try { pw = require('playwright'); } catch (e) { console.error('Playwright not found: run `npm i --no-save playwright` in the game folder (or set NODE_PATH).'); process.exit(1); }
  const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  await page.route('https://vo.build/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>vo</title>' }));
  await page.goto('https://vo.build/'); // a secure context, for WebCodecs
  const out = {};
  for (const [id, data] of mp3s) {
    const r = await page.evaluate(async ([b64, RATE, BITRATE, TARGET]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const src = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes.buffer);
      const len = Math.round(src.duration * RATE), off = new OfflineAudioContext(1, len, RATE);
      const node = off.createBufferSource(); node.buffer = src; node.connect(off.destination); node.start();
      const pcm = (await off.startRendering()).getChannelData(0);
      // matched to LUFS: K-weighted (48 kHz: a high shelf, then a high pass), 400 ms blocks every 100 ms, gated at -70 LUFS
      // and 10 LU under; the rare peak the gain pushes past 0.8 goes through a soft knee (never past 0.97)
      const biquad = (b, a, x) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
        return y; };
      const kw = biquad([1, -2, 1], [1, -1.99004745483398, 0.99007225036621],
        biquad([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], pcm));
      const blk = Math.min(kw.length, Math.round(0.4 * RATE)), hop = Math.round(0.1 * RATE), z = [];
      for (let i = 0; i + blk <= kw.length; i += hop) { let e = 0; for (let j = i; j < i + blk; j++) e += kw[j] * kw[j]; z.push(e / blk); }
      const lu = (v) => -0.691 + 10 * Math.log10(v), mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
      const loud = z.filter((v) => lu(v) > -70), gated = loud.filter((v) => lu(v) > lu(mean(loud)) - 10);
      const level = gated.length ? lu(mean(gated)) : null;
      if (level !== null) {
        const g = Math.pow(10, (TARGET - level) / 20);
        for (let i = 0; i < pcm.length; i++) { let v = pcm[i] * g; const m = Math.abs(v); if (m > 0.8) v = Math.sign(v) * (0.8 + 0.17 * Math.tanh((m - 0.8) / 0.17)); pcm[i] = v; }
      }
      const packets = []; let desc = null, err = null;
      const enc = new AudioEncoder({
        output: (chunk, meta) => {
          const a = new Uint8Array(chunk.byteLength); chunk.copyTo(a);
          packets.push(btoa(String.fromCharCode(...a)));
          if (meta && meta.decoderConfig && meta.decoderConfig.description) desc = btoa(String.fromCharCode(...new Uint8Array(meta.decoderConfig.description)));
        },
        error: (e) => { err = String(e); }
      });
      enc.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: 1, bitrate: BITRATE, opus: { frameDuration: 20000 } });
      enc.encode(new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: pcm.length, numberOfChannels: 1, timestamp: 0, data: pcm }));
      await enc.flush();
      return { n: pcm.length, srcRate: src.sampleRate, packets: packets, desc: desc, err: err, level: level };
    }, [data.toString('base64'), RATE, BITRATE, LUFS]);
    if (r.err) throw new Error(id + ': ' + r.err);
    const desc = r.desc ? Buffer.from(r.desc, 'base64') : null;
    const preSkip = desc && desc.toString('latin1', 0, 8) === 'OpusHead' ? desc.readUInt16LE(10) : 312;
    const packets = r.packets.map((p) => Buffer.from(p, 'base64'));
    if (packets.length * 960 < preSkip + r.n) throw new Error(id + ': encoder returned too few packets');
    out[id] = oggOpus(packets, r.n, preSkip, r.srcRate);
    out[id].level = r.level;
  }
  // every new clip must decode back to its own length
  for (const id of Object.keys(out)) {
    const sec = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      return (await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.buffer)).duration;
    }, out[id].toString('base64'));
    out[id].decoded = sec;
  }
  await browser.close();
  return out;
}

// ---------- word timing from the audio ----------
// Each clip's loudness every 10 ms (Chromium decodes the Ogg), for timeWords().
async function envelopes(files) {
  let pw;
  try { pw = require('playwright'); } catch (e) { return null; }
  const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  await page.route('https://vo.build/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>vo</title>' }));
  await page.goto('https://vo.build/');
  const out = {};
  for (const [id, f] of files) {
    out[id] = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.buffer);
      const d = buf.getChannelData(0), hop = Math.round(buf.sampleRate / 100), env = [];
      for (let i = 0; i + hop <= d.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += d[j] * d[j]; env.push(Math.sqrt(s / hop)); }
      return env;
    }, fs.readFileSync(f).toString('base64'));
  }
  await browser.close();
  return out;
}
// the engine's own word split (toWords in js/game-engine.js): "7 cm" and "AB = 7" stay one word
const toWords = (t) => t.replace(/(\d) (cm)\b/g, '$1 $2').replace(/ ([=+−]) /g, ' $1 ').split(/[ \t\n]+/).filter(Boolean);
// how long a written word is when said (numbers and symbols as words), for spreading time inside a phrase
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const numWords = (n) => (n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numWords(n % 100) : ''));
const saidLen = (w) => w.replace(/ /g, ' ').replace(/∠\s?([A-DO])/g, 'angle $1').replace(/∥/g, ' is parallel to ').replace(/\b([A-DO])([A-DO])\b/g, '$1 $2')
  .replace(/\bcm\b/g, 'centimetres').replace(/°/g, ' degrees').replace(/=/g, ' equals ').replace(/\+/g, ' plus ')
  .replace(/\d+(\.\d+)?/g, (m) => (m.includes('.') ? numWords(+m.split('.')[0]) + ' point ' + m.split('.')[1].split('').map((d) => ONES[+d]).join(' ') : numWords(+m)))
  .replace(/\s+/g, ' ').trim().length + 1;
// Word start times (s) for a line from its clip's loudness, and where its speech ends: speech runs from the first to
// the last loud frame; pauses (quiet runs >= 120 ms) are matched in order to the line's commas / full stops by a small
// alignment that weighs how long each pause is as well as where it falls (a full stop takes the long pause after it,
// not a short breath nearer its expected place; an unmatched long pause costs more than a short one), and inside each
// phrase the words share the time by their spoken length.
function timeWords(key, env) {
  const words = toWords(key);
  return alignWords(words, words.map(saidLen), env);
}
// the same for any language's words (tools/vo_lang_build.js): `words` as shown, `w` how long each is when said
// (। - the danda - is Hindi's full stop)
function alignWords(words, w, env) {
  const n = env.length;
  const sorted = env.slice().sort((a, b) => a - b), th = Math.max(0.006, 0.08 * sorted[Math.floor(n * 0.95)]);
  let s0 = 0; while (s0 < n - 3 && !(env[s0] >= th && env[s0 + 1] >= th && env[s0 + 2] >= th)) s0++;
  let s1 = n - 1; while (s1 > s0 && env[s1] < th) s1--;
  const pauses = [];
  for (let i = s0, q = -1; i <= s1; i++) {
    if (env[i] < th) { if (q < 0) q = i; } else if (q >= 0) { if (i - q >= 12) pauses.push([q, i]); q = -1; }
  }
  const cum = []; let tot = 0; w.forEach((x) => { cum.push(tot); tot += x; });
  const bnd = [], full = [];
  words.forEach((x, i) => { if (i < words.length - 1 && /[.,!?;:…।]$/.test(x)) { bnd.push(cum[i] + w[i]); full.push(/[.!?…।]$/.test(x)); } });
  const span = Math.max(1, s1 - s0), expect = bnd.map((c) => s0 + span * c / tot);
  // alignment (frames): match boundary b to pause p in order. Skipping a pause costs 10 + 2 per frame of it; skipping a
  // full stop 80, a comma 40; a match costs its distance from the expected place, less 1.5 (full stop) or 0.5 (comma)
  // per frame of the pause
  const B = bnd.length, Pn = pauses.length, INF = 1e9, dp = [], bk = [], plen = (j) => pauses[j][1] - pauses[j][0];
  for (let i = 0; i <= B; i++) { dp.push(new Array(Pn + 1).fill(INF)); bk.push(new Array(Pn + 1).fill(0)); }
  dp[0][0] = 0;
  for (let i = 0; i <= B; i++) for (let j = 0; j <= Pn; j++) {
    const v = dp[i][j]; if (v >= INF) continue;
    if (j < Pn) { const c = v + 10 + 2 * plen(j); if (c < dp[i][j + 1]) { dp[i][j + 1] = c; bk[i][j + 1] = 1; } }
    if (i < B) { const c = v + (full[i] ? 80 : 40); if (c < dp[i + 1][j]) { dp[i + 1][j] = c; bk[i + 1][j] = 2; } }
    if (i < B && j < Pn) {
      const c = v + Math.abs(expect[i] - (pauses[j][0] + pauses[j][1]) / 2) - (full[i] ? 1.5 : 0.5) * plen(j);
      if (c < dp[i + 1][j + 1]) { dp[i + 1][j + 1] = c; bk[i + 1][j + 1] = 3; }
    }
  }
  const anchors = [[0, s0, s0]]; // [chars, time leaving the previous phrase, time entering the next]
  const matched = [];
  for (let i = B, j = Pn; i > 0 || j > 0;) { const m = bk[i][j]; if (m === 3) { matched.push([bnd[i - 1], pauses[j - 1]]); i--; j--; } else if (m === 2) i--; else j--; }
  matched.reverse().forEach((m) => anchors.push([m[0], m[1][0], m[1][1]]));
  anchors.push([tot, s1, s1]);
  const at = (c) => { // a word that starts at a matched boundary starts after its pause
    for (let k = 1; k < anchors.length; k++) {
      const a = anchors[k - 1], b = anchors[k];
      if (c < b[0] || k === anchors.length - 1) return a[2] + (b[1] - a[2]) * (c - a[0]) / Math.max(1, b[0] - a[0]);
    }
    return s0;
  };
  return { t: cum.map((c) => Math.round(at(c)) / 100), end: (s1 + 1) / 100, matched: matched.length, bounds: B };
}

// ---------- the lesson's own lines (to spot new or changed ones) ----------
// same keys as js/voice.js: a shown line by its plain text, a voice-only line (keep) by its spoken text
function lessonLines() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'js', 'lesson-data.js'), 'utf8');
  // (the lesson's lines are its English by key: I18n.plain, as shell/i18n.js gives it)
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'locales', 'locales.json'), 'utf8')).en;
  const I18n = { plain: (k) => String(en[k] != null ? en[k] : k).replace(/\*/g, '') };
  const LESSON = new Function('I18n', src + '; return LESSON;')(I18n);
  const plain = (t) => t.replace(/\s*\n\s*/g, ' ').trim(), keys = new Set();
  const shown = (L) => keys.add(L.keep ? L.s : plain(L.t));
  // lines js/game-engine.js says itself on the tasks this lesson uses (checkDrag)
  const ENGINE = { dragB: ['BC is not parallel to AD yet. Keep dragging B to the right.', 'B went too far. Drag it back a little.'] };
  // the summary's ideas (js/summary.js IDEAS): said on the recap screen, not from a screen's lines
  ['A parallelogram is a quadrilateral with two pairs of opposite sides parallel.', 'Opposite sides are parallel.', 'Opposite sides are equal.',
    'Opposite angles are equal.', 'Adjacent angles are supplementary. They add up to 180°.', 'Diagonals bisect each other.'].forEach((t) => keys.add(t));
  LESSON.steps.forEach((st) => {
    (st.lines || []).concat(st.after || [], st.answerAfter || [], st.showAnswer ? [st.showAnswer] : []).forEach(shown); // (and a drag's answer shown)
    (ENGINE[st.task] || []).forEach((t) => keys.add(t));
    [st.wrong, st.ok].forEach((t) => { if (t) keys.add(plain(t)); });
    (st.opts || []).forEach((o) => { if (o.fb) keys.add(plain(o.fb)); });
    if (st.fill && st.fill.fb) Object.keys(st.fill.fb).forEach((k) => keys.add(plain(st.fill.fb[k])));
  });
  return keys;
}

// (tools/vo_lang_build.js, the voice-over in other languages, encodes and times its clips with these)
module.exports = { encodeAll, envelopes, alignWords, oggSeconds, LUFS };

if (require.main === module) (async () => {
  const script = JSON.parse(fs.readFileSync(SCRIPT, 'utf8')), ids = new Set(script.map((r) => r.id));
  fs.mkdirSync(VO, { recursive: true });
  const mp3s = new Map();
  process.argv.slice(2).forEach((z) => readZip(z).forEach((f) => {
    const m = /(?:^|\/)(vo\d{3})\.(?:mp3|wav)$/.exec(f.name);
    if (m && ids.has(m[1])) mp3s.set(m[1], f.data); else if (m) console.log('skipped ' + f.name + ' (not in vo_script.json)');
  }));
  if (mp3s.size) {
    const enc = await encodeAll(mp3s);
    Object.keys(enc).forEach((id) => {
      fs.writeFileSync(path.join(VO, id + '.ogg'), enc[id]);
      const sec = oggSeconds(path.join(VO, id + '.ogg'));
      if (Math.abs(sec - enc[id].decoded) > 0.05) console.log('WARNING ' + id + ': granule length ' + sec.toFixed(2) + ' s, decodes to ' + enc[id].decoded.toFixed(2) + ' s');
    });
    const lv = Object.values(enc).map((e) => e.level).filter((v) => v != null);
    console.log('encoded ' + mp3s.size + ' clip(s), matched to ' + LUFS + ' LUFS' + (lv.length ? ' (they came in at ' + Math.min(...lv).toFixed(1) + ' .. ' + Math.max(...lv).toFixed(1) + ')' : ''));
  }
  // clips no line uses (and anything else) leave assets/vo/
  fs.readdirSync(VO).forEach((f) => { const m = /^(vo\d{3})\.ogg$/.exec(f); if (!m || !ids.has(m[1])) { fs.unlinkSync(path.join(VO, f)); console.log('removed assets/vo/' + f); } });
  const map = {}, missing = [];
  // word timings: measured from every clip; without Playwright the ones already in js/vo_lines.js are kept
  const have = script.filter((r) => fs.existsSync(path.join(VO, r.id + '.ogg')));
  const env = await envelopes(have.map((r) => [r.id, path.join(VO, r.id + '.ogg')]));
  let prev = {};
  try { prev = new Function(fs.readFileSync(MAP, 'utf8') + '; return VO_LINES;')(); } catch (e) {}
  let aligned = 0, bounds = 0;
  script.forEach((r) => {
    const f = path.join(VO, r.id + '.ogg');
    if (!fs.existsSync(f)) { missing.push(r.id + '  ' + r.line); return; }
    const e = [r.id, Math.round(oggSeconds(f) * 100) / 100];
    if (env && env[r.id]) { const tw = timeWords(r.line, env[r.id]); e.push(tw.t, tw.end); aligned += tw.matched; bounds += tw.bounds; }
    else if (prev[r.line] && prev[r.line][0] === r.id && prev[r.line][2]) e.push(...prev[r.line].slice(2));
    map[r.line] = e;
  });
  if (env) console.log('word timings: measured from the audio (' + aligned + ' of ' + bounds + ' comma / full-stop pauses found in the speech)');
  else console.log('word timings: Playwright not found, kept the existing ones');
  fs.writeFileSync(MAP, '// GENERATED by tools/vo_build.js from tools/vo_script.json. Do not edit by hand.\n' +
    '// line as shown (plain text; a voice-only line by its spoken text) -> [clip in assets/vo/, seconds, start of each word (s),\n' +
    '// end of its speech (s)]\n' +
    'const VO_LINES = {\n' + Object.keys(map).map((k) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k])).join(',\n') + '\n};\n');
  const total = Object.values(map).reduce((t, v) => t + v[1], 0);
  const bytes = fs.readdirSync(VO).reduce((t, f) => t + fs.statSync(path.join(VO, f)).size, 0);
  console.log('js/vo_lines.js: ' + Object.keys(map).length + ' of ' + script.length + ' lines voiced, ' + (total / 60).toFixed(1) + ' min, assets/vo/ ' + (bytes / 1024).toFixed(0) + ' KB');
  if (missing.length) console.log('no clip yet:\n  ' + missing.join('\n  '));
  const inScript = new Set(script.map((r) => r.line)), lesson = lessonLines();
  const notIn = [...lesson].filter((k) => !inScript.has(k)), stale = script.filter((r) => !lesson.has(r.line));
  if (notIn.length) console.log('lesson lines missing from vo_script.json (add them, then voice them):\n  ' + notIn.join('\n  '));
  if (stale.length) console.log('script lines the lesson no longer says:\n  ' + stale.map((r) => r.id + '  ' + r.line).join('\n  '));
})().catch((e) => { console.error(e); process.exit(1); });
