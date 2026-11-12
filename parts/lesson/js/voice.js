// =====================================================================
// VOICE — recorded voice-over player (clips in assets/vo/, map in js/vo_lines.js, see docs/VOICEOVER.md).
// One reused <audio> element. A line is looked up by the exact plain text the bubble shows (a voice-only line by its
// spoken text). The engine's say() (js/game-engine.js) uses it as the clock for the line; when a clip is missing or
// cannot play, say() shows the line's words silently at a speaking pace.
// Off when the browser cannot play Ogg Opus (older Safari / iPad) or with ?vo=0. ?speed=2 plays clips faster (QA).
// In a language recorded in full (shell/i18n.js I18n.voiced: ?lan=hi, ?lan=mr, ?lan=gu) its own clips play instead, found by the line's
// key (I18n.keyOf, I18n.voiceClip: assets/VO-<LANG>/ at the repository's root), and no English clip is used.
// =====================================================================
(function () {
  const q = (k) => { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };
  // in the journey: the shell's <audio>, which its Play tap has unlocked (shell/bridge.js)
  const shared = window.Journey && window.Journey.embedded ? window.Journey.voiceElement() : null;
  let el = shared, held = false;
  if (!el) { try { el = new Audio(); el.preload = 'auto'; } catch (e) { el = null; } }
  let canOgg = false;
  try { canOgg = !!(el && el.canPlayType('audio/ogg; codecs="opus"')); } catch (e) {}
  const lines = typeof VO_LINES !== 'undefined' ? VO_LINES : {};
  // a line's clip: [clip id (or, in another language, its address), seconds, start of each word (s), end of its speech (s)]
  const own = !!(window.I18n && I18n.voiced), mine = new Map();
  // the engine's split of a line into the words it reveals (toWords in js/game-engine.js)
  const toWords = (t) => t.replace(/(\d) (cm)\b/g, '$1 $2').replace(/ ([=+−]) /g, ' $1 ').split(/[ \t\n]+/).filter(Boolean);
  // say() reveals a line by its English words and the bubble shows the language's words at the same share of them
  // (shownWords in js/game-engine.js), so each English word gets the start of the last shown word it brings in: every
  // shown word comes as it is said, and none before
  const reveal = (line, t) => {
    const all = toWords(line).length, n = t ? t.length : 0;
    if (!all || !n) return null;
    const out = [];
    for (let r = 1; r <= all; r++) out.push(t[Math.min(n, Math.ceil((r * n) / all)) - 1]);
    return out;
  };
  const entry = (key) => {
    if (!own) return lines[key] || null;
    if (!mine.has(key)) {
      const c = I18n.voiceClip(I18n.keyOf(key));
      mine.set(key, c ? [c.url, c.seconds, reveal(key, c.times), c.end] : null);
    }
    return mine.get(key);
  };
  // any clip, for the first tap's muted unlock
  const anyClip = () => { for (const k of Object.keys(lines)) { const v = entry(k); if (v) return v[0]; } return null; };
  // absolute, so it resolves against the lesson's page even on the shell's <audio> (in the journey); a clip fetched ahead
  // (VO.want) plays from memory, so it starts at once - Safari does not preload an <audio> it was only asked to load
  const url = (id) => (id.indexOf('/') >= 0 ? id : new URL('assets/vo/' + id + '.ogg', location.href).href);
  const mem = {};
  const src = (id) => mem[id] || url(id);
  let tok = 0, played = false, unlocked = !!shared, unlocking = null; // unlocking: the muted unlock play() still settling
  // the quiet fetcher (VO.want): one reused element - a new Audio() per clip left players alive until garbage collection,
  // and past the browser's player limit it suspends them (the voice-over element then stalled without ever starting)
  const fetched = {}, queue = [];
  let loader = null, loading = false;
  function pump() {
    const id = queue.shift();
    loading = !!id;
    if (!id) return;
    // into memory (a blob the <audio> plays at once), where fetch works; from disk, an <audio> asked to load it
    if (typeof fetch === 'function' && location.protocol !== 'file:' && window.URL && URL.createObjectURL) {
      fetch(url(id)).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b && b.size) mem[id] = URL.createObjectURL(b); })
        .catch(() => {}).then(() => setTimeout(pump, 10));
      return;
    }
    if (!loader) { try { loader = new Audio(); loader.preload = 'auto'; loader.muted = true; } catch (e) { loading = false; return; } }
    let gone = false;
    const go = () => { if (gone) return; gone = true; clearTimeout(cap); loader.oncanplaythrough = loader.onerror = null; setTimeout(pump, 30); };
    const cap = setTimeout(go, 8000);
    loader.oncanplaythrough = go; loader.onerror = go;
    loader.src = url(id);
    try { loader.load(); } catch (e) { go(); }
  }

  const VO = {
    on: !!el && canOgg && q('vo') !== '0' && !!anyClip(),
    rate: Math.max(0.5, Math.min(4, parseFloat(q('speed')) || 1)),
    has(key) { return VO.on && !!entry(key); },
    seconds(key) { const v = entry(key); return v ? v[1] : 0; },
    // when each displayed word starts in the clip (s), measured from the audio by tools/vo_build.js
    times(key) { const v = entry(key); return v && v[2] ? v[2] : null; },
    // where the line's speech ends in its clip (s; 0 = unknown): the clip's last ~0.35 s of quiet is not waited for
    speechEnd(key) { const v = entry(key); return v && v[3] ? v[3] : 0; },
    // the first tap: play muted, then pause - tablets refuse audio until an element has played in a gesture
    unlock() {
      if (!VO.on || unlocked || played) return;
      unlocked = true;
      const t = tok, first = anyClip();
      try {
        el.muted = true; el.src = src(first);
        const p = el.play();
        const done = () => { unlocking = null; if (t === tok && !played) { try { el.pause(); } catch (e) {} } el.muted = false; };
        if (p && p.then) unlocking = p.then(done, done); else done();
      } catch (e) { el.muted = false; }
    },
    // plays a line's clip; returns false at once if there is none. cb: start() as the voice starts, end() as it ends,
    // fail() if it never started (missing file, play() refused) - the caller then speaks the line another way.
    play(key, cb) {
      if (!VO.has(key)) return false;
      VO.stop();
      const t = ++tok, live = () => t === tok;
      let started = false;
      played = true;
      el.muted = false;
      el.onplaying = () => { if (live() && !started) { started = true; if (cb.start) cb.start(); } };
      el.onended = () => { if (live()) { tok++; if (cb.end) cb.end(); } };
      el.onerror = () => { if (!live()) return; tok++; if (started) { if (cb.end) cb.end(); } else if (cb.fail) cb.fail(); };
      const go = () => {
        if (!live()) return;
        el.muted = false;
        try {
          // each clip opens with ~0.3 s of quiet: it starts 60 ms before its first word (as Fishing Frenzy trims its clips),
          // so Swiftee answers at once; the word timings follow the clip's own playhead, so they stay exact
          // (a seek once the clip's header has loaded, not a #t= fragment: Safari lands a fragment on the next 1 s Ogg
          // page and cut the line's first words)
          // (no seek: each clip opens with only ~0.3 s of quiet, and a seek to just before its first word cut that
          // word's start on Chrome - the clip plays from 0, so every first word is whole)
          const lead = 0;
          el.src = src(entry(key)[0]);
          el.playbackRate = VO.rate;
          // an interrupted play() (AbortError: a pause or a new load got in first) is retried once before giving up
          let retried = false;
          const tryPlay = () => {
            const p = el.play();
            if (p && p.catch) p.catch((e) => {
              VO.lastError = (e && e.name) + ': ' + (e && e.message);
              if (!live() || started) return;
              if (e && e.name === 'AbortError' && !retried) { retried = true; setTimeout(() => { if (live() && !started) tryPlay(); }, 60); return; }
              tok++; if (cb.fail) cb.fail();
            });
          };
          if (!lead) { tryPlay(); return; }
          const seek = () => {
            el.removeEventListener('loadedmetadata', seek);
            if (!live()) return;
            try { el.currentTime = lead; } catch (e) {}
            tryPlay();
          };
          if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek);
        } catch (e) { tok++; if (cb.fail) cb.fail(); }
      };
      // the first line usually arrives during the first tap's muted unlock: changing the element's source while that
      // play() is still pending cancelled this clip silently (screen 1 then fell back to the device voice), so wait for it
      if (unlocking) unlocking.then(go, go); else go();
      return true;
    },
    // where the clip is now (s), for the line's timers; -1 when nothing is playing (a held clip is still where it is)
    now() { return el && (!el.paused || held) ? el.currentTime : -1; },
    // the lesson's pause: the clip holds where it is, and goes on from there
    hold() { if (el && !el.paused) { held = true; try { el.pause(); } catch (e) {} } },
    unhold() { if (held && el) { held = false; try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } },
    stop() {
      tok++; held = false;
      if (!el) return;
      el.onplaying = el.onended = el.onerror = null;
      try { el.pause(); } catch (e) {}
    },
    // a screen's clips (and the next screen's) are fetched quietly as it opens, one at a time, so each is ready when its
    // line comes without the whole voice-over loading up front (as in Fishing Frenzy's lesson). keys: the lines' keys.
    want(keys) {
      if (!VO.on) return;
      (keys || []).forEach((k) => { const v = entry(k); if (v && !fetched[v[0]]) { fetched[v[0]] = 1; queue.push(v[0]); } });
      if (!loading) pump();
    }
  };
  window.VO = VO;
})();
