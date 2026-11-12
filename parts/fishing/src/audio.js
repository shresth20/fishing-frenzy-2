(function (PopoGame) {
'use strict';

// Music and effects are synthesised with the Web Audio API; the voice lines are recorded
// (tools/build-voice.py). Groups: music, sfx and voice.

const BPM = 84;
const EIGHTH = 60 / BPM / 2;
const CHORDS = [
  [261.63, 329.63, 392.0, 523.25],   // C
  [220.0, 261.63, 329.63, 440.0],    // Am
  [174.61, 220.0, 261.63, 349.23],   // F
  [196.0, 246.94, 293.66, 392.0],    // G
];

// The lesson's measure of one of its clips (../lesson/js/vo_lines.js, loaded before this script): its words as the
// lesson splits them ("5 cm" and "AB = 7 cm" kept whole, joined by no-break spaces), when each starts in the clip, and
// where its speech ends; null if it isn't there.
let lessonIndex = null;
function lessonLine(url) {
  const id = (url.match(/(vo\d+)\.ogg/) || [])[1];
  if (!id || typeof VO_LINES === 'undefined') return null;
  if (!lessonIndex) {
    lessonIndex = new Map();
    for (const [text, v] of Object.entries(VO_LINES)) lessonIndex.set(v[0], { text, times: v[2], end: v[3] });
  }
  const e = lessonIndex.get(id);
  if (!e || !e.times) return null;
  const words = e.text.replace(/(\d) (cm)\b/g, '$1\u00a0$2').replace(/ ([=+\u2212]) /g, '\u00a0$1\u00a0').split(/[ \t\n]+/).filter(Boolean);
  return words.length === e.times.length ? { words, times: e.times, end: e.end } : null;
}

// A line's key in voice-data.js: who it is, and its text without its *stress* marks, in lower case.
function voiceKey(who, text) {
  return `${who}:${text.replace(/\*/g, '').replace(/…/g, '...').replace(/’/g, "'").split(/\s+/).filter(Boolean).join(' ')}`.toLowerCase();
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.held = false; // in the journey, while the lesson covers the game (hold)
    this.musicOn = false;
    this.travel = false;
    this.beat = 0;
    this.nextBeat = 0;
    this.timer = null;
    this.effectSources = new Set();
    this.voiceBuffers = new Map();
    this.laterVoices = []; // the lesson's clips, fetched on Play (fetchLaterVoices)
    this.voiceSource = null;
    this.duckSfx = false; // (the hook: setDuckSfx)
  }

  // Recorded voice lines (voice-data.js), decoded with an offline context so they are ready before they are needed.
  // A line is embedded (a data URL: decoded before the banner is ready) or the lesson's own clip ('<path>#<seconds>':
  // fetched behind the banner, played from where its first word starts, past the clip's quiet lead-in).
  // In a language recorded in full (shell/i18n.js I18n.voiced: ?lan=hi) each line plays that language's clip instead
  // (inLanguage).
  prepareVoices(data) {
    const entries = Object.entries(window.I18n && I18n.voiced ? this.inLanguage(data) : data || {});
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!entries.length || !OAC) return Promise.resolve();
    const decoder = new OAC(1, 1, 24000);
    // (Safari calls the error callback and also rejects the promise it returns: both are handled)
    const decode = (bytes) => new Promise((resolve) => { const p = decoder.decodeAudioData(bytes, resolve, () => resolve(null)); if (p && p.catch) p.catch(() => resolve(null)); });
    const embedded = [];
    for (const [key, src] of entries) {
      if (src.startsWith('data:')) {
        const bin = atob(src.slice(src.indexOf(',') + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        embedded.push(decode(bytes.buffer).then((buf) => { if (buf) this.voiceBuffers.set(key, { buf, lead: 0 }); }));
      } else {
        this.laterVoices.push([key, src]);
      }
    }
    this.decodeVoice = decode;
    return Promise.all(embedded);
  }

  // The lines' clips in the player's language (assets/VO-<LANG>/ at the repository's root: VO-HI, VO-MR), each found by its line's key
  // (I18n.keyOf: the voice key's text is the line's English): fetched as files behind the banner, played from their start
  // (they open with only a few hundredths of a second of quiet). One voice: a line with no clip in that language is left
  // out (it shows at a reading pace), rather than said in English.
  inLanguage(data) {
    const out = {};
    for (const key of Object.keys(data || {})) {
      const clip = I18n.voiceClip(I18n.keyOf(key.slice(key.indexOf(':') + 1)));
      if (clip) out[key] = clip.url;
    }
    return out;
  }

  // The lesson's clips the nets borrow, fetched once Play is tapped (they are first needed after the lesson), so the
  // banner loads without them. Each brings the lesson's own measure of when every word starts in it
  // (../lesson/js/vo_lines.js), so the words on the plate come exactly as they are said (wordTimes).
  fetchLaterVoices() {
    const later = this.laterVoices;
    this.laterVoices = [];
    for (const [key, src] of later) {
      const [url, at] = src.split('#');
      const measured = lessonLine(url);
      fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((bytes) => bytes && this.decodeVoice(bytes))
        .then((buf) => { if (buf) this.voiceBuffers.set(key, { buf, lead: Math.min(parseFloat(at) || 0, buf.duration), measured }); })
        .catch(() => { /* (opened from disk, or offline: the line shows without its voice) */ });
    }
  }

  // When each of `words` (the plate's words, UI wordsOf) is said, in seconds from the line's start, from the lesson's
  // measure of its clip: null for a line without one (its words are then shared out by length). The lesson splits a
  // line a little differently ("AB = 7 cm" is one of its words, four of the plate's), so the plate's words are matched
  // to the lesson's by their letters, and the parts of one lesson word follow each other through it.
  wordTimes(who, text, words) {
    const v = this.voiceBuffers.get(voiceKey(who, text));
    const m = v && v.measured;
    if (!m || !words.length) return null;
    const norm = (t) => t.replace(/\*/g, '').replace(/…/g, '...').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
    if (norm(words.map((w) => w.text).join(' ')) !== norm(m.words.join(' ').replace(/\u00a0/g, ' '))) return null;
    const out = [];
    m.words.forEach((lw, i) => {
      const parts = lw.split('\u00a0'), start = m.times[i], next = i + 1 < m.times.length ? m.times[i + 1] : m.end || start + 0.4;
      parts.forEach((_, j) => out.push(Math.max(0, start + ((next - start) * 0.8 * j) / parts.length - v.lead)));
    });
    return out.length === words.length ? out : null;
  }

  // Where the line playing now is, in seconds from its start (on the sound's own clock, so the words never drift from
  // the voice, however the frames go); -1 once `src` is no longer the voice playing.
  voiceTime(src) {
    if (!this.ctx || !src || this.voiceSource !== src) return -1;
    return this.ctx.currentTime - this.voiceStartAt;
  }

  // Plays a recorded line and returns its length in seconds (0 when there is no recording,
  // so the line shows at a reading pace). The music ducks under the voice.
  speak(who, text) {
    const v = this.voiceBuffers.get(voiceKey(who, text));
    if (!this.ctx || !v || this.ctx.state !== 'running') return 0;
    this.stopVoice();
    const src = this.ctx.createBufferSource();
    src.buffer = v.buf;
    src.connect(this.voice);
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(0.18, now, 0.05);
    if (this.duckSfx) { this.sfx.gain.cancelScheduledValues(now); this.sfx.gain.setTargetAtTime(0.45, now, 0.05); }
    src.onended = () => {
      if (this.voiceSource !== src) return;
      this.voiceSource = null;
      this.unduck();
    };
    src.start(now, v.lead);
    this.voiceSource = src;
    this.voiceStartAt = now;
    return v.buf.duration - v.lead;
  }

  stopVoice() {
    const src = this.voiceSource;
    if (!src) return;
    this.voiceSource = null;
    try { src.stop(); } catch (e) { /* already stopped */ }
    this.unduck();
  }

  // the music (and, in the hook, the sound effects: duckSfx) come back up once the voice stops
  unduck() {
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(0.5, now, 0.25);
    this.sfx.gain.cancelScheduledValues(now);
    this.sfx.gain.setTargetAtTime(0.9, now, 0.2);
  }

  // The hook's story is told over its own action: while it plays, its sound effects step down under each line too, so
  // no splash or tangle covers a word (`on` false: the game's usual mix, sound effects at full under the voice).
  setDuckSfx(on) {
    this.duckSfx = on;
    if (!on && this.ctx && !this.voiceSource) this.unduck();
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone and iPad: play through the ringer's silent switch, like a game should
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older WebKit */ }
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted || this.held ? 0 : 1;
    this.master.connect(ctx.destination);
    if (this.held) ctx.suspend();
    this.music = this.gainNode(0.5, this.master);
    this.sfx = this.gainNode(0.9, this.master);
    this.voice = this.gainNode(1, this.master);

    // a touch of shimmer for the music bed
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = EIGHTH * 3;
    const feedback = this.gainNode(0.28, this.delay);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    this.delay.connect(tone);
    tone.connect(feedback);
    tone.connect(this.music);

    this.noiseBuffer = this.makeNoise();
    this.startAmbience();
  }

  gainNode(value, dest) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = this.gainNode(0.045, this.music);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = this.gainNode(0.02, g.gain);
    lfo.connect(lfoGain);
    src.connect(lp);
    lp.connect(g);
    src.start();
    lfo.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && !this.held) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  suspend() {
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.suspend();
  }

  resume() {
    if (!this.ctx || this.held) return;
    if (this.ctx.state !== 'running') this.ctx.resume();
    // notes are queued a little ahead; don't schedule the same beat twice
    this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.05);
  }

  // In the journey (shell/bridge.js) the lesson can cover the game: then every sound stops (music, effects, a voice
  // line) and the context sleeps, and nothing wakes it (a tap, the tab coming back) until the game shows again. Then
  // the sound fades back in, the music too if it was playing; the notes queued before it slept go by unheard.
  hold(on) {
    if (on === this.held && (on || !this.faded)) return;
    this.held = on;
    if (on && !this.faded) this.musicWas = this.musicOn;
    this.faded = false;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    if (on) {
      this.stopVoice();
      this.stopEffects();
      this.stopMusic();
      this.ctx.suspend();
      return;
    }
    this.resume();
    if (!this.muted) this.master.gain.setTargetAtTime(1, now + 0.35, 0.08);
    if (this.musicWas) this.startMusic();
  }

  // In the journey, as the next part dissolves in over the game: every sound fades away with it (hold follows).
  fadeOut() {
    if (this.held || this.faded) return;
    this.faded = true;
    this.musicWas = this.musicOn;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.08);
  }

  setTravel(on) {
    this.travel = on;
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.beat = 0;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  schedule() {
    if (this.ctx.state !== 'running') return;
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      this.playBeat(this.beat, this.nextBeat);
      this.beat += 1;
      this.nextBeat += EIGHTH;
    }
  }

  playBeat(i, t) {
    const chord = CHORDS[Math.floor(i / 16) % CHORDS.length];
    const step = i % 16;
    const pattern = [0, 2, 1, 3, 2, 3, 1, 2];
    const note = chord[pattern[step % 8]] * (step >= 8 ? 2 : 1);
    this.tone({ freq: note, type: 'triangle', t, dur: 0.32, gain: 0.07, attack: 0.01, dest: this.music, send: 0.5 });
    if (step % 8 === 0) this.tone({ freq: chord[0] / 2, type: 'sine', t, dur: 1.3, gain: 0.11, attack: 0.03, dest: this.music });
    if (step === 0) this.bell(chord[3] * 2, t, 0.05);
    if (this.travel && step % 4 === 0) this.noise({ t, dur: 0.28, type: 'bandpass', freq: 900, q: 0.8, gain: 0.08, to: 300, dest: this.music });
  }

  tone({ freq, type = 'sine', t, dur = 0.2, gain = 0.2, attack = 0.005, to = null, dest = this.sfx, send = 0 }) {
    if (!this.ctx) return;
    const start = t ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(dest);
    if (send && this.delay) {
      const s = this.gainNode(send, this.delay);
      g.connect(s);
    }
    this.trackEffect(osc, dest);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  bell(freq, t, gain = 0.1) {
    this.tone({ freq, type: 'sine', t, dur: 1.2, gain, dest: this.music, send: 0.6 });
    this.tone({ freq: freq * 2.76, type: 'sine', t, dur: 0.5, gain: gain * 0.25, dest: this.music });
  }

  noise({ t, dur = 0.3, type = 'lowpass', freq = 1000, q = 1, gain = 0.3, to = null, dest = this.sfx }) {
    if (!this.ctx) return;
    const start = t ?? this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, start);
    if (to) f.frequency.exponentialRampToValueAtTime(to, start + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    this.trackEffect(src, dest);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  trackEffect(source, destination) {
    if (destination !== this.sfx) return;
    this.effectSources.add(source);
    source.onended = () => { this.effectSources.delete(source); source.disconnect(); };
  }

  stopEffects() {
    for (const source of this.effectSources) {
      try { source.stop(); } catch (e) { /* already ended */ }
      source.disconnect();
    }
    this.effectSources.clear();
    if (this.ctx && this.music) {
      this.music.gain.cancelScheduledValues(this.ctx.currentTime);
      this.music.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.04);
    }
  }

  // The winch's ratchet, one tick per notch, for as long as the net is moving.
  crank(seconds) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ticks = Math.floor(seconds / 0.09);
    for (let i = 0; i < ticks; i += 1) {
      const t = now + i * 0.09;
      this.noise({ t, dur: 0.025, type: 'highpass', freq: 2200, gain: 0.07 });
      if (i % 2 === 0) this.tone({ freq: 520, to: 470, t, type: 'triangle', dur: 0.04, gain: 0.03 });
    }
  }

  // Effects are skipped while the browser holds the sound back (before the first tap), not
  // queued up to burst out together when it lets go.
  play(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const seq = (notes, gap, opts) => notes.forEach((n, i) => this.tone({ freq: n, t: now + i * gap, ...opts }));
    switch (name) {
      case 'ui': this.tone({ freq: 640, to: 520, dur: 0.07, gain: 0.12 }); break;
      case 'whoosh': this.noise({ dur: 0.38, type: 'bandpass', freq: 500, to: 2400, q: 1.2, gain: 0.25 }); break;
      case 'splashSmall': this.noise({ dur: 0.26, type: 'lowpass', freq: 1800, to: 500, gain: 0.3 }); this.tone({ freq: 900, to: 320, dur: 0.14, gain: 0.1 }); break;
      case 'collect': seq([523.25, 659.25, 783.99], 0.08, { dur: 0.25, gain: 0.14 }); this.noise({ dur: 0.12, type: 'lowpass', freq: 500, gain: 0.2 }); break;
      case 'success':
        [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.bell(n, now + i * 0.12, 0.12));
        break;
      case 'puff': this.tone({ freq: 420, to: 740, dur: 0.09, gain: 0.075 }); this.noise({ dur: 0.06, type: 'lowpass', freq: 750, gain: 0.04 }); break;
      case 'bubbles': seq([360, 480, 620], 0.07, { type: 'sine', dur: 0.07, gain: 0.045 }); break;
      case 'drip': this.tone({ freq: 1100, to: 550, dur: 0.09, gain: 0.05 }); break;
      case 'paddle': this.noise({ dur: 0.25, type: 'bandpass', freq: 900, to: 300, q: 0.8, gain: 0.14 }); break;
      case 'complete': [392.0, 523.25, 659.25, 783.99].forEach((n, i) => { this.tone({ freq: n, t: now + i * 0.15, type: 'triangle', dur: 0.5, gain: 0.12 }); this.bell(n * 2, now + i * 0.15, 0.06); }); break;
      case 'hint': this.tone({ freq: 880, dur: 0.18, gain: 0.07 }); break;
      case 'talk': { const f = 250 + Math.random() * 130; this.tone({ freq: f, to: f * (1.1 + Math.random() * 0.25), type: 'triangle', dur: 0.07, gain: 0.08 }); break; }
      case 'narrate': this.bell(523.25, now, 0.07); this.bell(783.99, now + 0.12, 0.05); break;
      case 'splashBig': this.noise({ dur: 0.55, type: 'lowpass', freq: 1400, to: 300, gain: 0.45 }); this.tone({ freq: 700, to: 200, dur: 0.25, gain: 0.14 }); this.tone({ freq: 500, to: 180, t: now + 0.12, dur: 0.3, gain: 0.1 }); break;
      case 'hmm': this.tone({ freq: 330, to: 290, type: 'triangle', dur: 0.2, gain: 0.08 }); this.tone({ freq: 290, to: 380, t: now + 0.2, type: 'triangle', dur: 0.24, gain: 0.08 }); break;
      case 'chirp': { const f = 1500 + Math.random() * 500; this.tone({ freq: f, to: f * 1.45, type: 'sine', dur: 0.06, gain: 0.06 }); this.tone({ freq: f * 1.3, to: f * 1.05, t: now + 0.06, type: 'sine', dur: 0.05, gain: 0.04 }); break; }
      case 'flap': this.noise({ dur: 0.12, type: 'bandpass', freq: 1300, to: 520, q: 0.9, gain: 0.07 }); break;
      case 'woah': this.tone({ freq: 380, to: 1150, type: 'sine', dur: 0.34, gain: 0.11 }); this.tone({ freq: 1150, to: 720, t: now + 0.32, type: 'sine', dur: 0.3, gain: 0.08 }); break;
      case 'leap': this.noise({ dur: 0.5, type: 'bandpass', freq: 400, to: 2600, q: 1.1, gain: 0.22 }); this.tone({ freq: 300, to: 760, dur: 0.4, gain: 0.08, type: 'triangle' }); break;
      // a catch: Fishing Frenzy's party toot as the bubble confetti bursts
      case 'combo3': [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((n, i) => { this.tone({ freq: n, type: 'triangle', t: now + i * 0.07, dur: i === 4 ? 0.45 : 0.1, gain: 0.08 }); this.tone({ freq: n * 2, type: 'sine', t: now + i * 0.07, dur: 0.08, gain: 0.03 }); }); this.noise({ t: now + 0.3, dur: 0.4, type: 'highpass', freq: 5000, gain: 0.05 }); break;
      // the banner: its logo popping in
      case 'fanfare': [392.0, 523.25, 659.25].forEach((n, i) => { this.tone({ freq: n, type: 'square', t: now + i * 0.08, dur: 0.1, gain: 0.05 }); this.tone({ freq: n, type: 'triangle', t: now + i * 0.08, dur: 0.12, gain: 0.07 }); }); [523.25, 659.25, 783.99, 1046.5].forEach((n) => this.tone({ freq: n, type: 'triangle', t: now + 0.26, dur: 0.7, gain: 0.06, send: 0.5 })); this.bell(2093, now + 0.3, 0.06); break;
      case 'thud': this.tone({ freq: 150, to: 52, dur: 0.28, gain: 0.3 }); this.noise({ dur: 0.18, type: 'lowpass', freq: 420, to: 120, gain: 0.35 }); break;
      case 'boing': this.tone({ freq: 170, to: 560, type: 'sine', dur: 0.22, gain: 0.12 }); this.tone({ freq: 560, to: 420, t: now + 0.2, type: 'sine', dur: 0.16, gain: 0.07 }); break;
      // comic sound effects for Popo's entrance
      case 'honk': [0, 0.2].forEach((d) => { this.tone({ freq: 420, to: 380, type: 'square', t: now + d, dur: 0.13, gain: 0.07 }); this.tone({ freq: 630, to: 560, type: 'triangle', t: now + d, dur: 0.13, gain: 0.05 }); }); break;
      case 'skid': this.tone({ freq: 1650, to: 1250, type: 'sawtooth', dur: 0.5, gain: 0.035 }); this.tone({ freq: 1720, to: 1300, type: 'sawtooth', dur: 0.5, gain: 0.03 }); this.noise({ dur: 0.5, type: 'bandpass', freq: 2600, to: 1500, q: 2, gain: 0.12 }); break;
      case 'poof': this.noise({ dur: 0.32, type: 'lowpass', freq: 1800, to: 240, gain: 0.32 }); this.tone({ freq: 160, to: 70, dur: 0.22, gain: 0.12 }); break;
      case 'tada': [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => { this.tone({ freq: n, t: now + i * 0.07, type: 'triangle', dur: i === 3 ? 0.5 : 0.12, gain: 0.09 }); }); this.bell(2093, now + 0.21, 0.05); break;
      case 'giggle': [0, 0.07, 0.14, 0.21].forEach((d, i) => this.tone({ freq: 760 + i * 90, to: 1050 + i * 90, type: 'triangle', t: now + d, dur: 0.06, gain: 0.06 })); break;
      case 'word': { const f = 700 + Math.random() * 260; this.tone({ freq: f, to: f * 1.15, type: 'sine', dur: 0.05, gain: 0.04 }); break; }
      case 'cheer': [523.25, 659.25, 783.99].forEach((n, i) => this.tone({ freq: n, t: now + i * 0.07, type: 'triangle', dur: 0.16, gain: 0.08 })); break;
      case 'bloop': this.tone({ freq: 420, to: 980, dur: 0.12, gain: 0.09 }); this.tone({ freq: 620, to: 1300, t: now + 0.08, dur: 0.09, gain: 0.05 }); break;
      // a fish reaching the counter: a bright plink, rising
      case 'count': this.tone({ freq: 1320, to: 1760, type: 'triangle', dur: 0.08, gain: 0.08 }); this.tone({ freq: 1980, t: now + 0.06, type: 'sine', dur: 0.14, gain: 0.05 }); break;
      // the end screen's circle closing in (or shut), a sliding whistle as in Fishing Frenzy
      case 'iris': this.tone({ freq: 1400, to: 260, type: 'sine', dur: 0.75, gain: 0.1 }); break;
      // the net puzzle: picking the corner up, letting it go off its place, it clicking home
      case 'grab': this.tone({ freq: 320, to: 620, dur: 0.09, gain: 0.14 }); this.noise({ dur: 0.04, type: 'highpass', freq: 2500, gain: 0.05 }); break;
      case 'wobble': this.tone({ freq: 300, to: 240, type: 'triangle', dur: 0.14, gain: 0.07 }); this.tone({ freq: 260, to: 290, t: now + 0.12, type: 'triangle', dur: 0.12, gain: 0.05 }); break;
      case 'snap': this.noise({ dur: 0.04, type: 'highpass', freq: 3000, gain: 0.12 }); this.tone({ freq: 740, to: 980, dur: 0.1, gain: 0.12 }); this.tone({ freq: 1480, dur: 0.14, t: now + 0.05, gain: 0.05 }); break;
      // measurements changing under the finger
      case 'tick': this.tone({ freq: 1320, dur: 0.035, gain: 0.045 }); break;
      case 'catch': seq([523.25, 659.25, 783.99, 1046.5], 0.07, { type: 'triangle', dur: 0.2, gain: 0.08 }); this.noise({ dur: 0.3, type: 'lowpass', freq: 900, to: 300, gain: 0.12 }); break;
      // a wrong net: its catch thrashing about, then the mesh tearing
      case 'struggle': [0, 0.14, 0.3, 0.42, 0.58, 0.7, 0.84].forEach((d) => { this.tone({ freq: 150, to: 80, t: now + d, dur: 0.09, gain: 0.12 }); this.noise({ t: now + d, dur: 0.06, type: 'lowpass', freq: 700, gain: 0.12 }); }); break;
      // the hook: a net twisting into a tangle (a rope's quick wind-up), a playful "wah-wah" when it fails, a fish's
      // soft cartoon tap on the net's corner, and a small shimmer as the net that stays open settles
      case 'tangle': [0, 0.06, 0.12, 0.18, 0.24].forEach((d, i) => this.tone({ freq: 560 - i * 60, to: 400 - i * 50, type: 'triangle', t: now + d, dur: 0.07, gain: 0.05 })); this.noise({ dur: 0.36, type: 'bandpass', freq: 900, to: 380, q: 2, gain: 0.07 }); break;
      case 'fail': this.tone({ freq: 392, to: 370, type: 'triangle', dur: 0.2, gain: 0.08 }); this.tone({ freq: 349, to: 300, type: 'triangle', t: now + 0.22, dur: 0.4, gain: 0.08 }); break;
      case 'bump': this.tone({ freq: 300, to: 540, type: 'sine', dur: 0.08, gain: 0.12 }); this.noise({ dur: 0.05, type: 'lowpass', freq: 900, gain: 0.08 }); break;
      case 'shimmer': this.bell(1046.5, now, 0.045); this.bell(1318.5, now + 0.08, 0.035); this.bell(1568, now + 0.16, 0.03); break;
      case 'rip': this.noise({ dur: 0.38, type: 'bandpass', freq: 3400, to: 700, q: 3, gain: 0.32 }); [0, 0.05, 0.11, 0.2].forEach((d) => this.noise({ t: now + d, dur: 0.03, type: 'highpass', freq: 2800, gain: 0.16 })); this.tone({ freq: 240, to: 90, type: 'sawtooth', dur: 0.2, gain: 0.05 }); break;
      default: break;
    }
  }
}

Object.assign(PopoGame, { AudioEngine });
})(window.PopoGame = window.PopoGame || {});
