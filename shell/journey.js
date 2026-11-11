// =====================================================================
// FISHING FRENZY 2 - the journey (index.html at the root). Two parts, each a whole game in its own frame filling the
// window (parts/*/index.html; each loads shell/bridge.js first):
//   fishing  Popo's parallelogram nets (parts/fishing). Its live banner is the journey's front page: Popo on his raft,
//            the "Fishing Frenzy 2" logo and Play. It loads first and shows as soon as it can draw.
//   lesson   Swiftee's parallelogram lesson (parts/lesson): its seashell opens into the card, then its screens. It
//            loads, unseen, behind the banner once the game is ready.
// The journey, in three steps (announced as the parts 'intro', 'lesson' and 'fishing'):
//   1. intro: Play on the banner (inside the tap: Journey.play, which unlocks this page's sound). The game is told
//      `story` (args.lesson: the lesson follows the warm-up) and goes on as Play does: its story (the narrator, the
//      first school) and its warm-up net (a rectangle), played in full. Then the hook, as in Fishing Frenzy: a big fish
//      knocks the net out of square, Popo has never seen that shape, Swiftee swoops in with "Let's find out!" and Next;
//      on Next she flies off and the giant wave carries Popo away. With the lake empty, the game says so
//      (Journey.finish({ intro: true })).
//   2. lesson: its frame dissolves in over the empty lake and begins; it is see-through round its card, so it plays
//      over the game's own lake, as in Fishing Frenzy. The game is told `quiet` (its sound fades), then `backdrop`:
//      it goes on drawing its water and fish, silent, its buttons away, and the lesson's camera (`camera`) glides its
//      view down to the sand and dives after the card. (Still loading? A frosted veil says "Getting ready…".)
//   3. fishing: the lesson over (Journey.finish, once Swiftee has flown out of it), the game is told `resume` while
//      the lesson's frame dissolves out over it: the giant wave brings Popo back, Swiftee swoops in with her welcome,
//      and the eight parallelogram nets follow; then the lesson is disposed. After the eighth net, the end screen's
//      Play Again (Journey.finish): the game is told `title`, the banner again from its start, and a fresh lesson
//      loads behind it, ready to play again.
//
// Sound: browsers allow it only after a tap. The Play tap unlocks one AudioContext and one <audio> element in this
// page, and the lesson plays through them (bridge.js: audioContext, voiceElement), so it needs no tap of its own.
// The fishing game keeps its own context (its taps unlock it: its banner is the page the child taps first) and
// silences it on `hide`. One part is heard at a time.
//
// URL options: ?start=lesson - the first Play brings the lesson first (the game holds where its banner cleared away),
// then the wave brings Popo in and all eight nets follow; ?start=fishing - the first Play skips the lesson (all eight nets in a
// row). A part opened on its own comes here with ?start=<part> (bridge.js). ?dev=1 adds one panel that jumps to any
// screen of either part, and the front page; ?debug and ?dev pass on to the parts (window.popoDebug in the game,
// window.lessonDebug in the lesson). Every step is announced as a window event ('fishing-frenzy:part', ':finished',
// ':complete') and posted to a page that hosts the journey in a frame.
// =====================================================================
(function () {
  'use strict';

  // the journey's steps, in order (each announced with its number): the game's first net, the lesson, the rest of the game
  const STEPS = ['intro', 'lesson', 'fishing'];
  // the parts, in the journey's order (the dev panel's sections); their titles in the player's language (shell/i18n.js)
  const PARTS = [
    { id: 'lesson', src: 'parts/lesson/index.html', title: I18n.t('partLesson') },
    { id: 'fishing', src: 'parts/fishing/index.html', title: I18n.t('partFishing') },
  ];
  // times in ms
  const T = {
    playOut: 400,   // Play with ?start=lesson: the button bursts and the logo pops away before the lesson dissolves in
    dissolve: 450,  // one part's frame dissolving over the other (css .arriving, .leaving)
    stall: 45000,   // no word from a loading part for this long: Try again
    devReload: 1500, // ?dev=1: the lesson gone, a fresh one loads this long after, so its screens stay in the panel
  };
  const params = new URLSearchParams(location.search);
  const DEV = params.get('dev') === '1';
  const START = params.get('start');
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const partOf = (id) => PARTS.find((p) => p.id === id);

  // ---------- sound: unlocked once, by the Play tap, and shared by the lesson ----------
  // 60 ms of silence: playing it inside the tap unlocks the <audio> element for every clip after it
  const SILENT = 'data:audio/wav;base64,UklGRgQCAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YeABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';
  const audio = {
    ctx: null,
    outs: new Map(),
    el: (() => { try { const a = new Audio(); a.preload = 'auto'; return a; } catch (e) { return null; } })(),
    // inside a tap (Play, or a dev jump)
    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older WebKit */ }
      if (AC && !this.ctx) { try { this.ctx = new AC(); } catch (e) { this.ctx = null; } }
      if (this.ctx) {
        try { this.ctx.resume(); } catch (e) { /* resumes later */ }
        try {
          const src = this.ctx.createBufferSource();
          src.buffer = this.ctx.createBuffer(1, 1, 22050);
          src.connect(this.ctx.destination);
          src.start(0);
        } catch (e) { /* nothing to play */ }
      }
      const el = this.el;
      if (el && !this.elUnlocked && el.paused) { // (never over a voice clip that is playing)
        this.elUnlocked = true;
        try {
          el.src = SILENT;
          const p = el.play();
          // refused: the next tap tries again (an abort means a voice clip took over, so it is unlocked)
          if (p && p.then) p.then(() => { if (el.src === SILENT) el.pause(); }, (err) => { if (err && err.name === 'NotAllowedError') this.elUnlocked = false; });
        } catch (e) { this.elUnlocked = false; }
      }
      const s = window.speechSynthesis;
      if (s && !this.speechUnlocked && typeof SpeechSynthesisUtterance !== 'undefined') {
        this.speechUnlocked = true;
        try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u); } catch (e) { /* no voice */ }
      }
    },
    resume() { if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) { /* later */ } } },
    // what the parts ask for (bridge.js)
    context() { return this.ctx; },
    output(part) {
      if (!this.ctx) return null;
      let g = this.outs.get(part);
      if (!g) { g = this.ctx.createGain(); g.connect(this.ctx.destination); this.outs.set(part, g); }
      return g;
    },
    voiceElement() { return this.el; },
    speech() {
      return window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'
        ? { synth: window.speechSynthesis, Utterance: SpeechSynthesisUtterance } : null;
    },
    // a part's scene dissolves away: its sound fades with it
    fade(part, ms) {
      const g = this.outs.get(part);
      if (g) { try { g.gain.setTargetAtTime(0, this.ctx.currentTime, Math.max(0.05, ms / 3000)); } catch (e) { /* closed */ } }
    },
    // a part leaves: its sound fades out and is cut off; the lesson's voice stops
    release(part) {
      const g = this.outs.get(part);
      if (g) {
        this.outs.delete(part);
        try { g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); } catch (e) { /* closed */ }
        setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 600);
      }
      if (part === 'lesson') {
        const el = this.el;
        if (el) { try { el.pause(); } catch (e) { /* idle */ } el.onended = el.onerror = el.onplaying = null; }
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* no voice */ }
      }
    },
  };

  // ---------- the parts' frames ----------
  const frames = new Map(); // part id -> { id, el, status: loading | ready | failed, progress, waiters, going }
  function partUrl(p) {
    const u = new URL(p.src, location.href);
    u.searchParams.set('embed', '1');
    ['dev', 'debug'].forEach((k) => { if (params.has(k)) u.searchParams.set(k, params.get(k) || '1'); });
    ['lan', 'lang'].forEach((k) => { if (params.get(k)) u.searchParams.set(k, params.get(k)); }); // (the player's language: shell/i18n.js)
    return u.href;
  }
  // start loading a part (once): the game shows at once, the lesson behind it, unseen
  function load(id) {
    let f = frames.get(id);
    if (f && !f.going) return f;
    if (f) drop(f); // on its way out: a fresh frame takes its place at once, so nothing reuses a frame being torn down
    const p = partOf(id);
    const el = document.createElement('iframe');
    el.className = 'part';
    el.dataset.part = id; // (not a title: the browser shows it as a tooltip over the game)
    el.setAttribute('allow', 'autoplay; fullscreen');
    el.setAttribute('aria-label', p.title);
    f = { id, el, status: 'loading', progress: 0, waiters: [], heard: Date.now() };
    frames.set(id, f);
    if (id === 'fishing') el.classList.add('live'); // the front page: on screen as soon as it can draw
    else { el.setAttribute('aria-hidden', 'true'); el.tabIndex = -1; }
    el.src = partUrl(p);
    if (DEV) el.addEventListener('load', () => { try { el.contentWindow.addEventListener('keydown', devKey); } catch (e) { /* file:// */ } });
    $('parts').appendChild(el);
    f.watch = setInterval(() => { if (f.status === 'loading' && Date.now() - f.heard > T.stall) fail(f, 'no answer'); }, 2000);
    return f;
  }
  // fn(frame) once the part is ready (a retried part passes its new frame)
  function when(f, fn) { if (f.status === 'ready') fn(f); else f.waiters.push(fn); }
  function ready(f) {
    if (f.status === 'ready') return;
    f.status = 'ready'; f.progress = 1;
    clearInterval(f.watch);
    if (status.f === f) { status.hide(); veil.close(); } // (after Try again)
    f.waiters.splice(0).forEach((fn) => fn(f));
    // the game is up: the lesson loads behind it (not for ?start=fishing's first Play, unless the dev panel lists it)
    if (f.id === 'fishing' && !frames.has('lesson') && (START !== 'fishing' || DEV || J.runs > 0)) load('lesson');
    dev.update();
  }
  function fail(f, why) {
    if (f.status !== 'loading') return;
    f.status = 'failed'; f.why = why;
    clearInterval(f.watch);
    // the game is the front page: if it can't come, the veil says so (the lesson's failure shows only once it's waited for)
    if (f.id === 'fishing') { veil.open(); status.show(f); }
    status.update();
  }
  function retry(f) {
    const waiters = f.waiters.splice(0);
    drop(f);
    const g = load(f.id);
    g.waiters.push(...waiters);
    status.swap(f, g);
  }
  function drop(f) {
    clearInterval(f.watch);
    if (frames.get(f.id) === f) frames.delete(f.id);
    f.el.remove();
    dev.forget(f);
  }
  // the shell -> a part: begin, dispose or a command (direct where its page can be reached, else a message)
  function tell(f, type, opts) {
    if (!f) return;
    try {
      const PJ = f.el.contentWindow && f.el.contentWindow.Journey;
      if (PJ && PJ['_' + type]) { PJ['_' + type](opts); return; }
    } catch (e) { /* file://: messages only */ }
    try { f.el.contentWindow.postMessage({ journey: true, type, opts }, '*'); } catch (e) { /* gone */ }
  }
  const command = (f, name, args) => tell(f, 'command', { name, args });
  // a part -> the shell (bridge.js): ready, progress, failed, play, finish, devScreens
  function fromPart(id, type, detail, win) {
    const f = frames.get(id);
    if (!f || (win && win !== f.el.contentWindow)) return;
    f.heard = Date.now();
    try {
      if (type === 'ready') ready(f);
      else if (type === 'progress') { f.progress = Math.max(f.progress, Math.min(1, +detail || 0)); status.update(); }
      else if (type === 'failed') fail(f, detail);
      else if (type === 'play') play(f);
      else if (type === 'finish') finish(f, detail);
      else if (type === 'camera') { if (f.id === 'lesson' && !f.going && fishing()) command(fishing(), 'camera', detail); } // (a lesson on its way out no longer steers the view)
      else if (type === 'devScreens') dev.register(id, (detail || []).map((label, i) => ({ label, run: () => command(f, 'devJump', i) })), win); // (from disk: by message)
    } catch (err) { console.error(err); }
  }
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m && m.journey === true && m.part) fromPart(m.part, m.type, m.detail, e.source);
  });
  function focusFrame(f) {
    try { f.el.focus({ preventScroll: true }); f.el.contentWindow.focus(); } catch (e) { /* file:// */ }
  }

  // ---------- the journey ----------
  const J = {
    phase: 'front', // front (the banner) | intro (the story and the first net) | starting (the lesson on its way) |
    // lesson | fishing (the second net to the eighth; with ?start, all eight)
    current: 'fishing', // the part on top
    after: 'resume', // what the game is told when the lesson is over: resume (after its first net) or story (?start=lesson)
    seq: 0, // each move of the journey; a step still waiting is dropped once another move has been made
    runs: 0,
    results: {},
  };
  const fishing = () => frames.get('fishing');
  const lessonUp = () => J.current === 'lesson';
  function announce(kind, detail) {
    try { window.dispatchEvent(new CustomEvent('fishing-frenzy:' + kind, { detail })); } catch (e) { /* old browser */ }
    if (window.parent !== window) {
      try { window.parent.postMessage(Object.assign({ type: 'fishing-frenzy:' + kind }, detail), '*'); } catch (e) { /* gone */ }
    }
  }
  const partNumber = (id) => ({ part: id, number: STEPS.indexOf(id) + 1, of: STEPS.length });
  // the game under the lesson: nothing reaches it, and screen readers leave it
  function cover(f, on) {
    if (!f) return;
    f.el.classList.toggle('covered', on);
    if (on) { f.el.setAttribute('aria-hidden', 'true'); f.el.tabIndex = -1; } else { f.el.removeAttribute('aria-hidden'); f.el.tabIndex = 0; }
  }

  // on a phone or tablet, Play also goes full screen in landscape where the browser allows it
  function fullScreen() {
    const el = document.documentElement, request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!request || document.fullscreenElement || !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) return;
    try {
      Promise.resolve(request.call(el, { navigationUI: 'hide' }))
        .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
        .catch(() => { /* not allowed here: every part still fits the screen */ });
    } catch (e) { /* not allowed here */ }
  }

  // The banner's Play (inside its tap): the game goes on at once into its story and first net, the lesson to follow.
  // The first Play with ?start=fishing plays all eight nets in a row; with ?start=lesson the lesson comes first,
  // dissolving in over the game, which holds where its banner cleared away.
  async function play(f) {
    if (f !== fishing() || J.phase !== 'front') return;
    audio.unlock(); // (bridge.js has done it inside the tap where it could reach this page; from disk the lesson uses its own)
    fullScreen();
    J.runs += 1;
    if (J.runs > 1) J.results = {};
    const start = J.runs === 1 ? START : null;
    J.seq += 1;
    if (start !== 'lesson') { toFishing('story', { lesson: start !== 'fishing' }); return; }
    J.after = 'story';
    J.phase = 'starting';
    const seq = J.seq;
    await wait(reduced ? 0 : T.playOut);
    if (J.seq === seq) bringLesson();
  }
  // The lesson's turn: it dissolves in once it is ready (until then the frosted veil says "Getting ready…"), and opens
  // with its seashell.
  async function bringLesson() {
    const seq = ++J.seq;
    J.phase = 'starting';
    let L = load('lesson');
    if (L.status !== 'ready') {
      veil.open();
      status.show(L);
      L = await new Promise((r) => when(L, r));
      if (J.seq !== seq) return;
    }
    showLesson(L);
  }
  // The lesson's frame dissolves in over the game and the lesson begins. As in Fishing Frenzy, the lesson plays over the
  // game's own lake: its frame is see-through round its card, and the game goes on drawing under it, silent, its
  // buttons away (`backdrop`), its view moved by the lesson's camera (`camera`, from the lesson through bridge.js).
  // opts.jump: begun for a ?dev=1 jump, which then starts it at its screen.
  function showLesson(L, opts) {
    const F = fishing();
    const seq = J.seq;
    J.phase = 'lesson';
    J.current = 'lesson';
    status.hide();
    veil.close();
    audio.resume();
    L.el.classList.add('live', 'arriving');
    L.el.removeAttribute('aria-hidden');
    L.el.tabIndex = 0;
    cover(F, true);
    command(F, 'quiet'); // the game's sound fades as the lesson comes in (`backdrop` follows once it is in)
    tell(L, 'begin', opts || {});
    focusFrame(L);
    announce('part', partNumber('lesson'));
    dev.update();
    setTimeout(() => {
      L.el.classList.remove('arriving');
      if (J.seq === seq && lessonUp() && frames.get('lesson') === L) command(F, 'backdrop');
    }, reduced ? 200 : T.dissolve);
  }
  // The lesson's frame dissolves out (over whatever the game is doing now), and then goes.
  function hideLesson() {
    const L = frames.get('lesson');
    if (!L || L.going || !L.el.classList.contains('live')) return;
    L.going = true;
    L.el.classList.remove('live', 'arriving');
    L.el.classList.add('leaving');
    L.el.setAttribute('aria-hidden', 'true');
    L.el.tabIndex = -1;
    audio.fade('lesson', T.dissolve);
    setTimeout(() => dispose(L), reduced ? 350 : T.dissolve);
  }
  // a part is removed: told first, so it stops every sound and loop; then its frame goes
  function dispose(f) {
    f.going = true;
    tell(f, 'dispose');
    audio.release(f.id);
    setTimeout(() => {
      drop(f);
      if (DEV && f.id === 'lesson') setTimeout(() => { if (!frames.has('lesson')) load('lesson'); }, T.devReload);
    }, 80);
  }
  // the game on top again: `story` (after Play; args.lesson: the lesson follows its first net), `resume` (after the
  // lesson), `wake` (a dev jump) or `title` (the front page)
  function toFishing(name, args) {
    const F = fishing();
    J.phase = name === 'title' ? 'front' : name === 'story' && args && args.lesson ? 'intro' : 'fishing';
    J.current = 'fishing';
    cover(F, false);
    command(F, name, args);
    focusFrame(F);
    if (name === 'story' || name === 'resume') announce('part', partNumber(J.phase));
    dev.update();
  }
  function finish(f, detail) {
    detail = detail || {};
    if (f.id === 'lesson') {
      // the lesson is over: the game goes on under its frame (its second net, or with ?start=lesson its story) as the
      // frame dissolves away
      if (!lessonUp() || f !== frames.get('lesson') || f.going) return;
      J.seq += 1;
      J.results.lesson = detail;
      announce('finished', { part: 'lesson', detail });
      toFishing(J.after, { lesson: false, afterLesson: true });
      J.after = 'resume';
      hideLesson();
      return;
    }
    if (f !== fishing() || lessonUp() || J.phase === 'starting') return;
    // the warm-up is over and the wave has carried Popo off: the lesson comes in over the empty lake
    if (detail.intro) {
      J.results.intro = detail;
      announce('finished', { part: 'intro', detail });
      J.after = 'resume';
      bringLesson();
      return;
    }
    // the game's Play Again: the banner again, and a fresh lesson behind it for the next Play
    J.seq += 1;
    J.results.fishing = detail;
    announce('finished', { part: 'fishing', detail });
    announce('complete', { results: J.results });
    toFishing('title');
    load('lesson');
  }
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // Safari: no pinch zoom
  // Brave and Safari can suspend audio when the tab loses focus; a tap on the page brings it back
  ['pointerdown', 'touchend', 'keydown'].forEach((t) => document.addEventListener(t, () => audio.resume(), true));

  // ---------- "Getting ready…" on the veil (the lesson after Play; the game if it can't load) ----------
  const status = {
    f: null,
    show(f) { this.f = f; this.update(); },
    hide() { this.f = null; this.update(); },
    swap(from, to) { if (this.f === from) this.f = to; this.update(); },
    update() {
      const f = this.f, el = $('veil-status');
      el.hidden = !f;
      if (!f) return;
      const failed = f.status === 'failed';
      el.querySelector('.status-text').textContent = failed ? I18n.t('loadFailed') : I18n.t('gettingReady');
      const bar = el.querySelector('.bar');
      bar.hidden = failed;
      bar.classList.toggle('unknown', !(f.progress > 0));
      bar.style.setProperty('--p', f.progress);
      el.querySelector('.retry').hidden = !failed;
    },
  };
  document.querySelectorAll('.status .retry').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (status.f && status.f.status === 'failed') retry(status.f);
  }));
  const veil = {
    el: $('veil'),
    open() { this.el.classList.add('on'); },
    close() { this.el.classList.remove('on'); },
  };

  // ---------- ?dev=1: one panel that jumps to any screen of the journey ----------
  function devKey(e) {
    if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey && dev.el) dev.el.classList.toggle('folded');
  }
  const dev = {
    lists: new Map(), // part id -> { f, list: [{ label, run }] } (each part's own jumps, bridge.js devScreens)
    el: null,
    register(id, list, win) {
      const f = frames.get(id);
      if (!DEV || !f || (win && win !== f.el.contentWindow)) return;
      this.lists.set(id, { f, list: list || [] });
      this.renderPart(id);
    },
    forget(f) { const e = this.lists.get(f.id); if (e && e.f === f) { this.lists.delete(f.id); this.renderPart(f.id); } this.update(); },
    run(id, i) {
      const e = this.lists.get(id);
      if (e && e.list[i]) { try { e.list[i].run(); } catch (err) { console.error(err); } }
    },
    // a lesson screen (inside the tap, so sound is unlocked too): the lesson shows over the game if it isn't up (begun
    // for the jump: no opening), then the screen
    jumpLesson(i) {
      audio.unlock();
      const seq = ++J.seq;
      const L = load('lesson');
      when(L, (g) => {
        if (J.seq !== seq || frames.get('lesson') !== g) return;
        if (!lessonUp()) showLesson(g, { jump: true });
        setTimeout(() => this.run('lesson', i), 150);
      });
    },
    // a screen of the game: the lesson (if it's up) dissolves away and goes, the game wakes (drawing, without its
    // story), and then the screen
    jumpFishing(i) {
      audio.unlock();
      const seq = ++J.seq;
      when(fishing(), (g) => {
        if (J.seq !== seq || fishing() !== g) return;
        status.hide();
        veil.close();
        hideLesson();
        toFishing('wake');
        setTimeout(() => this.run('fishing', i), 120);
      });
    },
    // the banner again, from its start
    frontPage() {
      J.seq += 1;
      status.hide();
      veil.close();
      hideLesson();
      toFishing('title');
    },
    build() {
      if (!DEV) return;
      const css = document.createElement('style');
      css.textContent = `
.dev{position:fixed;left:8px;bottom:8px;z-index:90;max-width:min(620px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;
  padding:6px;border-radius:10px;background:rgba(10,20,40,.88);font:600 12px/1.2 system-ui,sans-serif;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.35)}
.dev.folded .dev-body{display:none}
.dev-tag{display:inline-block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top;padding:5px 8px;border-radius:6px;color:#ffd23f;cursor:pointer;background:none;border:0;font:inherit;font-weight:800}
.dev.folded{opacity:.55;transition:opacity .2s}.dev.folded:hover{opacity:1}
.dev-part{margin-top:6px}
.dev-part h3{margin:4px 2px;font:800 12px/1.2 system-ui,sans-serif;color:#9fd1f5;display:flex;gap:8px;align-items:center}
.dev-part h3 small{font-weight:600;color:#aab}
.dev-part.now h3{color:#ffd23f}
.dev-btns{display:flex;flex-wrap:wrap;gap:4px}
.dev button.j{font:inherit;padding:5px 7px;border:0;border-radius:6px;background:#2f4f7f;color:#fff;cursor:pointer;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.dev button.j:hover{background:#3f6aa8}
.dev button.j.home{background:#7a4f10}
`;
      document.head.appendChild(css);
      const el = this.el = document.createElement('div');
      el.className = 'dev folded';
      el.setAttribute('aria-label', 'Developer screen jumps');
      // its tab is a small DEV button, bottom left, folding the panel down to it
      el.innerHTML = '<button class="dev-tag" type="button" title="Screens (`)">DEV</button><div class="dev-body"></div>';
      this.tag = el.querySelector('.dev-tag');
      this.tag.addEventListener('click', (e) => { e.stopPropagation(); el.classList.toggle('folded'); });
      document.body.appendChild(el);
      document.addEventListener('keydown', devKey);
      this.render();
    },
    // the panel's skeleton once (Front page, then a section per part); each part's buttons on their own, as its
    // screens come in (so a part reloading never rebuilds the other's buttons under a tap)
    render() {
      const body = this.el.querySelector('.dev-body');
      const front = document.createElement('div');
      front.className = 'dev-part';
      front.innerHTML = '<div class="dev-btns"><button class="j home" type="button">Front page</button></div>';
      front.querySelector('button').addEventListener('click', () => { this.fold(); this.frontPage(); });
      body.appendChild(front);
      PARTS.forEach((p, index) => {
        const sec = document.createElement('div');
        sec.className = 'dev-part';
        sec.dataset.part = p.id;
        const h = document.createElement('h3');
        h.innerHTML = (index + 1) + ' · ' + p.title + ' <small></small>';
        sec.appendChild(h);
        const btns = document.createElement('div');
        btns.className = 'dev-btns';
        sec.appendChild(btns);
        body.appendChild(sec);
        this.renderPart(p.id);
      });
      this.update();
    },
    // a jump folds the panel away (it never covers the screen it went to)
    fold() { this.el.classList.add('folded'); },
    renderPart(id) {
      const btns = this.el && this.el.querySelector('.dev-part[data-part="' + id + '"] .dev-btns');
      if (!btns) return;
      const e = this.lists.get(id), list = e ? e.list : [];
      btns.innerHTML = '';
      if (!list.length) { btns.innerHTML = '<small style="color:#aab;padding:2px">loading…</small>'; return; }
      list.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'j'; b.textContent = s.label; b.title = s.label;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); this.fold(); if (id === 'lesson') this.jumpLesson(i); else this.jumpFishing(i); });
        btns.appendChild(b);
      });
    },
    update() {
      if (!this.el) return;
      this.el.querySelectorAll('.dev-part[data-part]').forEach((sec) => {
        const id = sec.dataset.part, f = frames.get(id);
        const now = J.current === id;
        sec.classList.toggle('now', now);
        sec.querySelector('small').textContent = !f ? '' : now ? (J.phase === 'front' ? 'front page' : 'playing') : f.status;
      });
    },
  };

  // what the parts reach (bridge.js), and what tests and a hosting page may read
  window.FishingFrenzy = {
    parts: PARTS.map((p) => p.id),
    audio,
    fromPart,
    devScreens: (id, list, win) => dev.register(id, list, win),
    get phase() { return J.phase; },
    get current() { return J.current; },
    get results() { return J.results; },
    frame: (id) => (frames.get(id) || {}).el || null,
    status: (id) => (frames.get(id) || {}).status || null,
  };

  // the game's banner first (the lesson follows once it is ready: ready()); with ?dev=1 both at once, so both lists
  // are in the panel from the start
  dev.build();
  load('fishing');
  if (DEV) load('lesson');
})();
