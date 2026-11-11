// =====================================================================
// GAME ENGINE — state, narration, geometry, interactions and rendering values.
// Loaded after js/vendor/dc-runtime.js (which provides DCLogic) and the data files.
// The markup in index.html binds to the values returned by renderVals().
// Inside the journey (shell/bridge.js, index.html at the root) the lesson plays after the fishing game's banner, in its
// own frame over the game: the journey's Play tap has unlocked the sound, so it begins straight away with its opening
// (the seashell and the card), and after its last line Swiftee swims off and the fishing begins. It has no Next, Back
// or screen list; ?dev=1 on the journey's page jumps to any screen. (Without a page - a headless test - no journey.)
// =====================================================================
const JOURNEY = typeof window !== 'undefined' && window.Journey && window.Journey.embedded ? window.Journey : null;
// the lesson's key words (reference KEY_WORDS, with the parallelogram's own terms)
// cards that arrive together come in this far apart (ms; css .chip.cd1-.cd3 delays match)
const CHIP_GAP = 480;
const KEY_WORDS = /^(polygon|quadrilaterals?|trapeziums?|parallelograms?|parallel|bases?|legs?|sides?|opposite|adjacent|angles?|supplementary|vertex|vertices|equal|diagonals?|bisect|segments?|180°)$/;
window.TrapeziumGame = class TrapeziumGame extends DCLogic {
  constructor(props) {
    super(props);
    this.T = new Set(); this.TR = new Map(); this.tmKey = 0;
    this.stepTok = 0;
    this.narrTok = 0;
    this.snaps = {};
    this.drag = null;
    this.state = this.fresh(false);
  }

  // ---------- data ----------
  get S() { return CONFIG.pxPerCm; }
  initP() {
    const S = this.S, c = CONFIG.start, H = c.height, yb = c.baseY, yt = yb - H;
    const ax = c.D + Math.sqrt((c.legAD * S) * (c.legAD * S) - H * H);
    const bx = c.C - Math.sqrt((c.legBC * S) * (c.legBC * S) - H * H);
    return { A: { x: ax, y: yt }, B: { x: bx, y: yt }, C: { x: c.C, y: yb }, D: { x: c.D, y: yb } };
  }
  fresh(started) {
    return {
      started: started, step: 0, P: this.initP(),
      line: '', reveal: 0, talking: false, bub: 'bubA',
      muted: this.state ? this.state.muted : false, done: true,
      opened: !!(this.state && this.state.opened), opening: !!(this.state && this.state.opening), // the card (js/opening.js)
      tap: {}, ang: {}, diag: {}, chips: [], marked: {}, wrongs: 0,
      moved: false, dragging: null, picks: {}, cfuFirst: true, results: {},
      hand: null, bubOff: false, glow: null, emph: {}
    };
  }
  steps() { return LESSON.steps; }
  // the screen's display flags; okF adds more once its question is answered (e.g. the parallel arrows)
  fl() { const st = this.cur(), s = this.state; return Object.assign({}, st.f || {}, s && s.done && st.okF ? st.okF : {}); }
  // the shape on the board: a checkpoint draws its own figure, every other screen the learner's shape
  shapeP() { const st = this.cur(); return st.fig ? st.fig.P : this.state.P; }
  // a question, task or check that waits for the learner
  asks(st) { return !!(st.task || st.opts || st.fill); }
  // while Swiftee gives a screen's instructions nothing can be answered, tapped or dragged yet
  busy() { return !!this.state.listen; }
  // the question has been asked: the answers rise in, and the hand's wait starts
  askedNow() { if (this.state.listen) this.setState({ listen: false, figIn: null }, () => this.armHand()); } // (and every label of its figure is up)
  // a word's label on a checkpoint's figure: a side ('AB'), an angle ('A'), a half of a diagonal ('OA')
  figKey(w) {
    const t = String(w || '').split('\u00a0')[0].replace(/[^A-Za-z∠]/g, ''), a = /^∠([A-D])$/.exec(t);
    if (a) return a[1];
    if (/^(O[A-D]|[A-D]O)$/.test(t)) return 'O' + t.replace('O', '');
    return { AB: 'AB', BA: 'AB', BC: 'BC', CB: 'BC', CD: 'CD', DC: 'CD', DA: 'DA', AD: 'DA' }[t] || null;
  }
  // the labels a checkpoint's question names (they wait for their words); the others are up from the start
  figNamed(st) {
    if (st._named) return st._named;
    const fig = st.fig || {}, have = {}, out = {};
    Object.keys(fig.sides || {}).forEach((k) => { have[k] = 1; }); Object.keys(fig.angles || {}).forEach((k) => { have[k] = 1; });
    Object.keys(fig.halves || {}).forEach((k) => { have['O' + k] = 1; }); this.askedHalves(st).forEach((k) => { have['O' + k] = 1; });
    const L = (st.lines || []).filter((x) => !x.keep && x.t).pop();
    if (L) this.toWords(L.t).forEach((w) => { const k = this.figKey(w); if (k && have[k]) out[k] = 1; });
    return (st._named = out);
  }
  // the free-fill state of a fill / match check
  freshFill() { return { at: {}, locked: {}, sel: null, drag: null, checking: false, bad: {}, open: null, closing: false, menu: null }; }
  cur() { return this.steps()[this.state.step]; }

  // ---------- timers ----------
  // (a timer is a key, not the browser's id: a pause holds every timer with the time it has left, and Resume re-arms it)
  tm(fn, ms) {
    const key = ++this.tmKey, wait = Math.max(0, ms || 0), rec = { due: Date.now() + wait, id: 0, left: null };
    rec.arm = (w) => { rec.id = setTimeout(() => { this.T.delete(key); this.TR.delete(key); fn(); }, w); };
    this.T.add(key); this.TR.set(key, rec);
    if (this.paused) rec.left = wait; else rec.arm(wait);
    return key;
  }
  untm(key) { const r = this.TR.get(key); if (r) clearTimeout(r.id); this.TR.delete(key); this.T.delete(key); }
  clearT() { this.TR.forEach((r) => clearTimeout(r.id)); this.TR.clear(); this.T.clear(); }
  pauseT() { const now = Date.now(); this.TR.forEach((r) => { if (r.left == null) { clearTimeout(r.id); r.left = Math.max(0, r.due - now); } }); }
  resumeT() { const now = Date.now(); this.TR.forEach((r) => { if (r.left != null) { const w = r.left; r.left = null; r.due = now + w; r.arm(w); } }); }
  // ---------- pause (the button at the top right; Escape; a hidden tab) ----------
  // everything holds where it is - the voice, the timers, the motion (GSAP, css animations, the walkers) - and the
  // card says so; Resume goes on from there
  pauseLesson() {
    if (this.paused || !this.state.started || this.handedOff) return;
    this.paused = true; window.__lessonPaused = true;
    this.pauseT();
    if (window.VO && VO.hold) VO.hold();
    const sy = this.synth(); if (sy) { try { sy.pause(); } catch (e) {} }
    if (window.gsap) gsap.globalTimeline.pause();
    document.documentElement.classList.add('lesson-paused');
    this.pauseUi();
  }
  resumeLesson() {
    if (!this.paused) return;
    this.paused = false; window.__lessonPaused = false;
    document.documentElement.classList.remove('lesson-paused');
    if (window.gsap) gsap.globalTimeline.resume();
    const sy = this.synth(); if (sy) { try { sy.resume(); } catch (e) {} }
    if (window.VO && VO.unhold) VO.unhold();
    this.resumeT();
    this.pauseUi();
  }
  buildPause() {
    if (typeof document === 'undefined' || document.getElementById('lesson-pause')) return;
    const b = document.createElement('button');
    b.id = 'lesson-pause'; b.className = 'lesson-pause'; b.type = 'button'; b.setAttribute('aria-label', I18n.t('ariaPause'));
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
    const o = document.createElement('div');
    o.id = 'lesson-paused'; o.className = 'lesson-paused-card'; o.hidden = true; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', I18n.t('ariaPaused'));
    o.innerHTML = '<div class="lp-card"><span class="lp-kicker"></span><h2></h2><p></p><button type="button" class="lp-resume"></button></div>';
    // (its words in the player's language, as text)
    [['.lp-kicker', 'pauseKicker'], ['h2', 'lessonPauseTitle'], ['p', 'lessonPauseText'], ['.lp-resume', 'btnResume']].forEach(([sel, key]) => { o.querySelector(sel).textContent = I18n.t(key); });
    b.addEventListener('click', (e) => { e.stopPropagation(); this.sfx('tap'); this.pauseLesson(); });
    o.querySelector('.lp-resume').addEventListener('click', (e) => { e.stopPropagation(); this.sfx('tap'); this.resumeLesson(); });
    document.body.appendChild(b); document.body.appendChild(o);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !(this.state.fill && this.state.fill.open)) { if (this.paused) this.resumeLesson(); else this.pauseLesson(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseLesson(); });
    this.pauseUi();
  }
  pauseUi() {
    if (typeof document === 'undefined') return;
    const b = document.getElementById('lesson-pause'), o = document.getElementById('lesson-paused');
    if (b) b.classList.toggle('on', !!(this.state.started && !this.handedOff && !this.paused));
    if (o) o.hidden = !this.paused;
  }
  componentDidMount() {
    this.warmFonts();
    this.buildPause();
    // Escape closes an open answer menu
    if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.state.fill && this.state.fill.open) this.ddClose(); });
    // the shape palette as CSS variables for css/game.css (--pg-sideA, --pg-fill, --pg-hl ...)
    const pal = CONFIG.palette || {};
    Object.keys(pal).forEach((k) => document.documentElement.style.setProperty('--pg-' + k, pal[k]));
    const C = CONFIG.swiftee;
    if (window.SwifteeMascot) {
      this.sw = new window.SwifteeMascot({ base: C.base, idle: C.idle, minHoldMs: C.minHoldMs, find: () => document.querySelector('.swiftee') });
      // every expression the lesson can ask for, so reactions never wait on the network
      const want = ['measuring', C.talk, C.waiting, C.praise, C.correct, C.wrong, C.done];
      LESSON.steps.forEach((st) => (st.lines || []).concat(st.after || []).forEach((L) => { if (L.m) want.push(L.m); }));
      this.sw.warm(want.filter((x, i) => want.indexOf(x) === i));
    }
    // on its own page the lesson waits on the lake for its Next tap: browsers only allow sound after a tap, so starting
    // on load played screen 1 silently and it moved on before the learner had touched anything. Its first clips load
    // meanwhile.
    this.wantVoice(0);
    if (JOURNEY) {
      if (JOURNEY.params.has('debug') || JOURNEY.params.get('dev') === '1') window.lessonDebug = this; // for tests (as the fishing game's popoDebug), and the journey's Back / Next
      JOURNEY.onCommand((name, args) => {
      });
      if (JOURNEY.params.get('dev') === '1') JOURNEY.devScreens(this.steps().map((x, i) => ({ label: (i + 1) + ' ' + this.screenName(x), run: () => this.jumpTo(i), end: !!x.end })).filter((x) => !x.end)); // (no end screen in the journey: the recap's Next hands over)
      // the journey's Play has been tapped by the time the shell begins the lesson; begun for a ?dev=1 jump
      // (opts.jump), it leaves the opening out and the jump starts it
      JOURNEY.onBegin((opts) => { if (!(opts && opts.jump)) this.begin(); });
      JOURNEY.onDispose(() => this.leave());
      // ready once the page's pictures are in (the lake, the card, Swiftee)
      const ready = () => JOURNEY.ready();
      if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready, { once: true });
    } else if (new URLSearchParams(location.search).has('debug')) window.lessonDebug = this;
  }
  // the journey moves on: every voice, sound, timer and loop of the lesson stops for good
  leave() {
    this.stepTok++; this.narrTok++;
    this.clearT();
    this.cancelSpeech();
    if (this.wk) this.wk.hide();
    if (this.aw) this.aw.cancel();
    if (this.sw) this.sw.destroy();
    if (window.Motion) Motion.clear();
  }
  // a screen's name for the dev panel: checkpoints by their title, the rest by their opening line
  screenName(x) {
    if (x.end) return 'Lesson complete';
    if (x.cpTitle) return x.cpTitle.replace(/^Checkpoint (\d) · /, 'Check $1: ');
    const L = (x.lines || [])[0];
    return L && L.t ? L.t.replace(/\n/g, ' ') : x.id;
  }
  // after the lesson's last line: Swiftee swims off to the right, and the journey goes on to the fishing
  handOff() {
    if (!JOURNEY || this.handedOff) return;
    this.handedOff = true; this.pauseUi();
    this.depart();
    const results = Object.assign({}, this.state.results), finish = () => JOURNEY.finish({ results: results });
    if (!window.Opening || !Opening.open) { setTimeout(finish, Motion.reduced ? 0 : 1150); return; }
    // as in Fishing Frenzy: once Swiftee has flown out, the card's content fades and the card shrinks into its bubble,
    // which floats up and pops, as the camera rises back to the lake's surface; then the journey dissolves back into
    // the game, on the same view, and the giant wave brings Popo in
    // (only once she is clean out of sight - her flight ends 1.19 s in - and she is hidden for good, so she never shows
    // over the bubble as the card shrinks into it)
    setTimeout(() => {
      const card = document.querySelector('.stage'), sw = card && card.querySelector('.swiftee');
      if (sw) sw.style.visibility = 'hidden';
      if (card && window.gsap) gsap.to(card, { opacity: 0, duration: Motion.reduced ? 0 : 0.35, ease: 'sine.out' });
      Opening.close((k) => this.sfx(k), finish);
    }, Motion.reduced ? 0 : 1350);
  }
  // she crouches, then takes off out of the right of the card, rising as she goes
  depart() {
    const sw = typeof document !== 'undefined' && document.querySelector('.stage .swiftee'), G = window.gsap;
    this.setState({ bubOff: true });
    if (!sw || !G || Motion.reduced) return;
    this.pose('excited');
    this.sfx('whoosh');
    G.timeline()
      .to(sw, { y: 14, scaleY: 0.92, duration: 0.14, ease: 'sine.out', transformOrigin: '50% 90%' }, 0)
      .to(sw, { x: 1320, duration: 1.05, ease: 'power2.in' }, 0.14)
      .to(sw, { y: -360, scaleY: 1, duration: 1.05, ease: 'sine.out' }, 0.14)
      .to(sw, { rotation: 16, duration: 1.05, ease: 'power1.in' }, 0.14);
  }
  // the lines a screen may say (its lines, feedback and tips) by their voice-over keys, so its clips are fetched as it
  // opens, with the next screen's (VO.want)
  voiceKeys(st) {
    if (!st) return [];
    const plain = (t) => t.replace(/\s*\n\s*/g, ' ').trim(), out = [];
    (st.lines || []).concat(st.after || [], st.answerAfter || [], st.showAnswer ? [st.showAnswer] : []).forEach((L) => { const k = L.keep ? L.s : L.t; if (k) out.push(plain(k)); });
    [st.wrong, st.ok].concat((st.opts || []).map((o) => o.fb), st.fill && st.fill.fb ? Object.values(st.fill.fb) : [])
      .forEach((t) => { if (t) out.push(plain(t)); });
    if (st.task === 'dragB') out.push(I18n.plain('lsTipDragRight'), I18n.plain('lsTipDragBack'));
    if (st.summary && window.Summary) Summary.lines().forEach((t) => out.push(plain(t))); // the summary's ideas
    return out;
  }
  wantVoice(i) { if (window.VO) { const S = this.steps(); VO.want(this.voiceKeys(S[i]).concat(this.voiceKeys(S[i + 1]))); } }
  componentWillUnmount() { this.clearT(); this.cancelSpeech(); if (this.sw) this.sw.destroy(); }
  componentDidUpdate() {
    this.markSounds();
    this.fitBubble();
  }

  // sounds for marks that appear with the board: parallel chevrons / equal ticks (a tick as they pop on) and angle arcs
  // (a soft pluck as each draws in, staggered like the arcs' own CSS delays .d0-.d3)
  markSounds() {
    const st = this.cur(), s = this.state;
    if (!s.started || !st || st.grid || st.end) { this.marks = null; return; }
    const f = st.fig ? { arcs: Object.keys(st.fig.angles || {}).join(''), ticks: st.fig.ticks || st.fig.hticks } : this.fl();
    const pg = this.isPg(this.shapeP());
    // the sides showing parallel arrows (one a cue traces on shows from its cue): each side's tick as its arrows pop on,
    // 0.12 s after they show (css .par-ch)
    const due = this.markCues(st), par2 = !!(f.par2 || (st.task === 'dragB' && pg));
    const arrows = ['AB', 'CD', 'DA', 'BC'].filter((k) => (k === 'AB' || k === 'CD' ? !!f.par : par2) && (!due[k] || !!(s.marked && s.marked[k]))).join(' ');
    const m = { step: s.step, arrows: arrows, ticks: !!(f.ticks || f.hticks), arcs: (f.arcs || '').length };
    const p = this.marks;
    this.marks = m;
    if (!p) return;
    if (m.arrows.split(' ').some((k) => k && p.arrows.indexOf(k) < 0)) this.sfx('tick', { v: 0.9, delay: Motion.reduced ? 0 : 0.12 });
    if (m.ticks && !p.ticks) this.sfx('tick', { v: 0.9 });
    if (m.arcs > p.arcs) { // arcs that stay on screen from one screen to the next do not draw in again
      const N = window.Sfx ? Sfx.notes : [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < Math.min(4, m.arcs); i++) this.sfx('pluck', { f: N[i], v: 0.7, delay: 0.15 * i });
    }
  }
  // the sides whose parallel arrows a word cue traces on (a cue's mark: [...]) anywhere on screen st: until that cue
  // they wait, then come in with the side's light
  markCues(st) {
    const out = {}, scan = (cs) => (cs || []).forEach((c) => (c.mark || []).forEach((k) => { out[k] = 1; }));
    (st.lines || []).concat(st.after || [], st.answerAfter || [], st.showAnswer ? [st.showAnswer] : []).forEach((L) => scan(L.cues));
    scan(st.okCues); (st.opts || []).forEach((o) => scan(o.fbCues));
    return out;
  }
  // the shape a screen leaves behind once its task is done (for jumping straight to a later screen)
  taskResult(st, P) {
    P = this.clone(P);
    if (st.task === 'dragB') P.B.x = P.C.x + (P.A.x - P.D.x); // B dragged until BC is parallel to AD
    return P;
  }
  // ?dev=1: straight to screen i (a jump skips the opening)
  jumpTo(i) {
    if (!this.state.started) { this.openNow(); this.start(); if (i === 0) return; }
    if (i === this.state.step) return;
    let P = this.initP();
    this.snaps = {};
    for (let j = 0; j < i; j++) { this.snaps[j] = this.clone(P); P = this.taskResult(this.steps()[j], P); }
    this.setState({ P: P });
    this.sfx('tap');
    this.navAt = 0;
    this.goTo(i, true);
  }

  // Shrink-wraps the speech bubble to its widest line. Wrapped text otherwise leaves the box at its max width
  // even when every line is shorter. Measures in layout px (offsetLeft/offsetWidth ignore the stage scale);
  // hidden words still take their place, so the size is final from the first word of a line.
  warmFonts(again) {
    if ((this._fontsWarm && !again) || typeof document === 'undefined' || !document.fonts || !document.fonts.load) return;
    // (the font stylesheets come without holding the page up - index.html: one still on its way warms them again as
    // it comes, its fonts declared by then)
    if (!this._fontsWarm) document.querySelectorAll('link[href*="fonts.googleapis"]').forEach((l) => { if (l.media === 'print') l.addEventListener('load', () => this.warmFonts(true), { once: true }); });
    this._fontsWarm = true;
    ['500 21px Fredoka', '600 21px Fredoka', '700 21px Fredoka', '700 26px "Baloo 2"', '800 26px "Baloo 2"', '600 20px Nunito', '700 20px Nunito', '800 20px Nunito', '900 20px Nunito']
      .forEach((f) => document.fonts.load(f).catch(() => {}));
    document.fonts.load('600 20px "Noto Sans Math"', '\u2225\u2220').catch(() => {}); // ∥ and ∠
  }
  // A solved checkpoint shows its finished figure: each '?' on the shape becomes the right value ('? cm' -> '7 cm',
  // '?' at an angle -> '115°'), taken from the answer box with the same name or from the right answer button.
  textW(text, font) {
    let m = this._measure;
    if (m === undefined) { try { m = document.createElement('canvas').getContext('2d') || null; } catch (e) { m = null; } this._measure = m; }
    if (!m) return text.length * (parseFloat(font.split(' ')[1]) || 22) * 0.56;
    m.font = font + ', system-ui, sans-serif'; return m.measureText(text).width;
  }
  // a checkpoint's unknown (a "?" on its figure) shows its value once that value has landed there (flyAnswer)
  figVal(st, key, raw) {
    if (!raw || raw.indexOf('?') < 0 || !(this.state.landed || {})[key]) return raw;
    return this.figAns(st, key, raw);
  }
  // the value an unknown takes: its answer box's (by the figure's key, or its side named the other way round), or the
  // right answer button's
  figAns(st, key, raw) {
    const flip = { DA: 'AD', AD: 'DA', BC: 'CB', CD: 'DC' };
    const b = st.fill && (st.fill.blanks || []).find((x) => x.id === key || x.id === flip[key]);
    let v = b ? b.ans : null, unit = b ? (b.post || '').trim() : '';
    if (v == null && st.opts) {
      const o = st.opts.find((x) => x.ok), m = o && String(o.t).match(/^([\d.]+)\s*(.*)$/);
      if (m) { v = m[1]; unit = m[2]; }
    }
    if (v == null) return raw;
    if (raw.trim() === '?') return v + (unit === '°' ? '°' : unit ? ' ' + unit : '');
    return raw.replace('?', v);
  }
  // the halves a checkpoint asks for (a "?" until found): its answer boxes named OC / OD, or (one answer button) the
  // half opposite the given one through O
  askedHalves(st) {
    const fig = st.fig || {}, out = [], opp = { A: 'C', C: 'A', B: 'D', D: 'B' };
    if (!fig.halves) return out;
    ((st.fill && st.fill.blanks) || []).forEach((b) => { if (/^O[A-D]$/.test(b.id) && !fig.halves[b.id[1]]) out.push(b.id[1]); });
    if (!out.length && st.opts) Object.keys(fig.halves).forEach((k) => { if (!fig.halves[opp[k]]) out.push(opp[k]); });
    return out;
  }
  // the figure's unknowns, by the key their value lands under: a side ('CD'), an angle ('C'), a half ('OC')
  figUnknowns(st) {
    const fig = st.fig || {}, q = (o) => Object.keys(o || {}).filter((k) => String(o[k]).indexOf('?') >= 0);
    return q(fig.sides).concat(q(fig.angles), this.askedHalves(st).map((k) => 'O' + k));
  }
  // a right answer's value jumps from where it was given (its box, or its button) to its "?" on the figure, which takes
  // it as it lands (a soft pop); without motion it is there at once
  flyAnswer(keys, fromEl) {
    const st = this.cur(), tok = this.stepTok, raw = (k) => (st.fig.sides || {})[k] || (st.fig.angles || {})[k] || '?';
    const land = (k) => { if (tok !== this.stepTok) return; this.setState({ landed: Object.assign({}, this.state.landed, { [k]: 1 }) }); this.sfx('pop'); };
    const sr = typeof document !== 'undefined' && document.querySelector('.stage'), r = fromEl && fromEl.getBoundingClientRect();
    const box = sr && sr.getBoundingClientRect(), z = box ? box.width / 1280 || 1 : 1;
    const from = r && box ? { x: (r.left - box.left + r.width / 2) / z, y: (r.top - box.top + r.height / 2) / z } : null;
    keys.forEach((k, i) => {
      const at = this.figPos && this.figPos[k] && this.boardToStage(this.figPos[k]);
      const text = /^O[A-D]$/.test(k) ? this.figAns(st, k, '?') : this.figAns(st, k, raw(k));
      if (!window.Motion || !from || !at) { land(k); return; }
      this.tm(() => { if (tok === this.stepTok) Motion.flyValue(text, from, at, () => land(k)); }, i * 260);
    });
    this.busyFor && this.busyFor(keys.length * 260 + 1100);
  }
  // the half-diagonals a solved checkpoint found: from answer boxes named OC / OD, or (one answer button) the half
  // opposite the given one through O
  figHalves(st) {
    const out = {}, landed = this.state.landed || {};
    this.askedHalves(st).forEach((k) => { if (landed['O' + k]) out[k] = this.figAns(st, 'O' + k, '?'); });
    return out;
  }
  fitBubble() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('.bubble'), txt = box && box.querySelector('.bubble-text');
    if (!txt) return;
    const key = (this.state.line || '') + '|' + txt.style.fontSize;
    if (key === this.fitKey) return;
    this.fitKey = key;
    box.style.width = '';
    if (!box.offsetWidth) { this.fitKey = null; return; } // hidden right now: fit when it shows
    const rows = {};
    txt.querySelectorAll('.w:not(.brk)').forEach((w) => {
      const r = rows[w.offsetTop] || (rows[w.offsetTop] = { l: Infinity, r: -Infinity });
      r.l = Math.min(r.l, w.offsetLeft); r.r = Math.max(r.r, w.offsetLeft + w.offsetWidth);
    });
    const widest = Math.max(0, ...Object.keys(rows).map((k) => rows[k].r - rows[k].l));
    if (!widest) return;
    const cs = getComputedStyle(box);
    const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    box.style.width = Math.ceil(widest + chrome + 3) + 'px';
    // a web font that finishes loading later is wider: fit again then
    if (!this.fontHook && document.fonts && document.fonts.addEventListener) {
      this.fontHook = true;
      document.fonts.addEventListener('loadingdone', () => { this.fitKey = null; this.fitBubble(); this.setState({ fontsAt: Date.now() }); }); // the answer row re-measures in the loaded font
      if (document.fonts.ready) document.fonts.ready.then(() => { this.fitKey = null; this.fitBubble(); });
    }
  }

  // ---------- Swiftee ----------
  pose(state) { if (this.sw) this.sw.play(state); }
  // what Swiftee does when nobody is talking
  restPose() {
    const C = CONFIG.swiftee, st = this.cur();
    if (this.state.measuring) return 'measuring'; // the tape-measure walk
    if (st.end) return C.done;
    if (st.cp && !this.state.done) return C.waiting;
    return C.idle;
  }
  // a short reaction that settles back on its own unless a line takes over
  react(state, ms) {
    this.pose(state);
    const tok = this.narrTok;
    this.tm(() => { if (tok === this.narrTok && !this.state.talking) this.pose(this.restPose()); }, ms || 1800);
  }

  // ---------- audio ----------
  synth() { try { return (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null; } catch (e) { return null; } }
  cancelSpeech() { if (window.VO) VO.stop(); const s = this.synth(); if (s) { try { s.cancel(); } catch (e) {} } }
  pickVoice() {
    const s = this.synth(); if (!s) return;
    let vs = [];
    try { vs = s.getVoices() || []; } catch (e) { vs = []; }
    const en = vs.filter((v) => /^en/i.test(v.lang));
    // Indian-English voices first (Neerja / Heera / Google en-IN), then other clear female English voices
    const pref = [/Neerja/i, /Heera/i, /Google .*Hindi|en-IN.*Google|Google.*India/i, /en-IN/i, /Google UK English Female/i, /Samantha/i, /Aria/i, /Jenny/i, /Female/i, /en-GB/i, /en-US/i];
    let pick = null;
    for (const re of pref) { pick = en.find((v) => re.test(v.name) || re.test(v.lang)); if (pick) break; }
    this.voice = pick || en[0] || null;
  }
  speechOf(t) {
    return t
      .replace(/\s*\n\s*/g, ' ') // bubble line breaks are layout only
      .replace(/∠\s?([A-D])/g, 'angle $1')
      .replace(/∥/g, ' is parallel to ')
      .replace(/\b(AB|BC|CD|AD|DC|AC|BD|OA|OB|OC|OD|AO|BO|CO|DO)\b/g, (m) => m.split('').join(' '))
      .replace(/&/g, ' and ')
      .replace(/(\d+)\s?cm\b/g, '$1 centimetres')
      .replace(/°/g, ' degrees')
      .replace(/−/g, ' minus ')
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ')
      .replace(/…/g, ', ');
  }
  // recorded effects (CONFIG.sounds): decoded once into the audio context so they start the instant they are
  // called (in step with the confetti); an <audio> element covers pages opened from disk, where fetch is blocked
  loadSounds() {
    if (this.sndBuf) return;
    this.sndBuf = {}; this.sndEl = {};
    Object.keys(CONFIG.sounds || {}).forEach((k) => {
      const src = CONFIG.sounds[k];
      try { const a = new Audio(src); a.preload = 'auto'; this.sndEl[k] = a; } catch (e) {}
      if (!this.actx || typeof fetch === 'undefined') return;
      fetch(src).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => { const p = this.actx.decodeAudioData(b, ok, no); if (p && p.catch) p.catch(no); })) // (Safari also rejects the promise it returns)
        .then((buf) => { this.sndBuf[k] = buf; }).catch(() => {});
    });
  }
  playSound(kind) {
    try {
      const buf = this.sndBuf && this.sndBuf[kind];
      if (buf && this.actx) {
        const src = this.actx.createBufferSource(), g = this.actx.createGain();
        g.gain.value = CONFIG.soundVolume;
        src.buffer = buf; src.connect(g); g.connect(this.actx.destination); src.start();
        return true;
      }
      const el = this.sndEl && this.sndEl[kind];
      if (el) { const a = el.cloneNode(); a.volume = CONFIG.soundVolume; const p = a.play(); if (p && p.catch) p.catch(() => {}); return true; }
    } catch (e) {}
    return false;
  }
  // Which parts of the shape a line names, and at which word: [{ i, parts }]. Parts: 'aA'..'aD' angles,
  // 'AB' 'BC' 'CD' 'DA' sides, 'vA'..'vD' vertices. Only capitals count, so the article "A" is never a vertex.
  partCues(words) {
    const clean = (w) => (w || '').split('\u00a0')[0].replace(/[^A-Za-z∠]/g, ''); // ("AB = 7 cm" is one shown word: its part is AB)
    const side = (p, q) => ({ AB: 'AB', BA: 'AB', BC: 'BC', CB: 'BC', CD: 'CD', DC: 'CD', DA: 'DA', AD: 'DA' })[p + q];
    const diag = (p, q) => ({ AC: 'dAC', CA: 'dAC', BD: 'dBD', DB: 'dBD' })[p + q];
    const half = (p, q) => ((p === 'O' || q === 'O') && /^[A-D]$/.test(p === 'O' ? q : p) ? 'h' + (p === 'O' ? q : p) : null);
    const one = (w) => /^[A-D]$/.test(w);
    const f = (this.cur() || {}).f || {}, SIDES = ['AB', 'BC', 'CD', 'DA'], HALVES = ['hA', 'hB', 'hC', 'hD'];
    const cues = [];
    words.forEach((raw, i) => {
      const w = clean(raw), prev = clean(words[i - 1]).toLowerCase(), next = clean(words[i + 1]);
      let parts = null, m, dirs = null;
      if ((m = /^∠([A-D])$/.exec(w))) parts = ['a' + m[1]];
      else if (/^[A-D]{2}$/.test(w) && side(w[0], w[1])) parts = [side(w[0], w[1])];
      else if (/^[A-D]{2}$/.test(w) && diag(w[0], w[1])) parts = [diag(w[0], w[1])];
      else if (/^[A-DO]{2}$/.test(w) && half(w[0], w[1])) { parts = [half(w[0], w[1])]; dirs = { [parts[0]]: [w[0], w[1]] }; } // ("AO": A to O)
      else if ((one(w) || w === 'O') && /^(vertex|point|corner)$/.test(prev)) parts = ['v' + w];
      else if (one(w) && one(next) && !one(clean(words[i - 1])) && side(w, next)) parts = [side(w, next)]; // spoken "A B"
      else if (/^legs$/i.test(w)) parts = ['DA', 'BC']; // plural only: "a leg" names one, not both
      else if (/^bases$/i.test(w)) parts = ['AB', 'CD'];
      // the plain words: all four sides; the angles (their wedges where shown, else their corners); the lengths; the
      // diagonals; the halves of the diagonals (dual coding: the part named grows as it is said)
      else if (/^sides?$/i.test(w)) parts = SIDES;
      else if (/^angles$/i.test(w)) parts = ['aA', 'aB', 'aC', 'aD']; // (the angles themselves - their wedges peek in where not yet drawn)
      else if (/^lengths?$/i.test(w)) parts = ['lAB', 'lCD', 'lDA', 'lBC'];
      else if (/^diagonals?$/i.test(w)) parts = ['dAC', 'dBD'];
      else if (/^segments?$/i.test(w)) parts = HALVES;
      if (parts) cues.push({ i: i, parts: parts, dirs: dirs, done: false, seq: parts.length === 4 && /^a/.test(parts[0]) });
    });
    return cues;
  }
  // The four angles named together are pointed out one at a time - A, B, C, D, round the shape - each growing as its
  // turn comes and staying grown, then all four ease back together (nothing fades out and back: no blinking)
  angleSeq(parts, then) {
    const tok = this.stepTok, GAP = 600;
    parts.forEach((p, j) => this.tm(() => {
      if (tok === this.stepTok) this.setState({ emph: Object.assign({}, this.state.emph, { [p]: 1 }) });
    }, j * GAP));
    this.tm(() => {
      if (tok !== this.stepTok) return;
      const e = Object.assign({}, this.state.emph); parts.forEach((k) => { delete e[k]; });
      this.setState({ emph: e });
      if (then) then();
    }, (parts.length - 1) * GAP + CONFIG.emph.holdMs);
  }
  // grow -> brief hold -> back (CSS transitions do the easing; same timing everywhere)
  // a diagonal or a half of one among them, on the board: its light runs along it, the way it is named (dirs: a half's
  // own order, "AO" A to O; else a diagonal A to C, B to D, and a half from its corner to O)
  emphasize(parts, dirs) {
    const tok = this.stepTok;
    if (window.Motion && typeof document !== 'undefined') {
      const f = this.fl(), st = this.cur(), P = this.shapeP(), O = { x: (P.A.x + P.C.x) / 2, y: (P.A.y + P.C.y) / 2 }, pt = (k) => (k === 'O' ? O : P[k]);
      const diagOn = !!(f.diag || (this.state.diag && (this.state.diag.AC || this.state.diag.BD)) || (st.fig && st.fig.diag));
      const halvesOn = !!(f.split || f.halfPairs || (st.fig && st.fig.diag));
      const seg = (e) => { const a = this.boardToStage(pt(e[0])), b = this.boardToStage(pt(e[1])); return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null; };
      // the two halves of one diagonal named together (AO = OC) are traced one after the other - A to O, then on
      // from O to C - never both at once, which reads as the whole diagonal AC
      const now = [], later = [], paired = {};
      [['hA', 'hC'], ['hB', 'hD']].forEach(([p, q]) => {
        if (!halvesOn || parts.indexOf(p) < 0 || parts.indexOf(q) < 0 || (dirs && (dirs[p] || dirs[q]))) return;
        const first = parts.indexOf(p) < parts.indexOf(q) ? p : q, second = first === p ? q : p;
        now.push(seg([first[1], 'O'])); later.push(seg(['O', second[1]])); paired[p] = paired[q] = 1;
      });
      parts.forEach((k) => { if (paired[k]) return; const e = (k === 'dAC' || k === 'dBD') && diagOn ? [k[1], k[2]] : /^h[A-D]$/.test(k) && halvesOn ? (dirs && dirs[k]) || [k[1], 'O'] : null; if (e) now.push(seg(e)); });
      const runs = now.filter(Boolean), next = later.filter(Boolean);
      if (runs.length && !st.noTrace) { Motion.traceRun(runs); this.sfx('glint', { v: 0.7 }); } // (a line's light glints, as a side's does)
      if (next.length && !st.noTrace) this.tm(() => { if (tok === this.stepTok) { Motion.traceRun(next); this.sfx('glint', { v: 0.6 }); } }, 650);
    }
    this.setState({ emph: Object.assign({}, this.state.emph, parts.reduce((o, k) => { o[k] = 1; return o; }, {})) });
    this.tm(() => {
      if (tok !== this.stepTok) return;
      const e = Object.assign({}, this.state.emph); parts.forEach((k) => { delete e[k]; });
      this.setState({ emph: e });
    }, CONFIG.emph.holdMs);
  }
  // A side's parallel arrows called out (after ms): arrows on show beat once; a parallelogram's side showing none gets
  // them for a moment - they pop on, stay (CONFIG.marks.tempMs) and go (s.parTmp, drawn by render)
  parBeat(ks, ms) {
    const tok = this.stepTok, set = (v) => { const t = Object.assign({}, this.state.parTmp); ks.forEach((k) => { if (v) t[k] = v; else delete t[k]; }); this.setState({ parTmp: t }); };
    this.tm(() => {
      if (tok !== this.stepTok) return;
      if (window.Motion && !Motion.reduced && typeof document !== 'undefined') ks.forEach((k) => document.querySelectorAll('.par-ch[data-side="' + k + '"]:not(.tmp)').forEach((el) => {
        if (el.animate && getComputedStyle(el).display !== 'none') el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out' });
      }));
      set('in');
      this.sfx('tick', { v: 0.8 });
    }, ms || 0);
    this.tm(() => { if (tok === this.stepTok) set('out'); }, (ms || 0) + CONFIG.marks.tempMs);
    this.tm(() => { if (tok === this.stepTok) set(null); }, (ms || 0) + CONFIG.marks.tempMs + 320);
  }
  // "parallelogram" said with a parallelogram on the board (one shape, not a grid of them, and a board at all: the
  // summary draws its own ideas): its arrows are called out pair by pair - AB and CD, then AD and BC
  parWord() {
    const st = this.cur();
    if (!st || st.grid || st.end || st.summary || !this.isPg(this.shapeP())) return;
    this.parBeat(['AB', 'CD'], 0);
    this.parBeat(['DA', 'BC'], CONFIG.marks.pairGap);
  }
  // these sides lit (their light runs) for ms; a light that comes after takes over (id: a sequence's own step)
  lightFor(ks, ms, id) {
    const tok = this.stepTok, g = ks.slice();
    if (!id) this.seqId = null; // (a sequence still running stops: this light is the newer word's)
    this.setState({ glow: g });
    this.sfx('glint', { v: 0.8 });
    this.tm(() => { if (tok === this.stepTok && this.state.glow === g) this.setState({ glow: null }); }, ms);
  }
  // whether side k's opposite side is parallel to it, on this shape
  sidePar(P, k) {
    const v = (p, q) => ({ x: P[q].x - P[p].x, y: P[q].y - P[p].y });
    const [a, b] = k === 'AB' || k === 'CD' ? [v('A', 'B'), v('D', 'C')] : [v('A', 'D'), v('B', 'C')];
    return Math.abs(a.x * b.y - a.y * b.x) / ((Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) || 1) < 0.01;
  }
  // The key words (gold on the plate) show what they mean on the shape as they are said: "sides" - all four lit;
  // "opposite" - the opposite pairs lit in turn (of sides, or of angles); "parallel" - the arrows of the sides that are
  // parallel (the ones the line names, else every parallel pair), lit with them - only what is true of this shape, and
  // never a question's answer; "parallelogram" - its arrows beat (parWord), where the screen is about its sides;
  // "vertices" - the corners; "equal", "adjacent", "supplementary", "180°" - the parts the line names, together (and
  // "equal" naming none, with the lengths shown: each pair of opposite lengths in turn);
  // "bisect" - the diagonals' halves; "diagonals" not drawn yet - AC and BD drawn in a moment. A line lighting sides itself (its glow, or a cue's) gets no more light from
  // these; none on a build, a summary, a grid of shapes or the end.
  conceptCues(words, L, ask) {
    const st = this.cur(), out = [];
    if (!st || st.build || st.sideNums || st.assemble || st.summary || st.grid || st.end) return out; // (screens 1-3 show the sides their own way)
    if ((L.cues || []).some((c) => c.match || c.matchAng || c.halfSlide)) return out; // (a line showing its fact with a demo: the demo is the picture)
    const key = (w) => String(w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nm = (w) => String(w || '').split('\u00a0')[0].replace(/[^A-Za-z∠]/g, '');
    const sideOf = { AB: 'AB', BA: 'AB', BC: 'BC', CB: 'BC', CD: 'CD', DC: 'CD', DA: 'DA', AD: 'DA' };
    const nSides = [], nParts = [];
    words.forEach((w) => {
      const t = nm(w), m = /^∠([A-D])$/.exec(t);
      if (sideOf[t] && nSides.indexOf(sideOf[t]) < 0) { nSides.push(sideOf[t]); nParts.push(sideOf[t]); }
      else if (m && nParts.indexOf('a' + m[1]) < 0) nParts.push('a' + m[1]);
      else if (/^(O[A-D]|[A-D]O)$/.test(t) && nParts.indexOf('h' + t.replace('O', '')) < 0) nParts.push('h' + t.replace('O', ''));
    });
    const lit = !L.glow && !(L.cues || []).some((c) => c.glow !== undefined); // (the line does not light sides itself)
    const P = this.shapeP(), f = st.fig ? Object.assign({ diag: st.fig.diag }, this.fl()) : this.fl(), arcs = st.fig ? Object.keys(st.fig.angles || {}).join('') : (f.arcs || '');
    const demo = (L.cues || []).some((c) => c.match || c.matchAng || c.halfSlide || c.pairJump || c.boxMerge) || !!L.tagsWithSupp || !!f.supp;
    // (a parallelogram's arrows beat on its name where the screen is about its sides - not over angles, diagonals, a
    // checkpoint's figure or a demo, where they would only be in the way)
    const sidesScreen = !arcs && !f.diag && !st.fig && st.task !== 'connect' && !demo;
    const lens = !!(f.sideLen || f.legLen || (st.fig && st.fig.sides));
    const aboutAngles = words.some((w) => /^(angles?|∠[A-D])$/.test(nm(w)) || /^angles?$/.test(key(w)));
    const pairOf = (k) => (k === 'AB' || k === 'CD' ? ['AB', 'CD'] : ['DA', 'BC']);
    const oppAngles = [['A', 'C'], ['B', 'D']].map((q) => q.filter((x) => arcs.indexOf(x) >= 0).map((x) => 'a' + x)).filter((q) => q.length);
    // the parts named next to word i (two words before it, three after: "CD is opposite AB", "∠C is opposite ∠A")
    const near = (i, re) => words.slice(Math.max(0, i - 2), i + 4).map(nm).map((t) => (re.test(t) ? t : null)).filter(Boolean);
    const litIn = new Set();
    words.forEach((w, i) => {
      const k = key(w), next = key(words[i + 1]), prev = key(words[i - 1]);
      let c = null;
      if (k === 'opposite' && (/^angles?$/.test(next) || near(i, /^∠[A-D]$/).length >= 2)) {
        const na = near(i, /^∠[A-D]$/).map((t) => 'a' + t[1]);
        if (na.length >= 2) c = { emph: na.slice(0, 2) }; else if (oppAngles.length) c = { emphSeq: oppAngles };
      } else if (k === 'opposite' && lit) {
        const ns = near(i, /^[A-D]{2}$/).map((t) => sideOf[t]).filter(Boolean);
        const ks = ns.length ? ns : nSides.length === 1 ? pairOf(nSides[0]) : null;
        c = ks ? { light: ks.length === 1 ? pairOf(ks[0]) : ks, ms: 1300 } : { lightSeq: [['AB', 'CD'], ['DA', 'BC']] };
      } else if (k === 'parallel') {
        const ks = (nSides.length ? nSides : ['AB', 'CD', 'DA', 'BC']).filter((s) => this.sidePar(P, s));
        if (ks.length && !(ask && !nSides.length)) c = { parSides: ks, lit: lit };
        else if (nSides.length && lit) c = { light: nSides, ms: 1300 }; // (named, not parallel yet: only which sides)
      } else if (/^parallelograms?$/.test(k)) c = !sidesScreen || out.some((a) => a.c.parSides) ? null : { parWord: 1 }; // (its arrows beat once: not again after "parallel")
      else if (k === 'vertices') c = { emph: ['vA', 'vB', 'vC', 'vD'] };
      else if (k === '180' && L.tagsWithSupp) c = { sumSaid: 1 }; // (its tag's "= 180°" joins on the word)
      else if (/^(equal|adjacent|supplementary|180)$/.test(k) && nParts.length >= 2) c = nParts.some((p) => /^a|^h/.test(p)) ? { emph: nParts } : (lit ? { light: nSides, ms: 1300 } : null);
      else if (k === 'equal' && aboutAngles && oppAngles.length) c = st.task === 'tapEq' || ask ? { emph: ['aA', 'aB', 'aC', 'aD'].filter((a) => arcs.indexOf(a[1]) >= 0) } : { emphSeq: oppAngles };
      else if (k === 'equal' && (f.sideLen || f.legLen)) c = { emphSeq: [['lAB', 'lCD'], ['lDA', 'lBC']], lightSeq: lit ? [['AB', 'CD'], ['DA', 'BC']] : null }; // (equal lengths: each pair's, together)
      else if (k === 'equal' && lit && nSides.length === 1) c = { light: pairOf(nSides[0]), ms: 1300 };
      else if (k === 'equal' && lit && !nParts.length && arcs && !lens) c = { emph: ['aA', 'aB', 'aC', 'aD'].filter((a) => arcs.indexOf(a[1]) >= 0) };
      else if (k === 'bisect' && f.diag) c = { emph: ['hA', 'hB', 'hC', 'hD'] };
      else if (/^diagonals?$/.test(k) && !f.diag && !ask && st.task !== 'connect' && !(this.state.diag && (this.state.diag.AC || this.state.diag.BD))) c = { sketchDiag: 1 }; // (not drawn yet, nor to be drawn: shown a moment)
      const sides = c ? [].concat(c.light || [], c.parSides || [], ...(c.lightSeq || [])) : [];
      if (c && sides.length && sides.every((x) => litIn.has(x)) && !c.parSides) c = null; // (sides lit once in a line are not lit again)
      sides.forEach((x) => litIn.add(x));
      if (c && !out.some((a) => JSON.stringify(a.c) === JSON.stringify(c))) out.push({ i: i, c: c }); // (never the same picture twice in a line)
    });
    return out;
  }
  // a screen's own way with its key words: noTrace - they highlight only (no light runs along its lines, no sketched
  // diagonals: their parts still grow); onlyCues - none at all, the line's own cues are its whole picture
  quietCues(out) {
    const st = this.cur() || {};
    if (st.onlyCues) return [];
    if (!st.noTrace) return out;
    return out.map((a) => {
      const c = Object.assign({}, a.c); delete c.light; delete c.lightSeq; delete c.sketchDiag; if (c.parSides) c.lit = false;
      return Object.keys(c).some((k) => k !== 'lit' && k !== 'ms') ? { i: a.i, c: c } : null; // (nothing left to show: no cue)
    }).filter(Boolean);
  }
  // o: { f: pitch Hz, v: volume x, delay: s } for the synthesised effects (js/sfx.js)
  sfx(kind, o) {
    if (this.state.muted) return;
    if (CONFIG.sounds && CONFIG.sounds[kind] && this.playSound(kind)) return;
    if (!this.actx) return;
    if (window.Sfx && Sfx.has(kind)) { Sfx.play(this.actx, kind, o); return; }
    const ctx = this.actx;
    try {
      const now = ctx.currentTime;
      const N = {
        tap: [[700, 0, 0.07]], pop: [[520, 0, 0.07], [780, 0.06, 0.09]],
        good: [[660, 0, 0.12], [880, 0.1, 0.12], [1175, 0.2, 0.24]],
        snap: [[990, 0, 0.08], [1320, 0.07, 0.14]],
        bad: [[240, 0, 0.16], [190, 0.13, 0.22]]
      }[kind] || [];
      N.forEach((n) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = kind === 'bad' ? 'square' : 'triangle';
        o.frequency.value = n[0];
        const peak = kind === 'bad' ? 0.06 : 0.16;
        g.gain.setValueAtTime(0.0001, now + n[1]);
        g.gain.exponentialRampToValueAtTime(peak, now + n[1] + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + n[2]);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + n[1]); o.stop(now + n[1] + n[2] + 0.03);
      });
    } catch (e) {}
  }

  // ---------- narration ----------
  // One line of VO. The voice is the clock: nothing shows until it starts, each word appears as the voice
  // reaches it (word-boundary events mapped to exact word offsets), and Swiftee's beak moves only while it
  // speaks. Voices without boundary events fall back to a paced reveal that starts with the voice and holds
  // the last word until the voice ends. With no voice at all, the paced reveal and beak run on their own.
  say(L, done) {
    const keep = !!(L && L.keep); // voice-only: the bubble keeps showing the previous line
    if (!L || (!L.t && !keep) || (keep && !L.s)) { if (done) done(); return; }
    const text = keep ? this.state.line : L.t;
    const words = this.toWords(keep ? L.s : text);
    // spoken text, and where each displayed word starts in it
    let sp, offs = null;
    if (L.s) {
      sp = L.s;
      const toks = []; sp.replace(/\S+/g, (m, at) => { toks.push(at); return m; });
      if (toks.length === words.length) offs = toks;
    } else {
      const parts = words.map((w) => this.speechOf(w).trim());
      offs = []; let at = 0;
      parts.forEach((p) => { offs.push(at); at += p.length + 1; });
      sp = parts.join(' ');
    }
    const wordAt = (ci) => {
      if (offs) { let k = 0; while (k < offs.length && offs[k] <= ci) k++; return Math.max(1, k); }
      return Math.min(words.length, Math.floor((ci / Math.max(1, sp.length)) * words.length) + 1);
    };
    const setReveal = (n) => {
      if (!keep) this.setState({ reveal: n });
      if (n >= words.length && L === this.askLine && tok === this.narrTok) this.askedNow(); // (the question is out: its answers come)
      if (atIdx >= 0 && n >= atIdx + 1) highlight();
      if (pAt >= 0 && n >= pAt + 1) firePulse();
      if (gAt >= 0 && n >= gAt + 1) fireGrow();
      emphCues.forEach((c) => {
        if (c.done || n < c.i + 1) return;
        c.done = true;
        if (tok !== this.narrTok) return;
        if (c.seq) this.angleSeq(c.parts, () => focusAngles(c.parts)); // (all four angles: one at a time)
        else {
          this.emphasize(c.parts, c.dirs); focusAngles(c.parts);
          // a side named on its own: its light runs along it (the way its arrows point) and its length grows, as it is
          // said - unless it is lit already (a sentence naming it again does not flash it again)
          const named = c.parts.filter((k) => /^(AB|BC|CD|DA)$/.test(k)), lit = this.state.glow || [];
          if (!this.cur().noTrace && named.length && named.length === c.parts.length && named.length <= 2 && !named.every((k) => lit.indexOf(k) >= 0)) {
            this.lightFor(named, 1300); this.emphasize(named.map((k) => 'l' + k));
          }
        }
      });
      cues.forEach((q) => { if (n >= q.i + 1) fireCue(q); });
    };
    // cues: board moments tied to a spoken word (exact match, punctuation ignored) - see runCue; any the voice never
    // reached all fire as the line ends
    // a cue's word is matched as the words are shown ("180°." is 180): one the voice never reaches fires as the line ends
    const key = (w) => String(w).toLowerCase().replace(/[^a-z0-9-]/g, '');
    // until: the cue lasts until that word is said (span, s: from the clip's own word times; else about 0.3 s a word)
    const cueKey = keep ? L.s : text.replace(/\s*\n\s*/g, ' ').trim();
    const cues = (L.cues || []).map((c) => ({ c: c, i: words.map(key).indexOf(key(c.at)), j: c.until ? words.map(key).indexOf(key(c.until)) : -1, done: false }));
    const cueAt = new Set(cues.map((q) => q.i)); // (the words the line's own cues are on)
    // the key words show what they mean on the shape as they are said (conceptCues), where the line's own cue at that
    // word does not; a line calling out arrows itself (beat, mark) keeps them its own
    const own = (L.cues || []).some((c) => c.beat || c.mark);
    // (a question, and the answer's feedback or a tip, take no pictures of their own words - the question stays calm, the
    // answer's own moment is its picture - only the cues written for them)
    const quiet = L === this.askLine || !!L.fb;
    const concepts = quiet ? [] : this.quietCues(this.conceptCues(words, L, L === this.askLine));
    const conceptAt = new Set(concepts.map((a) => a.i));
    if (L === this.askLine && this.cur().fig) { // (each label of a checkpoint's figure as the question names it)
      const named = this.figNamed(this.cur());
      words.forEach((w, i) => { const k = this.figKey(w); if (k && named[k] && !cues.some((q) => q.c.figShow === k)) cues.push({ c: { figShow: k }, i: i, j: -1, done: false }); });
    }
    concepts.forEach((a) => {
      const arrows = a.c.parWord || a.c.parSides;
      if (arrows ? !own : !cues.some((q) => q.i === a.i)) cues.push({ c: a.c, i: a.i, j: -1, done: false });
    });
    const fireCue = (q) => {
      if (q.done || tok !== this.narrTok) return;
      q.done = true;
      let c = q.c;
      if (q.i >= 0 && q.j > q.i) {
        const tw = window.VO && VO.has(cueKey) ? VO.times(cueKey) : null;
        c = Object.assign({}, c, { span: tw && tw[q.j] != null && tw[q.i] != null ? (tw[q.j] - tw[q.i]) / (VO.rate || 1) : (q.j - q.i) * 0.3 });
      }
      this.runCue(c);
    };
    // a part of the shape named in the line (∠A, AB, "A B", vertex A, legs, bases) grows briefly as the voice says it
    // ...one picture at a time: on a line showing its fact with a demo (a slide, a turn, lengths jumping into boxes, the
    // 180° demos) no part grows besides it; a word with its own cue does not also grow; and a group of parts (the
    // sides, the angles, the halves) does not grow on top of a key word's picture of them, on that word or the word
    // after it ("opposite sides": the pairs light in turn, and all four do not then grow over them)
    const demoLine = (L.cues || []).some((c) => c.match || c.matchAng || c.halfSlide || c.pairJump || c.boxMerge) || !!L.tagsWithSupp || !!(this.cur().f || {}).supp;
    // (and a group word stays quiet when the line names one of its parts beside it: "the length of CD" is CD's length)
    const allParts = this.partCues(words), namedNear = (i) => allParts.some((q) => q.parts.length === 1 && Math.abs(q.i - i) <= 2);
    // (and parts once shown in a line are not shown again in it: "AC and BD are the diagonals" - not both again)
    const shown = new Set();
    // (a question or feedback keeps only the parts it names one by one - "AB", "OC": its words tied to the figure)
    const emphCues = demoLine || this.cur().onlyCues ? [] : allParts.filter((c) => !cueAt.has(c.i) && !(c.parts.length > 1 && (conceptAt.has(c.i) || conceptAt.has(c.i - 1) || namedNear(c.i))))
      .filter((c) => !quiet || (c.parts.length === 1 && !(L.fb && this.cur().fig && this.cur().fig.sides))) // (a checkpoint's found sides lit as their numbers landed: not again)
      .filter((c) => { const again = c.parts.every((p) => shown.has(p)); c.parts.forEach((p) => shown.add(p)); return !again; });
    // angles named in the line join the focus as the voice says them; the rest fade back until shortly after the line
    const aNamed = {};
    const focusAngles = (parts) => {
      const ks = parts.filter((p) => /^a[A-D]$/.test(p)).map((p) => p[1]);
      if (!ks.length || (L === this.askLine && this.cur().task === 'tapEq')) return; // (the others are the choices: they stay)
      ks.forEach((k) => { aNamed[k] = 1; });
      this.setState({ aFocus: Object.assign({}, aNamed) });
    };
    // pulse: the shape zooms once and returns to its size - on the pulseAt word as the voice says it, else as the line ends
    // (the last time the word is said: the name usually comes at the end, e.g. "...is called a right angled trapezium")
    const pAt = L.pulse && L.pulseAt ? words.map((w) => w.toLowerCase().replace(/[^a-z-]/g, '').indexOf(L.pulseAt) === 0).lastIndexOf(true) : -1;
    // growAt: the shape comes forward once (Motion.growIn) as that word is said - else as the line ends
    const gAt = L.growAt ? words.map((w) => w.toLowerCase().replace(/[^a-z-]/g, '').indexOf(L.growAt) === 0).indexOf(true) : -1;
    let grown = false;
    const fireGrow = () => {
      if (!L.growAt || grown || tok !== this.narrTok) return;
      grown = true;
      const P = this.state.P;
      Motion.growIn((P.A.x + P.B.x + P.C.x + P.D.x) / 4, (P.A.y + P.B.y + P.C.y + P.D.y) / 4);
    };
    let pulsed = false;
    const firePulse = () => {
      if (!L.pulse || pulsed || tok !== this.narrTok) return;
      pulsed = true;
      const P = this.state.P;
      Motion.pop((P.A.x + P.B.x + P.C.x + P.D.x) / 4, (P.A.y + P.B.y + P.C.y + P.D.y) / 4);
    };
    let cardShown = !L.chips; // a line's cards come in as its voice starts (the glow below applies to any line)
    let glowOn = false;
    // glowAt: the highlight waits for that word
    const atIdx = L.glowAt ? words.findIndex((w) => w.toLowerCase().replace(/[^a-z-]/g, '').indexOf(L.glowAt) === 0) : -1;
    const highlight = () => {
      if (tok !== this.narrTok) return;
      if (L.glow && !glowOn) { glowOn = true; this.setState({ glow: L.glow }); }
    };
    const showCard = () => {
      if (tok !== this.narrTok) return;
      if (!cardShown) { cardShown = true; if (!L.tagsWithSupp) this.addChips(L.chips); }
      if (atIdx < 0) highlight();
    };
    const tok = ++this.narrTok;
    this.curLine = L; this.curLineStep = this.state.step; // (the line being said, and whose screen it is)
    this.cancelSpeech();
    if (keep) this.setState({ talking: true, aFocus: null });
    else this.setState({ aFocus: null, line: text, reveal: 0, talking: true, bub: this.state.bub === 'bubA' ? 'bubB' : 'bubA', bubOff: false });
    if (L.m) this.preloadPose(L.m);
    let i = 0, rDone = false, sDone = false, fin = false, bMode = false, spoke = false, started = false, mouthOn = false, tStart = 0;
    let clipMs = 0; // a recorded clip's length at its play rate (0 = device voice / no voice: estimated pace)
    const live = () => tok === this.narrTok;
    const mouth = (on) => {
      if (!live() || on === mouthOn || L.narr) return;
      mouthOn = on;
      if (!this.sw) return;
      if (L.holdM && L.m) { if (on) this.pose(L.m); return; } // keeps the line's pose (e.g. waving) instead of the beak loop
      this.sw.talk(on, on ? null : (L.m || this.restPose()));
    };
    const finish = () => {
      if (!live() || fin || !rDone || !sDone) return;
      fin = true; this.lineEnd = performance.now();
      mouth(false);
      highlight(); // in case the word was never reached (voice cut short)
      cues.forEach(fireCue); // likewise every word cue
      this.setState(Object.assign(keep ? { talking: false } : { talking: false, reveal: words.length }, L.glow && atIdx < 0 ? { glow: null } : {}));
      if (L.glow && atIdx >= 0) this.tm(() => { if (live()) this.setState({ glow: null }); }, 1500); // the word was the end: let it linger
      if (Object.keys(aNamed).length) this.tm(() => { if (live()) this.setState({ aFocus: null }); }, 1200);
      firePulse(); // no-op if the pulseAt word already fired it
      fireGrow(); // likewise for growAt
      if (this.cur().build) this.rushBuild(); // screen 1: the outline closes with the line
      // after speaking, Swiftee reacts with the line's expression for a beat, then settles
      if (L.m) this.tm(() => { if (live()) this.pose(this.restPose()); }, CONFIG.swiftee.reactMs);
      this.tm(() => { if (live() && done) done(); }, 420);
    };
    const revealAll = () => { if (!live()) return; i = words.length; setReveal(i); rDone = true; };
    // nominal time per word at u.rate; paceK learns the real voice speed from each finished line (fallback mode)
    const nominal = (w) => (170 + 48 * w.length + (/[.!?,…]$/.test(w) ? 160 : 0)) / 0.95;
    const pace = (w) => nominal(w) * (this.paceK || 1.18);
    // paced reveal: only when the voice gives no word positions; never shows the last word before the voice ends
    const tick = () => {
      if (!live() || rDone || bMode) return;
      // until the voice speed is learned, the last word waits for the voice to end; after that it follows the pace
      if (i < words.length - 1 || sDone || this.paceK) { i = Math.min(words.length, i + 1); setReveal(i); }
      if (i >= words.length) { rDone = true; finish(); return; }
      this.tm(tick, pace(words[i - 1] || ''));
    };
    const begin = () => { // the voice (or the silent fallback) has started
      if (!live() || started) return;
      started = true; tStart = performance.now();
      showCard(); mouth(true);
      // screen 1: the outline draws itself while this line is spoken and closes as it ends (fill fades in after)
      if (this.buildArmed && this.cur().build) {
        const lineMs = clipMs || words.reduce((t, w) => t + nominal(w), 0) * (this.paceK || 1.18);
        this.runBuild(Math.max(CONFIG.build.minMs, Math.min(CONFIG.build.maxMs, lineMs * CONFIG.build.ofLine)));
      }
      tick();
    };
    // the device's built-in voice (with none: the paced reveal). One voice for Swiftee: while her recorded voice is on, a
    // line whose clip cannot play shows its words silently rather than in the device's voice, and in the journey the
    // device's voice is never used (as in Fishing Frenzy's lesson)
    const device = () => {
      const s = this.synth();
      const canSpeak = !this.state.muted && s && typeof SpeechSynthesisUtterance !== 'undefined' && !JOURNEY && !(window.VO && VO.on);
      if (!canSpeak) {
        sDone = true; // no voice: words pace themselves and the beak moves while they appear
        this.tm(() => { begin(); }, 140);
        const silentEnd = () => { if (!live()) return; if (rDone) { mouth(false); finish(); } else this.tm(silentEnd, 120); };
        this.tm(silentEnd, 300);
        return;
      }
      const est = words.reduce((t, w) => t + nominal(w), 0) * 1.4;
      try {
        const u = new SpeechSynthesisUtterance(sp);
        if (this.voice) u.voice = this.voice;
        u.lang = (this.voice && this.voice.lang) || 'en-GB';
        u.rate = 0.95; u.pitch = 1.25;
        const end = () => {
          if (!live() || sDone) return;
          if (started && !bMode && tStart) { // learn this voice's speed; stay a touch slow so words never lead the voice
            const ratio = (performance.now() - tStart) / Math.max(1, words.reduce((t, w) => t + nominal(w), 0));
            if (ratio > 0.4 && ratio < 3) this.paceK = Math.max(0.6, 0.5 * (this.paceK || 1.18) + 0.5 * ratio * 1.06);
          }
          sDone = true; begin(); mouth(false); revealAll(); finish();
        };
        u.onstart = () => { spoke = true; begin(); };
        u.onend = end; u.onerror = end;
        u.onboundary = (ev) => {
          if (!live() || (ev.name && ev.name !== 'word')) return;
          bMode = true; begin();
          const k = wordAt(ev.charIndex || 0);
          if (k > i) { i = k; setReveal(i); }
        };
        // Chrome can drop an utterance queued in the same tick as cancel(); give it a beat.
        this.tm(() => { if (live()) { try { s.speak(u); } catch (e) { end(); } } }, 60);
        // a voice that never reports onstart: begin once the engine says it is speaking (or after a grace period)
        const kick = (n) => {
          if (!live() || started || sDone) return;
          let busy = false; try { busy = s.speaking && !s.pending; } catch (e) {}
          if (busy || n > 20) { begin(); return; }
          this.tm(() => kick(n + 1), 80);
        };
        this.tm(() => kick(0), 200);
        // watchdog: voices that never fire onend, or never start at all
        const watch = () => {
          if (!live() || sDone) return;
          let busy = true;
          try { busy = s.speaking || s.pending; } catch (e) { busy = false; }
          if (!busy && (spoke || started)) { end(); return; }
          this.tm(watch, 300);
        };
        this.tm(watch, 900);
        this.tm(() => { if (live() && !sDone) end(); }, est * 1.8 + 2500);
      } catch (e) { sDone = true; begin(); }
    };
    // recorded voice-over (js/voice.js): the clip is the clock. Words appear at the clip's pace - each word at its share
    // of the spoken characters, max(16, (seconds - 0.35) * 1000 / characters) ms per character - so word cues fire as
    // the voice says them; the line ends when the clip does (safety: what is left of it + 600 ms). A clip that never
    // starts (missing file, play() refused) hands the line to device() below, which shows its words silently.
    const voKey = keep ? L.s : text.replace(/\s*\n\s*/g, ' ').trim();
    if (!this.state.muted && window.VO && VO.has(voKey)) {
      const sec = VO.seconds(voKey), rate = VO.rate;
      clipMs = sec * 1000 / rate;
      // each displayed word's weight: its spoken length (numbers are said as words, so their digits weigh more)
      const wt = words.map((w) => this.speechOf(w).replace(/\d/g, 'xxxx').length + 1), tot = wt.reduce((a, b) => a + b, 0);
      const perCh = Math.max(16, (sec - 0.35) * 1000 / tot) / rate;
      const end = () => {
        if (!live() || sDone) return;
        sDone = true; begin(); mouth(false); revealAll(); finish();
      };
      const handed = VO.play(voKey, {
        start: () => {
          if (!live()) return;
          bMode = true; begin(); // bMode: no paced reveal - the timers below place every word
          // each word at its measured start in the clip (tools/vo_build.js); else at its share of the spoken characters
          const tw = VO.times(voKey), show = (k) => { if (live() && k + 1 > i) { i = k + 1; setReveal(i); } };
          if (tw && tw.length === words.length) {
            // follow the clip's own playhead (not a wall clock), so words stay with the voice through start-up lag or
            // buffering; the line ends where its speech does
            const sEnd = VO.speechEnd(voKey);
            const follow = () => {
              if (!live() || sDone) return;
              const ct = VO.now();
              if (ct >= 0) while (i < tw.length && tw[i] <= ct + 0.04) show(i);
              if (sEnd && ct >= sEnd + 0.12) { end(); return; } // (a hair past its last sound, so no final syllable is clipped)
              this.tm(follow, 30);
            };
            follow();
          } else { let at = 0; wt.forEach((w, k) => { const ms = at * perCh; at += w; this.tm(() => show(k), ms); }); }
          // safety, should the clip never report its end (a stall in playback is not cut short: the line ends where its
          // speech does, by the clip's own playhead, above)
          this.tm(() => { if (live() && !sDone) { VO.stop(); end(); } }, clipMs * 1.5 + 4000);
        },
        end: end,
        fail: () => { if (live() && !started) { clipMs = 0; device(); } }
      });
      if (handed) {
        // a screen's own line whose clip is slow to arrive is waited for (it is the instruction or the question); a tip
        // or a right answer's praise is not - its words show within 1.5 s, voiced or not (a clip Safari has not fetched
        // ahead can take seconds to start, and the plate shows nothing until its first word); only a clip that never
        // starts gives the line to device() (its words, silently)
        const own = ((this.cur() || {}).lines || []).indexOf(L) >= 0;
        this.tm(() => { if (live() && !started && !sDone) { VO.stop(); clipMs = 0; device(); } }, own ? 8000 : 1500);
        return;
      }
      clipMs = 0;
    }
    device();
  }
  preloadPose(state) { if (this.sw && this.sw.m) this.sw.preload(state); }
  // Step narration queue. Interjections (feedback, idle hints, replay) play over it and then
  // the queue carries on with its next line, so a step's later lines and chips are never lost.
  // keep a number and its unit, and short equations, on one line ("5 cm", "AB = 6 cm" never split)
  toWords(t) { return t.replace(/(\d) (cm)\b/g, '$1\u00a0$2').replace(/ ([=+\u2212]) /g, '\u00a0$1\u00a0').split(/[ \t\n]+/).filter(Boolean); }
  // the shape's corners and O on the stage (stage px), for the maths in motion
  fxPts() {
    const P = this.shapeP(), out = {};
    for (const k of ['A', 'B', 'C', 'D']) { const q = this.boardToStage(P[k]); if (!q) return null; out[k] = q; }
    out.O = { x: (out.A.x + out.C.x) / 2, y: (out.A.y + out.C.y) / 2 };
    return out;
  }
  // the wedge of the angle at corner k, on the stage: its vertex, its arms (unit vectors to its neighbours), the sweep
  // flag of the arc inside the shape, its radius and colour (as the board draws it)
  fxWedge(S, k) {
    const nb = { A: ['D', 'B'], B: ['A', 'C'], C: ['B', 'D'], D: ['C', 'A'] }[k], v = S[k];
    const un = (q) => { const L = Math.hypot(q.x - v.x, q.y - v.y) || 1; return { x: (q.x - v.x) / L, y: (q.y - v.y) / L }; };
    const u1 = un(S[nb[0]]), u2 = un(S[nb[1]]), cross = u1.x * u2.y - u1.y * u2.x, dot = u1.x * u2.x + u1.y * u2.y;
    const deg = Math.abs(Math.atan2(cross, dot)) * 180 / Math.PI;
    return { v: v, u1: u1, u2: u2, f: cross > 0 ? 1 : 0, R: CONFIG.angleR(deg), col: CONFIG.palette['v' + k] };
  }
  // the plate's width and type size for its line: measured on a hidden copy in the plate's own type (css/game.css
  // .plate-measure), so it fits its line (no empty glass round a short one) and glides to the next screen's size. The
  // whole line sits on one line of 26 px; one too long for the card is set at 23 px, then 20 (as Fishing Frenzy's)
  plateFit(words) {
    const shown = words.filter((d) => d.t), key = shown.map((d) => d.t + (/\bkey\b/.test(d.cls) ? '*' : '')).join(' ');
    if (!shown.length) return this._pw || { w: 1000, size: 26 }; // (no line between screens: it keeps its size, so the next never stretches in)
    if (this._pwKey === key) return this._pw;
    let m = this._pm;
    if (!m) {
      m = this._pm = document.createElement('div'); m.className = 'plate-measure'; m.setAttribute('aria-hidden', 'true'); document.body.appendChild(m);
      // the plate's font may still be on its way: once it is in, every line is measured again
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this._pwKey = null; if (this.state.started) this.setState({}); });
    }
    const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    m.innerHTML = shown.map((d) => '<span class="w' + (/\bkey\b/.test(d.cls) ? ' key' : '') + '">' + esc(d.t) + '</span>').join(''); // (as the plate: words spaced by their margins)
    this._pwKey = key;
    let w = 0, size = 26;
    for (const px of [26, 23, 20]) { size = px; m.style.fontSize = px + 'px'; w = m.getBoundingClientRect().width + 4; if (w <= CONFIG.plateMaxW) break; }
    return (this._pw = { w: Math.round(Math.min(CONFIG.plateMaxW, Math.max(220, w))), size: size });
  }
  // the screen's question or instruction (its last line), which the plate shows in full once it has been asked
  question(st) { const L = (st.lines || []).filter((x) => !x.keep && x.t).pop(); return L ? L.t : null; }
  playLines(lines, done) {
    this.q = { lines: lines || [], i: 0, done: done, tok: this.stepTok };
    this.qNext();
  }
  qNext() {
    const q = this.q;
    if (!q || q.tok !== this.stepTok) return;
    const rest = q.i > 0 && q.i < q.lines.length ? (this.seqEnd || 0) - Date.now() : 0; // (the last line's animation, and its rest)
    if (rest > 0) { this.tm(() => this.qNext(), rest); return; }
    if (q.i >= q.lines.length) { this.q = null; if (q.done) q.done(); this.armIdle(); return; }
    const L = q.lines[q.i++], prev = q.i > 1 ? q.lines[q.i - 2] : null;
    // (her line after the narrator's on the same screen - 'Are the segments equal?' then 'Let's find out!': she dives
    // in first, seen, as the plate goes)
    if (prev && prev.narr && !L.narr && !this.isPlate(this.cur())) { this.curLine = L; this.curLineStep = this.state.step; const tok = this.stepTok; this.setState({ line: '', reveal: 0 }, () => this.dive(() => { if (tok === this.stepTok) this.say(L, () => this.qNext()); })); return; } // (the narrator's words leave with the plate: no bubble until her line)
    this.say(L, () => this.qNext());
  }
  interject(L) {
    const tok = this.stepTok;
    this.say(L, () => {
      if (tok !== this.stepTok) return;
      if (this.state.meet) this.tm(() => { if (tok === this.stepTok) this.hideMeet(); }, 1400); // (the lines stay a moment)
      if (this.q) { this.qNext(); if (this.q) return; } // (a reply cut the question short: it ends there, and comes back below)
      // a tip or hint on a question still open: the question comes back on the plate, shown, not said again
      const st = this.cur(), q = this.question(st);
      if (q && !this.state.done && this.asks(st) && this.isPlate(st) && this.state.line !== q) this.setState({ line: q, reveal: 999, bub: this.state.bub === 'bubA' ? 'bubB' : 'bubA' });
      if (this.afterPraise && this.state.done) { const go = this.afterPraise; this.afterPraise = null; go(); } // (the praise said: the answers go)
      this.armIdle(); this.maybeAdvance(true);
    });
  }
  // a word cue (line.cues): glow = sides drawn bolder and pulsing (null clears), hi = the card that lifts with them,
  // chip = a card that pops in, pulse = the shape zooms once, ms = clear the glow and lift again after this long
  runCue(c) {
    const tok = this.stepTok, P = this.state.P;
    if (typeof c.fn === 'function') c.fn(); // (the summary's own highlights)
    if (c.half) { // (one half of a diagonal comes in, its light running out from O to its corner)
      this.setState({ halvesIn: Object.assign({}, this.state.halvesIn, { [c.half]: 1 }) }); this.sfx('pop', { v: 0.6 });
      const Q = this.shapeP(), O = this.boardToStage({ x: (Q.A.x + Q.C.x) / 2, y: (Q.A.y + Q.C.y) / 2 }), E = this.boardToStage(Q[c.half]);
      if (window.Motion && O && E) Motion.traceRun([{ x1: O.x, y1: O.y, x2: E.x, y2: E.y }]);
    }
    if (c.toMarks) { // (a pair's lengths become its marks: each number glides onto the middle of its half and shrinks into the tick drawn there)
      const ks = c.toMarks === 'A' ? ['A', 'C'] : ['B', 'D'], S = this.fxPts(), stage = typeof document !== 'undefined' && document.querySelector('.stage'), PAL = CONFIG.palette;
      const from = ks.map((k) => { const el = stage && stage.querySelector('.tag.mtag.hv.h' + k); const b = el && this.elBox(el); return b && { t: el.textContent.trim(), p: { x: b.x + b.w / 2, y: b.y + b.h / 2 } }; });
      // (the numbers glide off their places onto their halves' middles; the marks draw in only as they arrive)
      const a = c.toMarks, marks = () => { if (tok === this.stepTok && !(this.state.hMarks || {})[a]) { this.setState({ hMarks: Object.assign({}, this.state.hMarks, { [a]: 1 }) }); this.sfx('pop', { v: 0.6 }); } };
      this.setState({ hNum: Object.assign({}, this.state.hNum, { [a]: 1 }) });
      if (window.Motion && S && from.some(Boolean)) ks.forEach((k, j) => { if (from[j]) Motion.intoMark(from[j].t, from[j].p, { x: (S[k].x + S.O.x) / 2, y: (S[k].y + S.O.y) / 2 }, PAL['v' + k], marks); });
      else marks();
      this.busyFor(1100);
    }
    if (c.paint) { // (a diagonal's two colours become one: its corner's colour runs through O to the far corner, painting the other half)
      const a = c.paint, b = this.opp(a), S = this.fxPts(), set = () => { if (tok === this.stepTok) this.setState({ pairsIn: Object.assign({}, this.state.pairsIn, { [a]: 1 }) }); };
      if (window.Motion && S) { Motion.paintRun({ x1: S[a].x, y1: S[a].y, x2: S[b].x, y2: S[b].y }, CONFIG.palette['v' + a], 5 * (this.sceneFit(this.cur()).k || 1), set); this.sfx('glint', { v: 0.7 }); this.busyFor(1500); } else set();
    }
    if (c.figShow && this.state.figIn) { this.setState({ figIn: Object.assign({}, this.state.figIn, { [c.figShow]: 1 }) }); this.sfx('pop', { v: 0.45 }); }
    if (c.showO) { this.setState({ oIn: true }); this.sfx('pop', { v: 0.7 }); this.emphasize(['vO']); } // (point O, as it is named)
    if (c.pairTrace) { // (screen 50: a right pick's two halves traced, one after the other, then their equal marks)
      const a = c.pairTrace, b2 = this.opp(a), S = this.fxPts();
      const gap = c.gap || 650; // (the second half's start: as its name is said - "AO = OC" takes its time)
      if (window.Motion && S) { Motion.traceRun([{ x1: S[a].x, y1: S[a].y, x2: S.O.x, y2: S.O.y }]); this.sfx('glint', { v: 0.7 }); this.tm(() => { if (tok === this.stepTok) { Motion.traceRun([{ x1: S.O.x, y1: S.O.y, x2: S[b2].x, y2: S[b2].y }]); this.sfx('glint', { v: 0.6 }); } }, gap); }
      this.tm(() => { if (tok === this.stepTok) { this.setState({ hMarks: Object.assign({}, this.state.hMarks, { [a]: 1 }) }); this.sfx('pop', { v: 0.6 }); } }, gap + 700);
      this.busyFor(gap + 850);
    }
    if (c.steps) { const gap = c.gap || 1100; c.steps.forEach((x, j) => this.tm(() => { if (tok === this.stepTok) this.runCue(x); }, j * gap)); this.busyFor(c.steps.length * gap + 600); }
    if (c.emph) { // parts that grow on the word (as the ones a line names do by itself); all four angles one at a time
      if (c.emph.length === 4 && /^a/.test(c.emph[0]) && !c.together) this.angleSeq(c.emph); else this.emphasize(c.emph); // (together: all at once)
    }
    if (c.focus) { // the named angles stay vivid, the others step back for a moment
      const aF = {}; c.focus.forEach((k) => { aF[k] = 1; });
      this.setState({ aFocus: aF }); this.tm(() => { if (tok === this.stepTok) this.setState({ aFocus: null }); }, c.ms || 1500);
    }
    if (c.asked) { this.setState({ askedAng: c.asked }); this.emphasize(['a' + c.asked]); } // (the angle the question is about: it grows now and beats until answered - css .asked)
    if (c.glideB) this.glideB();
    if (c.meet) { this.showMeet(c.meet, c.span); this.busyFor((Motion.reduced ? 0 : 800) + (c.span ? Math.max(0.9, c.span - 0.8) + 0.45 : 1.75) * 1000); }
    if (c.meetPulse && window.Motion) Motion.meetPulse(); // ("...if we made them longer": the lines carried on beat once)
    // mark: the sides' parallel arrows come in with their light (the cue's glow): css .par-ch pops them on as the light
    // starts, 0.12 s in - on the word itself (their tick: markSounds)
    if (c.mark) { const marked = Object.assign({}, this.state.marked); c.mark.forEach((k) => { marked[k] = 1; }); this.setState({ marked: marked }); this.busyFor(1100 + 420); }
    // beat: these sides' parallel arrows are called out (parBeat) - as their light passes them when the cue lights them
    if (c.beat) this.parBeat(c.beat, c.glow ? 120 : 0);
    if (c.parWord) this.parWord();
    if (c.sketchDiag && window.Motion) { // (the diagonals, not on the board yet: AC then BD draw in a moment, dashed)
      const Q = this.shapeP(), S = (k) => this.boardToStage(Q[k]), A = S('A'), B = S('B'), C = S('C'), D = S('D');
      if (A && B && C && D) { Motion.sketch([{ x1: A.x, y1: A.y, x2: C.x, y2: C.y }, { x1: B.x, y1: B.y, x2: D.x, y2: D.y }], 1300); this.sfx('glint', { v: 0.7 }); this.tm(() => this.sfx('glint', { v: 0.7 }), 350); }
    }
    if (c.sumSaid) { this.sumSaid = true; const w = this.sumWait; this.sumWait = null; if (w) w(); } // (the voice has said 180: a tag waiting adds "= 180°")
    if (c.light) this.lightFor(c.light, c.ms || 1300);
    if (c.lightSeq && c.lightSeq.length) {
      const id = this.seqId = {}, gap = c.gap || 950, n = c.lightSeq.length;
      c.lightSeq.forEach((ks, j) => this.tm(() => { if (tok === this.stepTok && this.seqId === id) this.lightFor(ks, j < n - 1 ? gap + 150 : c.hold || 900, id); }, j * gap));
    }
    if (c.emphSeq) c.emphSeq.forEach((ks, j) => this.tm(() => { if (tok === this.stepTok) this.emphasize(ks); }, j * 950));
    if (c.parSides) { // (each pair on its own: AB and CD, then AD and BC; lit with them unless the line lights its sides)
      const p1 = c.parSides.filter((k) => k === 'AB' || k === 'CD'), p2 = c.parSides.filter((k) => k === 'DA' || k === 'BC');
      [p1, p2].filter((ks) => ks.length).forEach((ks, j) => this.tm(() => {
        if (tok !== this.stepTok) return;
        if (c.lit) this.lightFor(ks, 1300);
        this.parBeat(ks, c.lit ? 120 : 0);
      }, j * CONFIG.marks.pairGap * 2));
    }
    if (c.pair) { this.setState({ boxHi: c.pair }); this.tm(() => { if (tok === this.stepTok) this.setState({ boxHi: null }); }, c.ms || 1700); } // (the answer boxes of that pair pulse)
    if (c.pairJump) this.tagStep(() => this.pairJump(c.pairJump), 3000);
    if (c.boxMerge) this.tagStep(() => this.boxMerge(c.boxMerge), 1500);
    // the maths in motion (js/motion.js): equal sides slide onto each other, equal angles fly across and fit, the
    // diagonals' halves slide onto each other - one pair after another
    if (window.Motion && (c.match || c.matchAng || c.halfSlide)) {
      const S = this.fxPts(), PAL = CONFIG.palette;
      if (S) {
        const seg = (k) => { const a = S[k[0]], b = S[k[1]]; return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, col: k === 'AB' || k === 'CD' || k === 'BA' || k === 'DC' ? PAL.line : PAL.pair2 }; };
        const pairs = (v) => (Array.isArray(v[0]) ? v : [v]);
        let at = 0;
        // equal sides: the copy of one slides onto the other by a translation (A->D, B->C for AB onto DC), never through O
        const onto = (a, b) => (Math.hypot(a.x1 - b.x1, a.y1 - b.y1) + Math.hypot(a.x2 - b.x2, a.y2 - b.y2) <= Math.hypot(a.x1 - b.x2, a.y1 - b.y2) + Math.hypot(a.x2 - b.x1, a.y2 - b.y1)
          ? b : Object.assign({}, b, { x1: b.x2, y1: b.y2, x2: b.x1, y2: b.y1 }));
        // (one pair at a time, each given the time to be seen through before the next begins)
        // (the pair being compared lights, the others stay quiet; the first side's length rides with its copy and lands
        // on the opposite's - the same value)
        const lab = (k1, k2) => { const L = this.lenAt || {}, a = L[k1] && this.boardToStage(L[k1]), b = L[k2] && this.boardToStage(L[k2]);
          return a && b && !/ off\b/.test(L[k1].cls) ? { t: L[k1].t, from: a, to: b, px: 24 * (this.sceneFit(this.cur()).k || 1), col: k1 === 'AB' || k1 === 'CD' ? '#1656e0' : '#00806d' } : null; };
        // (a cue's tags: the pair's tag is built as its slide lands)
        const tagAt = (i, when) => { if (c.tags && c.tags[i]) this.tm(() => { if (tok === this.stepTok && this.state.chips.every((x) => x.t !== c.tags[i].t)) this.buildTag(c.tags[i]); }, when); };
        // (each copy lifts off with a glint and fits its pair with a soft snap)
        const fitSound = (when) => this.tm(() => { if (tok === this.stepTok) this.sfx('snap', { v: 0.6 }); }, when);
        // (the pair is traced first - its light runs along both - and once it has settled the copy slides across)
        const TR = 1100;
        if (c.match) pairs(c.match).forEach((pr, i) => { this.tm(() => { if (tok === this.stepTok) { this.setState({ glow: pr }); this.sfx('glint', { v: 0.8 }); } }, at);
          this.tm(() => { if (tok === this.stepTok) { const a = seg(pr[0]); Motion.slideMatch(a, onto(a, seg(pr[1])), null, lab(pr[0], pr[1])); } }, at + TR); fitSound(at + TR + 1350); tagAt(i, at + TR + 1450); at += TR + 2500; });
        if (c.match) this.tm(() => { if (tok === this.stepTok) this.setState({ glow: null }); }, at + 800);
        if (c.matchAng) pairs(c.matchAng).forEach((pr, i) => { this.tm(() => { if (tok === this.stepTok) { this.sfx('glint', { v: 0.8 }); Motion.spinMatch(this.fxWedge(S, pr[0]), this.fxWedge(S, pr[1]), null); } }, at); fitSound(at + 1550); tagAt(i, at + 1700); at += 2700; }); // (along the diagonal: inside the shape)
        // a diagonal's halves: a copy of one slides along the diagonal onto the other (A->O onto O->C: no turn, it stays
        // on its line) and fits it exactly, in their colour, the two halves standing out while it does
        const halfCol = (k) => PAL[(this.fl().halfPairs || this.fl().pairSeq ? { A: 'vA', C: 'vA', B: 'vB', D: 'vB' } : { A: 'vA', B: 'vB', C: 'vC', D: 'vD' })[k]];
        if (c.halfSlide) pairs(c.halfSlide).forEach((pr, i) => { this.tm(() => { if (tok === this.stepTok) { this.emphasize(['h' + pr[0], 'h' + pr[1]], { ['h' + pr[0]]: [pr[0], 'O'], ['h' + pr[1]]: ['O', pr[1]] }); // (their light runs the way the copy slides: A to O, then on from O to C)
          this.sfx('glint', { v: 0.8 }); Motion.slideMatch({ x1: S[pr[0]].x, y1: S[pr[0]].y, x2: S.O.x, y2: S.O.y }, { x1: S.O.x, y1: S.O.y, x2: S[pr[1]].x, y2: S[pr[1]].y }, halfCol(pr[0])); } }, at); fitSound(at + 1350); tagAt(i, at + 1450); at += 2500; });
        // the screen stays until the last of them has been seen through (flow: seqEnd)
        if (at) this.busyFor(at + (c.tags ? 2600 : 0));
      }
    }
    if (c.chip) this.addChips([c.chip]);
    if (c.chips) this.addChips(c.chips); // (several cards on one word, a beat apart: css .chip.cd1-.cd3)
    if (c.merge) this.tagStep(() => this.mergeTags(c.merge.from, c.merge.into), 1500); // (tags that make one idea: into it)
    if (c.glow) { this.sfx('glint', { v: 0.9 }); this.busyFor(1100); } // a side (or the outline) lights up on its word: its light runs
    if (c.glow !== undefined) this.setState({ glow: c.glow, chipHi: c.hi || null });
    else if (c.hi !== undefined) this.setState({ chipHi: c.hi || null }); // (a card that lifts on its word, the shape left calm)
    if (c.pulse) Motion.pop((P.A.x + P.B.x + P.C.x + P.D.x) / 4, (P.A.y + P.B.y + P.C.y + P.D.y) / 4);
    if (c.ms) this.tm(() => { if (tok === this.stepTok) this.setState({ glow: null, chipHi: null }); }, c.ms);
  }
  // A matched pair's proof, in its own answer boxes (n: the pair): its two halves light, and their lengths jump from
  // the shape into the boxes, which read them ("2.9 cm = 2.9 cm") a moment and settle back into the names ("OA = OC")
  // - the name tags' number jump, without a second card repeating the boxes
  pairJump(n) {
    const tok = this.stepTok, FD = this.fillDef(), F = this.state.fill, ids = FD.blanks.filter((b) => b.pair === n).map((b) => b.id);
    const parts = ids.map((id) => ({ id: id, p: this.tagPart(F.at[id] || '') }));
    this.emphasize(parts.map((x) => 'h' + (F.at[x.id] || '').replace('O', '')));
    this.setState({ boxHi: n }); this.tm(() => { if (tok === this.stepTok) this.setState({ boxHi: null }); }, 1700);
    const show = () => {
      if (tok !== this.stepTok) return;
      const val = Object.assign({}, this.state.boxVal), back = Object.assign({}, this.state.boxBack);
      parts.forEach((x) => { val[x.id] = x.p.text; delete back[x.id]; });
      this.setState({ boxVal: val, boxBack: back }); this.sfx('pop', { v: 0.7 });
      this.tm(() => {
        if (tok !== this.stepTok) return;
        const v = Object.assign({}, this.state.boxVal), b = Object.assign({}, this.state.boxBack);
        ids.forEach((id) => { delete v[id]; b[id] = 1; });
        this.setState({ boxVal: v, boxBack: b });
      }, 1400);
    };
    const stage = typeof document !== 'undefined' && document.querySelector('.stage');
    if (!window.Motion || Motion.reduced || !stage || !parts.every((x) => x.p.val)) { show(); return; }
    parts.forEach((x, k) => {
      const b = this.elBox(stage.querySelector('[data-blank="' + x.id + '"]')), from = this.boardToStage(x.p.at);
      if (!b || !from) { if (k) show(); return; }
      this.tm(() => { if (tok === this.stepTok) Motion.flyValue(x.p.text, from, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, k ? show : null, 'src'); }, k * 180);
    });
  }
  // a screen's tags come one at a time, each built from the shape (buildTag) and given its moment before the next
  addChips(cs) {
    // (a right answer's tags: the answers go first, then the tags come in their place)
    const st = this.cur();
    if (st && st.opts && this.state.done && !this.state.optsGone && (cs || []).some((c) => this.state.chips.every((x) => x.t !== c.t))) {
      // (tags already over the answers glide down into the room they leave first - css .chip-row, 0.7 s)
      const tok = this.stepTok, wait = 760; this.setState({ optsGone: true }); this.busyFor(wait + 20);
      this.tm(() => { if (tok === this.stepTok) this.addChips(cs); }, wait); return;
    }
    const have = this.state.chips.map((c) => c.t), add = (cs || []).filter((c) => have.indexOf(c.t) < 0);
    add.forEach((c) => this.tagStep(() => (this.state.chips.every((x) => x.t !== c.t) ? this.buildTag(c) : 0), this.tagMs(c)));
  }
  // tag moments take turns: each waits for the one before it (its build or merge, and a beat), so words that come close
  // together never pile tags up half-built; the screen waits for the last (busyFor)
  tagStep(fn, ms) {
    const tok = this.stepTok;
    if (this.tagTok !== tok) { this.tagTok = tok; this.tagFree = 0; }
    const start = Math.max(Date.now(), this.tagFree || 0);
    this.tagFree = start + ms + 300;
    this.busyFor(this.tagFree - Date.now());
    this.tm(() => { if (tok === this.stepTok) fn(); }, start - Date.now());
  }
  tagMs(c) { const T = this.tagParts(c.t, c.byName); return !T || c.pop ? CHIP_GAP : T.a.val && T.b.val ? (T.sum ? 3500 : 2800) : 1500; }
  // ---------- name tags, built from the shape ----------
  // A tag relating two parts of the shape (sides, angles, halves of a diagonal) is never just popped on: the two parts
  // send what they show - their values, or their names when none is on show - flying from the shape into the tag's
  // place; it comes in as they land, reading what the shape shows ("110° + 70°", then "= 180°"), and settles into what
  // it states ("∠A + ∠D = 180°"). opt.sumAt: when "= 180°" joins after it lands (a 180° demo's rim). A ∥ tag is about
  // the sides' directions, not their lengths: its sides always send their names (byName), never "6 cm ∥ 6 cm"
  tagPart(name, byName) {
    const P = this.shapeP(), f = this.fl(), st = this.cur(), mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    if (name[0] === '∠') {
      const k = name[1], on = !byName && !st.fig && (f.arcs || '').indexOf(k) >= 0 && !!(this.alabAt && this.alabAt[k]);
      return { text: on ? Math.round(this.vals(P)[k]) + '°' : name, val: on, at: on ? this.alabAt[k] : P[k] };
    }
    if (name.indexOf('O') >= 0) {
      const k = name.replace('O', ''), O = mid(P.A, P.C), on = !!(f.halves && (f.split || f.halfPairs));
      return { text: on ? this.cm(this.dist(O, P[k])) : name, val: on, at: mid(O, P[k]) };
    }
    const key = { AB: 'AB', BA: 'AB', BC: 'BC', CB: 'BC', CD: 'CD', DC: 'CD', DA: 'DA', AD: 'DA' }[name], Lb = this.lenAt && this.lenAt[key];
    const on = !byName && !!(Lb && !/ off\b/.test(Lb.cls));
    return { text: on ? Lb.t : name, val: on, at: on ? { x: Lb.x, y: Lb.y } : mid(P[name[0]], P[name[1]]) };
  }
  tagParts(t, byName) {
    const m = /^(∠[A-D]|[A-DO][A-DO]) (∥|=|\+) (∠[A-D]|[A-DO][A-DO])( = 180°)?$/.exec(String(t || '').trim());
    return m ? { a: this.tagPart(m[1], byName || m[2] === '∥'), op: m[2], b: this.tagPart(m[3], byName || m[2] === '∥'), sum: !!m[4] } : null;
  }
  setTag(t, o) { this.setState({ chips: this.state.chips.map((c) => (c.t === t ? Object.assign({}, c, o) : c)) }); }
  tagCentre(t) {
    // (a card by its English, data-t: its label is in the player's language)
    const stage = typeof document !== 'undefined' && document.querySelector('.stage'), el = stage && stage.querySelector('.chip[data-t="' + t + '"]');
    if (!el) return null;
    const sr = stage.getBoundingClientRect(), z = sr.width / 1280 || 1, r = el.getBoundingClientRect();
    return { x: (r.left - sr.left + r.width / 2) / z, y: (r.top - sr.top + r.height / 2) / z };
  }
  buildTag(c, opt) {
    opt = opt || {};
    const tok = this.stepTok, T = this.tagParts(c.t, c.byName), name = /\bname\b/.test(c.k);
    if (!T || c.pop || !window.Motion || Motion.reduced || typeof document === 'undefined') {
      this.setState({ chips: this.state.chips.concat([Object.assign({}, c, { landed: 1 })]) }); this.sfx(name ? 'chime' : 'pop', { v: 0.6 }); return CHIP_GAP;
    }
    const num = T.a.val && T.b.val ? T.a.text + ' ' + T.op + ' ' + T.b.text : null, sumAt = opt.sumAt || 600;
    const show = (s, after) => this.tm(() => { if (tok === this.stepTok) this.setTag(c.t, { show: s, morph: ((this.state.chips.find((x) => x.t === c.t) || {}).morph || 0) % 2 + 1 }); }, after);
    this.setState({ chips: this.state.chips.concat([Object.assign({}, c, { show: num || c.t, arriving: 1 })]) }, () => {
      if (tok !== this.stepTok) return;
      const to = this.tagCentre(c.t);
      const land = () => {
        if (tok !== this.stepTok) return;
        this.setTag(c.t, { arriving: 0, landed: 1 }); this.sfx('pop', { v: 0.7 });
        if (num && T.sum && opt.sumWord) { // ("= 180°" joins as the voice says 180 - at once if it has said it already)
          const join = () => { if (tok === this.stepTok) { show(num + ' = 180°', 0); show(c.t, 1300); } };
          if (this.sumSaid) join(); // (the word came while its numbers were flying: it lands complete)
          else { this.sumWait = join; this.tm(() => { if (this.sumWait === join) { this.sumWait = null; join(); } }, sumAt); }
        } else if (num && T.sum) { show(num + ' = 180°', sumAt); show(c.t, sumAt + 1300); } else if (num) show(c.t, 1300);
      };
      if (!to) { land(); return; }
      [T.a, T.b].forEach((p, k) => this.tm(() => { if (tok === this.stepTok) Motion.flyValue(p.text, this.boardToStage(p.at) || to, to, k ? land : null, 'src'); }, k * 180));
    });
    return 1300 + (num ? (T.sum ? sumAt + 1300 : 1300) : 0);
  }
  // tags that together make one idea merge into it: they slide together along the row into the new tag's place, which
  // comes in as they arrive (screen 9: AB ∥ CD and AD ∥ BC make the parallelogram)
  mergeTags(from, into, pts) {
    const tok = this.stepTok, had = this.state.chips.some((c) => c.t === into.t);
    const src = pts || from.map((t) => ({ t: t, p: this.tagCentre(t) })).filter((x) => x.p); // (pts: from elsewhere - boxMerge)
    const rest = this.state.chips.filter((c) => from.indexOf(c.t) < 0).map((c) => (c.t === into.t ? Object.assign({}, c, { arriving: 1, landed: 0, kept: 0 }) : c));
    const chips = had ? rest : rest.concat([Object.assign({}, into, { arriving: 1 })]);
    if (!window.Motion || Motion.reduced || !src.length) { this.setState({ chips: chips.map((c) => Object.assign({}, c, { arriving: 0 })) }); return CHIP_GAP; }
    this.setState({ chips: chips }, () => {
      if (tok !== this.stepTok) return;
      const to = this.tagCentre(into.t);
      const land = () => { if (tok !== this.stepTok) return; this.setTag(into.t, { arriving: 0, landed: 1 }); this.sfx(/\bname\b/.test(into.k) ? 'chime' : 'pop', { v: 0.7 }); };
      if (!to) { land(); return; }
      // (they slide together along the row into it, side by side at once - a merge, not a leap)
      src.forEach((x, k) => { if (tok === this.stepTok) Motion.slideValue(x.t, x.p, to, k === src.length - 1 ? land : null, 'src tag merge'); });
    });
    return 1500;
  }
  // the tags a screen starts with: the screen before's that it shows too, where they are (no second entrance, in this
  // screen's look); the others go with the screen they belonged to
  carryChips(st) {
    const want = {}, take = (cs) => (cs || []).forEach((c) => { want[c.t] = c; });
    (st.lines || []).concat(st.after || []).forEach((Ln) => {
      if (!Ln.tagsWithSupp) take(Ln.chips); // (tags built with the screen's demos start fresh, each with its own demo)
      const visit = (c) => { // (and the tags made inside a cue's steps)
        if (c.chip) take([c.chip]);
        take(c.tags);
        if (c.merge) { c.merge.from.forEach((t) => { want[t] = want[t] || { t: t, k: ((this.state.chips || []).find((x) => x.t === t) || {}).k || 'white' }; }); take([c.merge.into]); }
        (c.steps || []).forEach(visit);
      };
      (Ln.cues || []).forEach(visit);
    });
    take(st.enterChips);
    return (this.state.chips || []).filter((c) => want[c.t] && !c.arriving).map((c) => ({ t: c.t, k: want[c.t].k, kept: 1 }));
  }
  replay() {
    if (!this.state.started || !this.curLine) return;
    this.poke();
    this.interject(this.curLine);
  }

  // ---------- idle hints ----------
  // A quiet spell brings the pointing hand (armHand), never the voice again: an instruction is said once, as its screen
  // opens (as in Fishing Frenzy's lesson)
  armIdle() { this.armHand(); }
  poke() { this.hideHand(); this.armIdle(); }

  // ---------- hand nudge ----------
  // After CONFIG.hand.idleMs with no touch while a tap or drag is expected, a hand shows exactly where
  // (and, for drags, which way). Any touch hides it and restarts the wait. On checks it never points at an
  // answer: the open options pulse together instead.
  handTarget() {
    const st = this.cur(), s = this.state, P = s.P;
    if (!s.started || st.end || s.done || s.revealing) return null;
    const t = st.task;
    if (t === 'tapEq') { // never the answer: the hand taps on every angle still to try, one after another
      const ks = ['A', 'B', 'C', 'D'].filter((k) => k !== st.ref && !s.ang[k]);
      return ks.length ? { qa: 'vtx-' + ks[0], kind: 'tap hop', ks: ks } : null;
    }
    if (t === 'connect') { // from a corner toward its opposite corner
      const a = s.diag.AC ? 'B' : 'A', b = this.opp(a), L = this.dist(P[a], P[b]) || 1, k2 = Math.min(130, L * 0.6) / L;
      return { qa: 'vtx-' + a, kind: 'drag', dx: Math.round((P[b].x - P[a].x) * k2), dy: Math.round((P[b].y - P[a].y) * k2) };
    }
    // segments are dragged: the hand lifts a blank tile from among the free ones up into the box to fill (from among
    // them, never from one: that would give the answer); a number box is tapped
    if (st.fill && this.fillDef().match) { const b = this.activeBlank(); return b ? { qa: 'blank-' + b, kind: 'drag', fromTiles: 1 } : null; }
    if (st.fill) return { qa: 'blank-' + this.activeBlank(), kind: 'tap' }; // never a tile: that would give the answer
    if (t === 'dragB') { // B slides toward its place (never further than 70 px, so the hand never gives the answer away)
      const dx = P.C.x + (P.A.x - P.D.x) - P.B.x;
      return { qa: 'vtx-B', kind: 'drag', dx: Math.abs(dx) < 12 ? 60 : Math.max(-70, Math.min(70, dx)), dy: 0 };
    }
    if (st.opts) return { kind: 'opts' };
    return null;
  }
  hideHand() { if (window.Motion && Motion.unghost) Motion.unghost(); if (this.state.hand) this.setState({ hand: null }); }
  armHand(extraMs) {
    if (this.state.hand) return; // already showing: only a touch (poke) or its own timer takes it down
    if (this.handId) { this.untm(this.handId); this.handId = null; }
    // handOnce: one demo gesture as the screen opens (not once the learner has touched the shape); after it, a learner
    // left stuck gets the hand back after the usual wait, as on every other screen
    const once = !!this.cur().handOnce && !this.state.done && !this.handShown && !this.touched;
    if (!this.handTarget() || (this.handShown || 0) >= CONFIG.hand.maxShows) return;
    const tok = this.stepTok;
    this.handId = this.tm(() => {
      this.handId = null;
      if (tok !== this.stepTok) return;
      // wait for Swiftee to finish and for hands to be off the board
      if (this.state.talking || this.drag || (this.conn && this.conn.live) || this.walking || (this.state.fill || {}).open) { this.armHand(); return; } // (never over a drag or a line being drawn)
      if (once && this.touched) { this.armHand(); return; }
      const T = this.handTarget();
      if (!T) return;
      let hand = { kind: T.kind, x: 0, y: 0, dx: T.dx || 0, dy: T.dy || 0, n: (this.handShown || 0), once: once, ks: T.ks || null };
      if (T.qa) {
        if (typeof document === 'undefined') return;
        const el = document.querySelector('[data-qa="' + T.qa + '"]'), stage = document.querySelector('.stage');
        if (!el || !stage) return;
        const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect(), sc = sr.width / 1280 || 1;
        if (!r.width && !r.height) return;
        hand.x = Math.round((r.left + r.width / 2 - sr.left) / sc);
        hand.y = Math.round((r.top + r.height / 2 - sr.top) / sc);
        // near the bottom edge the hand would run off the stage: it stays upright and presses the target's top part instead
        if (hand.y + 75 > 715 && !T.fromTiles) hand.y = Math.round((r.top - sr.top) / sc) + 12;
        if (T.fromTiles) { // (it starts among the free tiles, and carries one to the box)
          const free = [...stage.querySelectorAll('.tile:not(.used)')].map((x) => x.getBoundingClientRect()).filter((x) => x.width);
          if (!free.length) return;
          const fx = Math.round((free.reduce((a, x) => a + x.left + x.width / 2, 0) / free.length - sr.left) / sc), fy = Math.round((free[0].top + free[0].height / 2 - sr.top) / sc);
          hand.dx = hand.x - fx; hand.dy = hand.y - fy; hand.x = fx; hand.y = fy;
          hand.pill = { w: Math.round(free[0].width / sc), h: Math.round(free[0].height / sc) };
        }
      }
      this.handShown = (this.handShown || 0) + 1;
      this.setState({ hand: hand });
      if (hand.kind === 'drag' && window.Motion) { // (a ghost of what moves goes with the hand: B alone - no dashed sides - or the line being drawn)
        const st = this.cur(), cycles = once ? 1 : Math.ceil(CONFIG.hand.showMs / 2100);
        Motion.ghostDrag({ x: hand.x, y: hand.y }, hand.dx, hand.dy, [], st.task === 'connect', cycles, hand.pill);
      }
      // (the angles to try: the hand presses each in turn, a whole tap - lift, press, ring - on one before it hops to the
      // next, between presses (css handTap, 1.4 s), in time with their pulse)
      if (T.ks) T.ks.forEach((k, i) => this.tm(() => {
        if (tok !== this.stepTok || !this.state.hand) return;
        const el = typeof document !== 'undefined' && document.querySelector('[data-qa="vtx-' + k + '"]'), stage = document.querySelector('.stage');
        if (el && stage) { const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect(), sc = sr.width / 1280 || 1;
          this.setState({ hand: Object.assign({}, this.state.hand, { x: Math.round((r.left + r.width / 2 - sr.left) / sc), y: Math.round((r.top + r.height / 2 - sr.top) / sc) }) }); }
      }, i * 1400));
      // a few presses, then step back; it returns only if the learner is still idle
      this.handId = this.tm(() => { this.handId = null; if (tok === this.stepTok) { if (window.Motion && Motion.unghost) Motion.unghost(); this.setState({ hand: null }, () => this.armHand()); } }, once ? CONFIG.hand.onceMs : CONFIG.hand.showMs);
    }, (once ? CONFIG.hand.onceDelayMs : CONFIG.hand.idleMs) + (extraMs || 0));
  }
  // Browsers only allow audio after a user gesture, so the first tap unlocks it.
  rootDown(e) {
    const t = e && e.target, F = this.state.fill;
    if (F && F.open && !(t && t.closest && (t.closest('.dd-menu') || t.closest('.blank')))) this.ddClose();
    this.unlockAudio(); if (window.VO) VO.unlock(); if (this.state.started) this.poke(); }
  unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      // in the journey: the shell's context, unlocked by its Play tap (shell/bridge.js)
      if (!this.actx) this.actx = (JOURNEY && JOURNEY.audioContext()) || (AC ? new AC() : null);
      if (this.actx && this.actx.state === 'suspended') this.actx.resume();
    } catch (e) {}
    this.loadSounds();
  }

  // ---------- flow ----------
  start() {
    if (this.state.started && this.state.step === 0 && Date.now() - (this.navAt || 0) < 800) return;
    this.openNow(); // direct entry routes land on the stable lesson card
    this.unlockAudio();
    if (window.VO) VO.unlock(); // the first tap (rootDown) unlocks the voice-over
    const s = this.synth();
    if (s) { this.pickVoice(); try { s.onvoiceschanged = () => this.pickVoice(); } catch (e) {} }
    this.snaps = {};
    this.setState(this.fresh(true), () => this.pauseUi()); // (the pause button comes with the lesson)
    this.goTo(0, true);
  }
  restart() { this.navAt = 0; this.start(); }
  // The learner's tap unlocks sound, then a lanternfish parade forms the lesson card before Swiftee arrives.
  begin() {
    if (this.state.started || this.state.opening) return;
    this.unlockAudio();
    if (window.VO) VO.unlock();
    if (!window.Opening || this.state.opened) { this.start(); return; }
    this.setState({ opening: true, line: '' });
    Opening.play((k) => this.sfx(k), () => {
      this.setState({ opened: true, opening: false }, () => this.arrive(() => { if (!this.state.started) this.start(); }));
    });
  }
  // straight to the open card (a jump to a screen, Next before the start)
  openNow() {
    if (this.state.opened) return;
    if (window.Opening) Opening.instant();
    this.setState({ opened: true, opening: false });
  }
  // Swiftee arrives on the open card (as in Fishing Frenzy's lesson): she dives in from above it, then the lesson begins
  arrive(then) { this.pose('happy'); this.dive(then); }
  // Swiftee dives in: from above the card, tipped forward like a diver, she plunges down - fast at first, slowing as the
  // water takes her - rights herself and lands softly on her spot, a trail of bubbles rising behind her and a little
  // puff as she lands. then() once she has landed
  dive(then) {
    const sw = typeof document !== 'undefined' && document.querySelector('.stage .swiftee'), G = window.gsap;
    const done = () => { if (then) then(); };
    if (this.diveTl) { this.diveTl.kill(); this.diveTl = null; }
    if (!sw || !G || Motion.reduced) { done(); return; }
    const stage = document.querySelector('.stage'), tok = this.stepTok;
    const bubble = (x, y, r) => {
      if (!stage || tok !== this.stepTok) return;
      const b = document.createElement('div');
      b.className = 'dive-bub';
      Object.assign(b.style, { left: x + 'px', top: y + 'px', width: 2 * r + 'px', height: 2 * r + 'px' });
      stage.appendChild(b);
      setTimeout(() => b.remove(), 1300);
    };
    const at = () => { const b = this.elBox(sw.querySelector('.swiftee-still') || sw); return b ? { x: b.x + b.w / 2, y: b.y + b.h * 0.45 } : null; };
    sw.classList.add('flying'); // (no CSS transition smooths the dive)
    G.set(sw, { x: 150, y: -640, rotation: 38, scale: 0.9, opacity: 0, transformOrigin: '50% 50%' });
    this.setState({}); // (the plate goes as she sets off: narrLine)
    this.sfx('whoosh');
    let last = 0;
    this.diveTl = G.timeline({ onComplete: () => {
      this.diveTl = null;
      G.set(sw, { clearProps: 'transform,opacity' }); sw.classList.remove('flying');
      const p = at(); if (p) for (let i = 0; i < 6; i += 1) bubble(p.x + (Math.random() - 0.5) * 120, p.y + 70 + Math.random() * 30, 4 + Math.random() * 6); // the landing puff
      this.sfx('pop'); done();
    } })
      .to(sw, { y: 0, duration: 1.6, ease: 'power2.out', onUpdate: () => { // the trail
        const now = Date.now(); if (now - last < 70) return; last = now;
        const p = at(); if (p) bubble(p.x + (Math.random() - 0.5) * 50, p.y - 20, 3 + Math.random() * 6);
      } }, 0)
      .to(sw, { x: 0, duration: 1.6, ease: 'sine.out' }, 0)
      .to(sw, { opacity: 1, duration: 0.45, ease: 'sine.out' }, 0) // (she fades in as she comes: no pop)
      .to(sw, { rotation: -7, duration: 1.1, ease: 'power1.out' }, 0)
      .to(sw, { rotation: 0, duration: 0.5, ease: 'sine.inOut' }, 1.1)
      .to(sw, { scale: 1, duration: 1.3, ease: 'power2.out' }, 0);
  }
  // an element's box in stage px (the stage is drawn scaled to the window)
  elBox(el) {
    const stage = typeof document !== 'undefined' && document.querySelector('.stage');
    if (!el || !stage) return null;
    const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = sr.width / 1280 || 1;
    return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
  }
  clone(P) { return JSON.parse(JSON.stringify(P)); }
  goTo(i, fwd) {
    const st = this.steps()[i];
    if (!st) return;
    this.wantVoice(i);
    this.clearT();
    const was = this.state.started ? this.cur() : null;
    this.fromPlate = !!(was && this.isPlate(was)); // Swiftee was off that screen: where she is back, she dives in
    if (this.diveTl) { this.diveTl.kill(); this.diveTl = null; const sw = document.querySelector('.stage .swiftee'); if (sw && window.gsap) { gsap.set(sw, { clearProps: 'transform' }); sw.classList.remove('flying'); } }
    Motion.clear(); // the previous screen's animations stop and leave no inline styles behind
    if (window.Summary) Summary.stop(); // (the summary's layer, timers and Swiftee's place there)
    this.handId = null; this.handShown = 0; this.touched = false; this.sumSaid = false; this.sumWait = null;
    if (this.wk) this.wk.hide();
    if (this.aw) this.aw.cancel();
    this.stepTok++; this.narrTok++;
    this.q = null;
    this.cancelSpeech();
    this.drag = null; this.snapId = null; this.conn = null; this.fd = null; this.walking = false; this.navAt = Date.now();
    let P;
    if (fwd || !this.snaps[i]) { P = this.clone(this.state.P); this.snaps[i] = this.clone(P); }
    else P = this.clone(this.snaps[i]);
    this.setState({
      step: i, P: P, aFocus: null, done: !this.asks(st), listen: !!(st.lines || []).length && this.asks(st), fill: this.freshFill(), conn: null,
      lenOn: was && was.task === 'measure' ? { AB: 1, CD: 1, DA: 1, BC: 1 } : {}, endNext: false, sumNext: false, // (straight from the measuring walk the lengths stay up)
      supp: null, tap: {}, ang: {}, angIn: {}, diag: {}, chips: this.carryChips(st),
      moved: false, dragging: null, picks: {}, cfuFirst: true, hand: null, bubOff: false, glow: null, chipHi: null, emph: {}, askedAng: null, boxHi: null, boxVal: {}, boxBack: {}, boxGone: {}, hNum: {}, hMarks: {}, pairsIn: {}, optsGone: false, figIn: {}, oIn: false, landed: {}, parTmp: {}, meet: null, trace: null, build: null, measuring: null, tape: null, swAway: false, halvesIn: {}, line: '', reveal: 0, marked: {}, wrongs: 0, revealing: false
    });
    this.pose(this.restPose());
    this.setState({}, () => this.stepMotion(st)); // once the new screen is drawn
    // as in Fishing Frenzy, the answers (and the corner to drag) come in just after the screen does: the learner may act
    // while Swiftee is still asking, so nothing ever seems stuck waiting for her line to end
    // the answers (and the corner to drag) come in with the voice: as Swiftee says the question's last word they rise in,
    // one after another, so the learner hears what is asked before choosing. (A voice that stalls never holds them back
    // for long: CONFIG.flow.answersMaxMs.)
    this.askLine = this.asks(st) ? (st.lines || []).filter((x) => !x.keep && x.t).pop() || null : null;
    if (!!(st.lines || []).length && this.asks(st)) { const tok = this.stepTok; this.tm(() => { if (tok === this.stepTok && this.state.listen) this.askedNow(); }, CONFIG.flow.answersMaxMs); }
    const lines = () => this.playLines(st.lines, () => {
      if (this.state.listen) this.askedNow(); else this.armHand();
      if (st.task === 'measure' && st.auto) this.tm(() => this.autoMeasure(), 400);
      // screen 24: after her line her bubble fades, then she measures the angles with the protractor
      else if (st.task === 'measureAngles' && st.auto) this.tm(() => { this.setState({ bubOff: true }); this.tm(() => this.autoAngles(), 400); }, CONFIG.angleWalk.leadMs);
      // the journey's last screen: Next comes up under Swiftee (as in Fishing Frenzy); its tap takes the journey on
      else if (st.end && JOURNEY) { this.setState({ endNext: true }); this.sfx('pop'); }
      else if (st.summary && window.Summary) Summary.start(this); // the summary: the ideas one by one, then Next
      else this.maybeAdvance(true);
    });
    // voiceDelay (ms): Swiftee waits for the screen's opening animation before she speaks (screen 3: the assembly);
    // back on the card after screens without her (the measuring walk, the goodbye) she dives in first, then speaks
    const speak = () => { if (st.voiceDelay) this.tm(lines, st.voiceDelay); else lines(); };
    // the summary: Swiftee rises into the middle of the card first, and speaks once she is up
    if (st.summary && window.Summary) { const tok = this.stepTok; Summary.enter(this, () => { if (tok === this.stepTok) speak(); }); }
    // (not when the screen opens with the narrator's line - 'Are the two segments of each diagonal equal?': the plate
    // stays, and she dives in on her own line, qNext - else she would be seen for a second and fade as the plate came)
    else if ((st.hero && JOURNEY) || (this.fromPlate && !this.isPlate(st) && !((st.lines || [])[0] || {}).narr)) { const tok = this.stepTok; this.setState({}, () => this.dive(() => { if (tok === this.stepTok) speak(); })); } // (hero: she flies to centre stage first)
    else speak();
  }
  // the summary's Next: the learner moves on when they choose (a replaying idea finishes first) - to the last screen,
  // Swiftee's closing words; in the journey its own Next then hands over to the fishing (endNext)
  sumNextGo() {
    if (!this.state.sumNext || !window.Summary || !Summary.canLeave()) return;
    Summary.leave();
    this.sfx('tap');
    this.setState({ sumNext: false });
    if (JOURNEY && !this.handedOff) { this.handOff(); return; } // (the journey: the recap's Next bursts the bubble; the wave brings Popo, and Swiftee comes with her welcome)
    this.maybeAdvance(false);
  }
  finishTask() {
    if (this.state.done) return;
    this.setState({ done: true, hand: null, listen: false }); // task done: the hand has nothing left to point at
    this.armIdle();
    const st = this.cur();
    const shown = this.state.revealing; // (the answer was shown, not found: a soft sound, no confetti, its own lines)
    if (st.auto) { this.sfx('good'); this.react(CONFIG.swiftee.praise); } // played by itself: no learner action to celebrate
    else if (shown) this.sfx('pop');
    else this.cheer();
    const after = shown && st.answerAfter ? st.answerAfter : st.after;
    if (after) this.playLines(after, () => this.maybeAdvance(true));
    else this.maybeAdvance(false);
  }
  // okGlow: once answered right, each listed side pair pulses in turn (e.g. AB + CD, then AD + BC), then settles;
  // it starts as the right answer has reached the centre (soloOk) so the eye goes answer -> shape
  okGlow(st) {
    const seq = st.okGlow, tok = this.stepTok, ms = 950;
    if (!seq) return;
    seq.forEach((pair, i) => this.tm(() => { if (tok === this.stepTok) this.setState({ glow: pair }); }, 550 + i * ms));
    this.busyFor(550 + seq.length * ms);
    this.tm(() => { if (tok === this.stepTok) this.setState({ glow: null }); }, 550 + seq.length * ms);
  }
  // every correct learner action: the correct sound and one confetti burst from the top, together, then praise
  // a right answer's bubbles where it was given: at an element (its centre) or a board point
  popAt(where) {
    if (!window.Motion || !where || typeof document === 'undefined') return;
    let p = null;
    if (where.getBoundingClientRect) { const b = this.elBox(where); p = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; }
    else p = this.boardToStage(where);
    if (p) { Motion.bubblePop(p.x, p.y); this.sfx('bubbles', { v: 0.8 }); }
  }
  cheer() {
    this.sfx('good');
    if (window.Confetti && !this.cur().calmOk) window.Confetti.burst(); // calmOk: sound and praise only
    this.react(CONFIG.swiftee.praise);
  }
  // an animation running for ms from now: nothing new starts until CONFIG.flow.restMs after it (seqEnd, read by the line
  // queue and by maybeAdvance)
  busyFor(ms) { this.seqEnd = Math.max(this.seqEnd || 0, Date.now() + Math.max(0, ms) + CONFIG.flow.restMs); }
  // A finished screen moves on by itself: CONFIG.flow.advanceMs (or the step's autoNext) after the last line ends.
  // Called whenever narration goes quiet; does nothing until the screen's task/check is done. Lesson complete stays,
  maybeAdvance(afterLine) {
    if (this.advId) { this.untm(this.advId); this.advId = null; }
    const st = this.cur(), i = this.state.step, tok = this.stepTok;
    if (!this.state.done || st.end || i >= this.steps().length - 1) return;
    // a running sequence (lengths pair by pair, supplementary pairs) finishes before the screen moves on
    const wait = Math.max(st.autoNext != null ? st.autoNext : CONFIG.flow.advanceMs, (this.seqEnd || 0) - Date.now());
    this.advId = this.tm(() => {
      this.advId = null;
      // someone is talking again (a tip, a hint): that line's end schedules the move afresh
      if (tok !== this.stepTok || this.state.talking || this.drag) return;
      const bd = this.state.build; // a building shape (screen 1) finishes its outline glow and fill fade first
      if (st.build && !(bd && bd.done && !bd.settle)) { this.maybeAdvance(false); return; }
      this.goTo(i + 1, true);
    }, Math.max(0, wait - (afterLine ? 420 : 0))); // a finished line has already paused 420 ms
  }
  // a wrong tap or line: the incorrect sound and Swiftee's tip (m: her pose; null keeps it). The same tip still being
  // said is not started over: the wrong move gets only its sound
  oops(text, m) {
    this.sfx('bad');
    if (this.state.talking && this.curLine && this.curLine.t === text) return;
    this.interject({ m: m === undefined ? CONFIG.swiftee.wrong : m, t: text, fb: 1 });
  }


  // ---------- measuring ----------
  // measuring goes one side at a time, clockwise from the top; a screen measuring the diagonals' halves (segs) walks
  // each diagonal in turn, A to O to C, then B to O to D
  measureOrder() { return this.cur().segs ? ['OA', 'OC', 'OB', 'OD'] : ['AB', 'BC', 'CD', 'DA']; }
  activeSide() {
    const s = this.state;
    if (this.cur().task !== 'measure' || s.done || s.measuring) return null;
    return this.measureOrder().find((k) => !s.tap[k]) || null;
  }
  // Screen 13: Swiftee flies onto the shape and walks each side with her tape measure, A -> B -> C -> D -> A.
  // Without a page (headless test) the same steps run on timers.
  walkEnds(leg) {
    const P = this.state.P, O = { x: (P.A.x + P.C.x) / 2, y: (P.A.y + P.C.y) / 2 };
    return { AB: [P.A, P.B], BC: [P.B, P.C], CD: [P.C, P.D], DA: [P.D, P.A], OA: [P.A, O], OC: [O, P.C], OB: [P.B, O], OD: [O, P.D] }[leg];
  }
  // The board's own px <-> the page (client px), read off two unseen probe squares the board carries, at (0, 0) and
  // (100, 100): their client boxes include every transform on the way - the board's zoom and glide, the stage's fit to
  // the window. Not getScreenCTM: Safari works that out without the CSS transforms on the svg and the page around it,
  // which put everything drawn over the shape (lines carried on, a drag's ghost, the measuring walk, the tags' and the
  // answers' jumps, a slide onto the opposite side) off it, and a drag off the finger. { x0, y0, sx, sy }: client =
  // x0 + board x * sx (the board is only ever moved and scaled, never turned).
  boardMap(svg) {
    if (typeof document === 'undefined') return null;
    svg = svg || document.querySelector('.stage svg[data-board]'); // (the board: its label is in the player's language)
    if (!svg) return null;
    let pr = svg.querySelector('g.probe');
    if (!pr) {
      pr = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      pr.setAttribute('class', 'probe'); pr.setAttribute('aria-hidden', 'true'); pr.setAttribute('visibility', 'hidden'); pr.setAttribute('pointer-events', 'none');
      [0, 100].forEach((v) => { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); ['x', 'y'].forEach((a) => r.setAttribute(a, v)); r.setAttribute('width', 1); r.setAttribute('height', 1); pr.appendChild(r); });
      svg.appendChild(pr);
    }
    const a = pr.children[0].getBoundingClientRect(), b = pr.children[1].getBoundingClientRect();
    const sx = (b.left - a.left) / 100, sy = (b.top - a.top) / 100;
    return sx && sy ? { x0: a.left, y0: a.top, sx: sx, sy: sy } : null;
  }
  boardToStage(p) {
    const M = this.boardMap(), stage = M && document.querySelector('.stage');
    if (!M || !stage) return null;
    const sr = stage.getBoundingClientRect(), k = sr.width / 1280 || 1;
    return { x: (M.x0 + p.x * M.sx - sr.left) / k, y: (M.y0 + p.y * M.sy - sr.top) / k };
  }
  stageToBoard(p) {
    const M = p && this.boardMap(), stage = M && document.querySelector('.stage');
    if (!M || !stage) return null;
    const sr = stage.getBoundingClientRect(), k = sr.width / 1280 || 1;
    return { x: (sr.left + p.x * k - M.x0) / M.sx, y: (sr.top + p.y * k - M.y0) / M.sy };
  }
  // screen 1 build: one continuous pen stroke round the outline (D->A->B->C->D) at a steady pace, eased in at the
  // start and out at the end only, so it runs through the corners without stopping. Then the outline glow settles
  // and the fill fades in.
  // ms: draw in this long (screen 1 sizes it to the spoken line, so the outline closes as Swiftee finishes).
  // Clocked by frames rather than a fixed tween, so rushBuild() can bring the end forward when the voice ends early.
  runBuild(ms) {
    const tok = this.stepTok, P = this.state.P, Bc = CONFIG.build;
    this.buildArmed = false;
    const total = this.dist(P.D, P.A) + this.dist(P.A, P.B) + this.dist(P.B, P.C) + this.dist(P.C, P.D);
    const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2; // sine in-out: eased at the start and the end only
    const B = this.bld = { t0: performance.now(), dur: ms || total / Bc.pxPerMs, from: 0, total: total };
    const l1 = this.dist(P.D, P.A), l2 = l1 + this.dist(P.A, P.B), corners = [l1, l2, l2 + this.dist(P.B, P.C)]; // A, B, C along the pen's path
    const frame = () => {
      if (tok !== this.stepTok || this.bld !== B) return;
      const t = Math.min(1, (performance.now() - B.t0) / B.dur), d = B.from + (total - B.from) * ease(t);
      // the pen reaches a corner (its dot appears): a soft tick
      const prevD = (this.state.build && this.state.build.d) || 0;
      corners.forEach((cd, i) => { if (prevD < cd && d >= cd) this.sfx('tick', { f: (window.Sfx ? Sfx.notes : [523.25, 659.25, 783.99, 1046.5, 1318.5])[i + 1] / 2, v: 0.8 }); });
      if (t < 1) { this.setState({ build: { d: Math.max(0.001, d), done: false } }); this.tm(frame, 16); return; }
      this.bld = null;
      this.setState({ build: { d: total, done: true, settle: true, fill: true }, trace: null }, () => Motion.settle());
      this.sfx('shimmer', { v: 0.9 }); // the outline closes: a soft bell shimmer as the glow settles and the fill fades in
      this.tm(() => { if (tok === this.stepTok) this.setState({ build: { d: total, done: true, settle: false, fill: true } }); }, Bc.settleMs);
    };
    frame();
  }
  // the voice has ended: finish the outline within rushMs from where the pen is now (no jump)
  rushBuild() {
    const B = this.bld;
    if (!B) return;
    const left = B.t0 + B.dur - performance.now(), rush = CONFIG.build.rushMs;
    if (left <= rush) return;
    B.from = (this.state.build && this.state.build.d) || 0; B.t0 = performance.now() - rush * 0.5; B.dur = rush * 1.5; // resume mid-curve: no restart ease
  }
  // what a screen animates once it is on screen (GSAP, js/motion.js)
  stepMotion(st) {
    if (st !== this.cur()) return;
    this.seqEnd = 0;
    if (st.lenSeq) {
      st.lenSeq.forEach((q) => this.tm(() => {
        const on = this.state.lenOn || {}, fresh = q[1].some((k) => !on[k]); // (already up: only the pair's glow)
        if (fresh) this.setState({ lenOn: Object.assign({}, on, q[1].reduce((o, k) => { o[k] = 1; return o; }, {})) });
        this.emphasize(q[1]); if (fresh) this.sfx('pop');
      }, q[0] + (st.voiceDelay || 0)));
      this.busyFor(st.lenSeq[st.lenSeq.length - 1][0] + 400);
    }
    const sp = (st.f || {}).supp;
    if (sp) {
      const ms = CONFIG.supp.stepMs;
      // (each pair's equation card, where the screen has them, lifts while its own pair is shown: one equation at a time)
      const L0 = (st.lines || [])[0] || {}, eqs = L0.chips || [], own = L0.tagsWithSupp && eqs.length === sp.length; // (each pair's tag comes with its demo)
      sp.forEach((pair, i) => this.tm(() => {
        this.setState({ supp: i, chipHi: eqs.length === sp.length && !own ? eqs[i].t : null }); this.emphasize(['a' + pair[0], 'a' + pair[1]]); this.sfx('pop');
        if (own) this.tm(() => { if (st === this.cur() && this.state.chips.every((x) => x.t !== eqs[i].t)) this.buildTag(eqs[i], { sumAt: 2300, sumWord: !i }); }, i ? 400 : 0); // ("= 180°" as the rim closes; the first as the voice says 180)
      }, (i ? 500 : 150) + i * ms)); // (the first at once, so its tag is in by the time the voice says 180)
      if (eqs.length === sp.length) this.tm(() => this.setState({ chipHi: null }), 500 + sp.length * ms);
      // (each step already holds its pair a while; tags built with the demos: the last one lands as its demo ends, so it
      // is given its rest too)
      this.busyFor(500 + sp.length * ms - CONFIG.flow.restMs + (own ? 2000 : 0));
    }
    if (st.build) {
      Motion.hideFill();
      this.buildArmed = true; // say() starts the pen the moment the voice starts (begin)
      this.tm(() => { if (this.buildArmed) this.runBuild(); }, CONFIG.build.delayMs + 2500 + (st.voiceDelay || 0));
    }
    if (st.enterChips) this.tm(() => this.addChips(st.enterChips), Motion.reduced ? 0 : 450); // the screen's cards come in
    (st.enterCues || []).forEach((c) => this.tm(() => { if (st === this.cur()) this.runCue(c); }, c.at0 || 0)); // (its moments before its line)
    // screen 2: the sides are counted one by one - as each number lands its side lights (the light runs along it once)
    // and stays lit, 1, 2, 3, 4, so the four sides build up; all four lit a moment, then the outline settles
    if (st.sideNums) {
      const order = ['DA', 'AB', 'BC', 'CD'], tok = this.stepTok;
      Motion.sideNums((i) => {
        if (tok !== this.stepTok) return;
        this.setState({ glow: order.slice(0, i + 1) });
        this.sfx('pop', { f: (window.Sfx ? Sfx.notes : [523.25, 659.25, 783.99, 1046.5, 1318.5])[i], v: 0.8 });
        if (i === order.length - 1) this.tm(() => { if (tok === this.stepTok) this.setState({ glow: null }); }, 1600);
      });
    }
    if (st.assemble) {
      const P = this.state.P;
      Motion.holdSmall((P.A.x + P.B.x + P.C.x + P.D.x) / 4, (P.A.y + P.B.y + P.C.y + P.D.y) / 4);
      // each side lands with a pop, rising C E G C; the outline glow settles with a shimmer
      Motion.assemble((i) => this.sfx('pop', { f: (window.Sfx ? Sfx.notes : [523.25, 659.25, 783.99, 1046.5, 1318.5])[i] }), () => this.sfx('shimmer', { v: 0.9 }));
    }
  }
  // screen 14: after her line Swiftee walks onto the shape and measures its sides one after another
  autoMeasure() {
    const tok = this.stepTok;
    const nextSide = () => {
      if (tok !== this.stepTok || this.state.done) return;
      const k = this.activeSide();
      if (k) this.measureLeg(k, nextSide);
    };
    this.tm(nextSide, Motion.reduced ? 50 : CONFIG.walker.startMs);
  }
  // where Swiftee's feet are (stage px), read from her element as Fishing Frenzy's lesson does, so the measuring walk
  // starts and ends exactly where she stands (a fixed spot left her jumping as the walker handed back to her)
  homeFeet() {
    const W = CONFIG.walker, el = typeof document !== 'undefined' && document.querySelector('.stage .swiftee'), b = el && this.elBox(el);
    const base = (window.SWIFTEE_MANIFEST && SWIFTEE_MANIFEST.baselineY && SWIFTEE_MANIFEST.baselineY.normalized) || 0.877;
    return b && b.h ? { x: b.x + b.w / 2, y: b.y + b.h * base } : { x: W.homeX, y: W.homeY };
  }
  measureLeg(leg, then) {
    const s = this.state;
    if (s.done || s.tap[leg] || this.walking) return;
    if (this.cur().task === 'measure' && leg !== this.activeSide()) return; // only the glowing side
    this.walking = true;
    this.setState({ measuring: leg, tape: { leg: leg, t: 0 }, hand: null });
    this.sfx('tap');
    const tok = this.stepTok, W = CONFIG.walker, ends = this.walkEnds(leg);
    const lenCm = this.dist(ends[0], ends[1]) / this.S;
    const walkMs = Math.max(900, lenCm * W.msPerCm);
    const wk = Motion.reduced ? null : this.walker(); // (reduced motion: the tape lays itself, as screen 24's angles do)
    const live = () => tok === this.stepTok;
    const arrive = () => {
      if (!live()) return;
      const tap = Object.assign({}, this.state.tap); tap[leg] = true;
      // the full tape stays laid on the side until the next side starts (no blink)
      this.setState({ tap: tap, tape: Object.assign({}, this.state.tape, { t: 1, tip: null }) }); // lets go: the tape lies flat
      this.sfx('pop');
      this.walking = false; this.walkAt = ends[1];
      if (this.measureOrder().every((k) => tap[k])) {
        // all four measured: fly home, then the screen carries on
        const home = () => { if (!live()) return; this.setState({ measuring: null, swAway: false, tape: null, bubOff: true }); if (wk) wk.hide(); this.pose(this.restPose()); this.tm(() => this.finishTask(), Motion.reduced ? 250 : CONFIG.walker.homeMs); };
        if (wk) { const from = () => this.boardToStage(ends[1]); this.tm(() => { if (live() && from()) wk.stroll(from, this.homeFeet(), W.size, W.homeSize, home); else home(); }, 450); }
        else this.tm(home, 450);
      } else {
        this.setState({ measuring: null }); // a short beat on the corner, then the next side
        if (then) this.tm(then, CONFIG.walker.pauseMs);
      }
    };
    const walkIt = () => {
      if (!live()) return;
      const from = () => this.boardToStage(ends[0]), to = () => this.boardToStage(ends[1]); // (live: the board may still be gliding into place)
      if (wk && from() && to()) wk.walk(from, to, walkMs, (t) => { if (live()) this.setState({ tape: { leg: leg, t: t, tip: this.stageToBoard(wk.tip()) } }); }, arrive);
      else this.tm(arrive, 300);
    };
    if (wk && !this.state.swAway) {
      // first side: she walks from her spot on the sand onto the side's first corner, shrinking to the shape's scale
      const to = () => this.boardToStage(ends[0]); // (live, as the walk's corners)
      this.setState({ swAway: true });
      if (to()) wk.stroll(this.homeFeet(), to, W.homeSize, W.size, walkIt); else walkIt();
    } else if (wk && this.walkAt && this.dist(this.walkAt, ends[0]) > 1) {
      // the next half starts where the last did not end (C, then B): she walks over to it first
      const from = this.walkAt, a = () => this.boardToStage(from), b = () => this.boardToStage(ends[0]);
      if (a() && b()) wk.stroll(a, b, W.size, W.size, walkIt); else walkIt();
    } else walkIt();
  }
  walker() {
    if (typeof document === 'undefined' || !window.SwifteeWalker || !document.querySelector('.walker')) return null;
    return this.wk || (this.wk = new window.SwifteeWalker(CONFIG.swiftee.base));
  }  // Screen 24: Swiftee carries a protractor round A, B, C, D (js/angle-walker.js, as in Fishing Frenzy's lesson): each
  // angle is traced on the protractor in its own colour while its size counts up where its label goes, and comes in as
  // she lifts the protractor off it; then she walks home and the screen moves on. With reduced motion, or no page, all
  // four come in at once.
  autoAngles() {
    const tok = this.stepTok, live = () => tok === this.stepTok && !this.state.done;
    if (!live()) return;
    const keys = ['A', 'B', 'C', 'D'], P = this.state.P, aw = this.angleWalker(), PAL = CONFIG.palette;
    const verts = aw ? keys.map((k) => this.boardToStage(P[k])) : [];
    const end = () => { if (live()) this.finishTask(); };
    const show = (ks) => { this.setState({ angIn: Object.assign({}, this.state.angIn, ks.reduce((o, k) => { o[k] = 1; return o; }, {})) }); this.sfx('pop'); };
    if (!aw || Motion.reduced || verts.some((v) => !v)) { show(keys); this.tm(end, 2600); return; }
    const o = this.boardToStage({ x: 0, y: 0 }), u = this.boardToStage({ x: 100, y: 0 }), k = Math.hypot(u.x - o.x, u.y - o.y) / 100; // board px -> stage px
    aw.start({
      verts: verts, home: this.homeBody(), homeEl: document.querySelector('.stage .swiftee'), colors: [PAL.vA, PAL.vB, PAL.vC, PAL.vD],
      radiusAt: (i) => ((this.arcR && this.arcR[keys[i]]) || 24) * k, // the angle mark's own radius
      labelPx: 21, // its value's size (css .tag.alab: 21 px on screen at any zoom)
      labelAt: (i) => (this.alabAt && this.alabAt[keys[i]] ? this.boardToStage(this.alabAt[keys[i]]) : null), // where its size lands
      onReading: (i) => { if (live()) { show([keys[i]]); this.emphasize(['a' + keys[i]]); } },
      onDone: () => { if (live()) { this.pose(this.restPose()); this.tm(end, 200); } }
    });
  }
  angleWalker() {
    if (typeof document === 'undefined' || !window.AngleWalker || !window.AngleMeasuringFrames || !document.querySelector('.angle-walk')) return null;
    return this.aw || (this.aw = new window.AngleWalker());
  }
  // where Swiftee stands (her torso's centre, stage px) and her size there against her size with the protractor:
  // where the protractor walk starts and ends
  homeBody() {
    const el = typeof document !== 'undefined' && document.querySelector('.stage .swiftee .swiftee-still'), b = el && this.elBox(el);
    const k = CONFIG.angleWalk.homeK * (b ? b.h / 198 : 1); // homeK is for her full size (the still is 198 px tall)
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 + 14 * b.h / 198, k: k } : { x: CONFIG.walker.homeX + 3, y: CONFIG.walker.homeY - 95, k: k };
  }


  // ---------- geometry ----------
  dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
  // a parallelogram: the top side is as long as the bottom one (both stay level, so then BC is parallel to AD too)
  isPg(P) { return Math.abs((P.B.x - P.A.x) - (P.C.x - P.D.x)) < 1; }
  nb(k) { return { A: ['D', 'B'], B: ['A', 'C'], C: ['B', 'D'], D: ['C', 'A'] }[k]; }
  angle(P, k) {
    const n = this.nb(k), V = P[k], p = P[n[0]], q = P[n[1]];
    const ux = p.x - V.x, uy = p.y - V.y, vx = q.x - V.x, vy = q.y - V.y;
    const c = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }
  vals(P) {
    const a = Math.round(this.angle(P, 'A')), b = Math.round(this.angle(P, 'B'));
    return { A: a, D: 180 - a, B: b, C: 180 - b };
  }
  cm(px) {
    const v = Math.round((px / this.S) * 10) / 10;
    return (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)) + ' cm';
  }
  // a pointer's place on the board (board px), as boardMap reads the board (not getScreenCTM: Safari)
  toSvg(svg, e) {
    const M = this.boardMap(svg);
    return M ? { x: (e.clientX - M.x0) / M.sx, y: (e.clientY - M.y0) / M.sy } : null;
  }
  // the corner the learner can drag: B, until BC is parallel to AD
  dragKey() { return this.cur().task === 'dragB' && !this.state.done && !this.state.revealing ? 'B' : null; }
  // ---------- lesson interactions ----------
  // tapEq: tap the corner whose angle equals the one named (want); a wrong corner gets the screen's tip
  tapVertex(k) {
    const st = this.cur(), s = this.state;
    if (s.done || this.busy() || st.task !== 'tapEq' || this.solved === this.stepTok) return;
    if (s.ang[k]) return;
    if (k !== st.want) return this.oops(st.wrong); // (its own corner too: the tip says where to look)
    this.solved = this.stepTok; // right: no tap after it counts as wrong while the screen finishes
    this.setState({ ang: Object.assign({}, s.ang, { [k]: true }) });
    this.sfx('pop'); this.popAt(this.shapeP()[k]);
    this.tm(() => this.finishTask(), 250);
  }
  down(k, e) {
    if (this.cur().task === 'connect') return this.connDown(k, e);
    if (this.dragKey() !== k || this.busy()) return;
    const svg = e.currentTarget && e.currentTarget.ownerSVGElement;
    if (!svg) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.preventDefault) e.preventDefault();
    // (B keeps its offset from the finger, so it never jumps under it as the drag starts)
    const at = this.toSvg(svg, e);
    this.drag = { k: k, svg: svg, x0: this.state.P[k].x, dx: at ? this.state.P[k].x - at.x : 0 };
    this.touched = true; // the learner has started: no more demo hand
    this.watchPointer();
    if (this.handId) { clearTimeout(this.handId); this.T.delete(this.handId); this.handId = null; }
    this.setState({ dragging: k, hand: null });
    this.sfx('tap');
  }
  // a drag never outlives its pointer: the window hears the pointer go up (or cancelled, or the page lose focus) even
  // where the stage does not - a finger lifted off the card, a lost pointer capture - so nothing is left held
  watchPointer() {
    if (this._winUp) return;
    this._winUp = (e) => { if (this.drag || this.fd || (this.conn && this.conn.live)) this.rootUp(e); };
    window.addEventListener('pointerup', this._winUp);
    window.addEventListener('pointercancel', this._winUp);
    window.addEventListener('blur', () => { if (this.drag) this.up(); });
  }
  // B slides along the top side (the bases stay parallel), past C if need be - that is how the trapezium becomes a
  // parallelogram - within limits that keep the shape readable
  move(e) {
    if (!this.drag) return;
    if (e && e.pointerType === 'mouse' && e.buttons === 0) return this.up(e); // (the button went up unseen)
    const p = this.toSvg(this.drag.svg, e);
    if (!p) return;
    const P = this.clone(this.state.P), Lm = CONFIG.limits;
    P.B.x = Math.max(P.A.x + Lm.minTop, P.C.x - Lm.maxLegRun, Math.min(Lm.maxTopX, P.C.x + Lm.maxLegRun, p.x + (this.drag.dx || 0)));
    const tx = P.C.x + (P.A.x - P.D.x); // near the parallel place B holds there while still held
    const snapped = Math.abs(P.B.x - tx) < CONFIG.snap.parallelPx;
    if (snapped) P.B.x = tx;
    if (Math.abs(P.B.x - this.drag.x0) > 25) this.drag.moved = true; // (this drag's own travel: a plain tap gets no tip)
    this.setState({ P: P, moved: this.state.moved || !!this.drag.moved });
    // held in its place for a moment, B is placed (a finger that never lifts cleanly still finishes the task)
    if (snapped && !this.snapId) {
      const tok = this.stepTok;
      this.snapId = this.tm(() => { this.snapId = null; if (tok === this.stepTok && this.drag && !this.state.done) this.up(); }, CONFIG.snap.holdMs);
    } else if (!snapped && this.snapId) { this.untm(this.snapId); this.snapId = null; }
  }
  up() {
    if (this.conn && this.conn.live) return;
    if (this.snapId) { this.untm(this.snapId); this.snapId = null; }
    if (!this.drag) return;
    const moved = !!this.drag.moved;
    this.drag = null;
    this.setState({ dragging: null });
    this.checkDrag(moved);
  }
  // dragB: close enough to BC ∥ AD snaps into the parallelogram; otherwise a tip says which way to go
  checkDrag(moved) {
    const st = this.cur(), s = this.state, P = this.clone(s.P);
    if (st.task !== 'dragB' || s.done) return;
    const tx = P.C.x + (P.A.x - P.D.x); // where B makes BC parallel to AD
    if (Math.abs(P.B.x - tx) < CONFIG.snap.parallelPx) {
      P.B.x = tx;
      this.setState({ P: P });
      this.popAt(P.B);
      this.finishTask();
    } else if (moved) {
      // a tip says which way to go; missed again after CONFIG.reveal.afterTips tips, the answer is shown (revealB)
      const wrongs = s.wrongs + 1;
      this.setState({ wrongs: wrongs });
      if (st.showAnswer && wrongs > CONFIG.reveal.afterTips) this.revealB();
      else this.oops(P.B.x < tx ? I18n.plain('lsTipDragRight') : I18n.plain('lsTipDragBack'), null);
    }
  }
  // dragB missed once too often: B stops taking drags and Swiftee says why (st.showAnswer); on its glideB word a copy of
  // AD slides across to C - the way BC must lean - and B glides along AB until BC lies on it (glideB). It is then the
  // parallelogram, with its own lines (st.answerAfter) and no fanfare: the learner did not find it
  revealB() {
    this.sfx('bad');
    this.drag = null;
    this.setState({ revealing: true, hand: null, dragging: null });
    this.interject(Object.assign({ m: CONFIG.swiftee.wrong }, this.cur().showAnswer));
  }
  glideB() {
    const tok = this.stepTok, P0 = this.clone(this.state.P), tx = P0.C.x + (P0.A.x - P0.D.x), S = this.fxPts();
    const at = Motion.reduced ? 0 : 1900, dur = Motion.reduced ? 0 : CONFIG.reveal.glideMs; // (B goes once the copy has landed)
    if (S && window.Motion) {
      const Bt = this.boardToStage({ x: tx, y: P0.B.y });
      if (Bt) Motion.slideMatch({ x1: S.D.x, y1: S.D.y, x2: S.A.x, y2: S.A.y }, { x1: S.C.x, y1: S.C.y, x2: Bt.x, y2: Bt.y }, CONFIG.palette.pair2);
    }
    this.busyFor(at + dur);
    const t0 = performance.now() + at, x0 = P0.B.x;
    const step = () => {
      if (tok !== this.stepTok) return;
      const k = dur ? Math.max(0, Math.min(1, (performance.now() - t0) / dur)) : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(2 - 2 * k, 2) / 2;
      const P = this.clone(this.state.P); P.B.x = x0 + (tx - x0) * e; this.setState({ P: P });
      if (k < 1) { requestAnimationFrame(step); return; }
      const done = () => { if (tok !== this.stepTok) return; if (this.state.talking) { this.tm(done, 120); return; } this.finishTask(); };
      done(); // (once the line explaining it has ended)
    };
    requestAnimationFrame(step);
  }

  // ---------- CFU ----------
  pick(o) {
    const st = this.cur(), s = this.state;
    if (s.done || s.picks[o.id] || this.busy()) return;
    const picks = Object.assign({}, s.picks);
    const tok = this.stepTok;
    if (o.emph) this.emphasize(o.emph); // (the part an answer names comes forward as it is picked - right or not)
    if (o.ok && o.pickCues) o.pickCues.forEach((c) => this.runCue(c)); // (a right pick's own moment: screen 50's pairs)
    if (o.ok) this.popAt(typeof document !== 'undefined' ? document.querySelector('[data-qa="opt-' + o.id + '"]') : null); // (every right pick, a card of the grid too)
    if (o.ok) this.hideMeet(); // (a wrong pick's sides, carried on till they meet, go at once: the praise is on the shape)
    if (st.multi && o.ok) {
      picks[o.id] = 'good';
      const need = st.opts.filter((x) => x.ok && x.req !== false), all = need.every((x) => picks[x.id]);
      this.setState({ picks: picks });
      if (!all) { // right, more to find: a soft confirmation, no fanfare yet
        this.sfx('pop');
        if (o.fb) this.interject({ m: CONFIG.swiftee.praise, t: o.fb, fb: 1 });
        this.poke();
        return;
      }
      const results = Object.assign({}, s.results);
      if (results[st.id] === undefined && !st.practice) results[st.id] = s.cfuFirst;
      this.setState({ done: true, results: results });
      this.cheer();
      const praise = () => this.answersGo(st, () => {
        if (st.okChips && !(st.okCues || []).some((c) => c.chip)) this.addChips(st.okChips); // (or each on its words: okCues)
        this.interject({ m: CONFIG.swiftee.correct, t: st.ok, cues: st.okCues, fb: 1 });
      });
      if (o.pickCues) { this.busyFor(1700); this.tm(() => { if (tok === this.stepTok) praise(); }, 1600); } else praise(); // (after the pick's own moment)
    } else if (o.ok) {
      picks[o.id] = 'good';
      const results = Object.assign({}, s.results);
      if (results[st.id] === undefined && !st.practice) results[st.id] = s.cfuFirst;
      this.setState({ picks: picks, done: true, results: results });
      this.cheer();
      // (the answer's value flies from the green answer itself, at once - it lands on the figure well before the answers
      // go and the shape moves: answersGo holds 1.8 s, the flight takes 1.1)
      if (st.fig) this.flyAnswer(this.figUnknowns(st), typeof document !== 'undefined' ? document.querySelector('[data-qa="opt-' + o.id + '"]') : null);
      this.answersGo(st, () => {
        if (st.okChips && !(st.okCues || []).some((c) => c.chip)) this.addChips(st.okChips); // (or each on its words: okCues)
        this.interject({ m: CONFIG.swiftee.correct, t: st.ok, cues: st.okCues, fb: 1 });
        this.okGlow(st);
      });
    } else {
      picks[o.id] = 'bad';
      this.setState({ picks: picks, cfuFirst: false });
      this.sfx('bad');
      this.interject({ m: CONFIG.swiftee.wrong, t: o.fb, cues: o.fbCues, fb: 1 });
      this.poke();
    }
  }
  // ---------- draw the diagonals (task 'connect') ----------
  // drag from a corner to the opposite corner (or tap one corner, then the other); a side gets a gentle tip
  opp(k) { return { A: 'C', C: 'A', B: 'D', D: 'B' }[k]; }
  diagKey(a, b) { return (a === 'A' || b === 'A') ? 'AC' : 'BD'; }
  // a corner whose diagonal is drawn: it no longer starts or ends a line (its dot greys, css .vdot.used)
  cornerUsed(k) { const d = this.state.diag || {}; return this.cur().task === 'connect' && !!((d.AC && (k === 'A' || k === 'C')) || (d.BD && (k === 'B' || k === 'D'))); }
  connDown(k, e) {
    const s = this.state;
    if (s.done || this.busy() || this.solved === this.stepTok || this.cornerUsed(k)) return;
    const svg = e.currentTarget && e.currentTarget.ownerSVGElement;
    if (e.preventDefault) e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    this.touched = true; this.hideHand();
    // a corner picked by a tap a moment ago: this tap finishes the line
    if (this.conn && !this.conn.live && this.conn.from !== k) { const from = this.conn.from; this.conn = null; this.setState({ conn: null }); this.connTo(from, k); return; }
    const p = this.shapeP()[k];
    this.conn = { from: k, live: true, svg: svg, moved: false };
    this.setState({ conn: { from: k, x: p.x, y: p.y } });
    this.sfx('tap');
  }
  connMove(e) {
    const c = this.conn, p = c && c.svg ? this.toSvg(c.svg, e) : (e && e.x != null ? { x: e.x, y: e.y } : null);
    if (!p) return;
    // a finger's jitter on a tap is not a drag: it counts as moved only once it leaves the corner
    const o = this.shapeP()[c.from];
    if (!c.moved && o && Math.hypot(p.x - o.x, p.y - o.y) < 14) return;
    c.moved = true;
    const end = this.connEnd(c.from, p);
    this.setState({ conn: { from: c.from, x: end.x, y: end.y, near: end.near } });
  }
  // where the line being drawn from corner `from` ends for a pointer at p: within reach of another corner, on it (that
  // corner lights: the line would go there); otherwise at p, but never past the shape's edge - a diagonal runs inside
  // the shape, so a pointer outside it holds the line where it would leave (at its corner, if it heads away)
  connEnd(from, p) {
    const P = this.shapeP(), o = P[from];
    const near = ['A', 'B', 'C', 'D'].find((k) => k !== from && !this.cornerUsed(k) && Math.hypot(P[k].x - p.x, P[k].y - p.y) < CONFIG.connect.reach);
    if (near) return { x: P[near].x, y: P[near].y, near: near };
    const Q = [P.A, P.B, P.C, P.D], area = Q.reduce((t, q, i) => t + q.x * Q[(i + 1) % 4].y - Q[(i + 1) % 4].x * q.y, 0) > 0 ? 1 : -1;
    const inside = (x, y) => Q.every((q, i) => { const r = Q[(i + 1) % 4]; return area * ((r.x - q.x) * (y - q.y) - (r.y - q.y) * (x - q.x)) >= -0.5; });
    if (inside(p.x, p.y)) return { x: p.x, y: p.y, near: null };
    let lo = 0, hi = 1; // (the last point of o -> p still inside: bisection - the shape is convex)
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inside(o.x + (p.x - o.x) * m, o.y + (p.y - o.y) * m)) lo = m; else hi = m; }
    const e = { x: o.x + (p.x - o.x) * lo, y: o.y + (p.y - o.y) * lo };
    const at = ['A', 'B', 'C', 'D'].find((k) => k !== from && !this.cornerUsed(k) && Math.hypot(P[k].x - e.x, P[k].y - e.y) < CONFIG.connect.reach / 2); // (held at a corner: on it)
    return at ? { x: P[at].x, y: P[at].y, near: at } : { x: e.x, y: e.y, near: null };
  }
  connUp(e) {
    const c = this.conn, P = this.shapeP();
    const p = (c.svg && e && e.clientX != null ? this.toSvg(c.svg, e) : null) || (this.state.conn && { x: this.state.conn.x, y: this.state.conn.y });
    // (the corner the line is on, where it was let go - or, without a move, the corner under the pointer - or, let go
    // short of it, the opposite corner when the line was plainly drawn towards it: past half way, close to its line)
    const toward = () => {
      const o = P[c.from], q = P[this.opp(c.from)], end = this.state.conn, L2 = (q.x - o.x) ** 2 + (q.y - o.y) ** 2;
      if (!c.moved || !end || !L2) return null;
      const t = ((end.x - o.x) * (q.x - o.x) + (end.y - o.y) * (q.y - o.y)) / L2, off = Math.abs((end.x - o.x) * (q.y - o.y) - (end.y - o.y) * (q.x - o.x)) / Math.sqrt(L2);
      return t >= 0.5 && off < 0.15 * Math.sqrt(L2) ? this.opp(c.from) : null;
    };
    const hit = (c.moved && this.state.conn && this.state.conn.near) || ['A', 'B', 'C', 'D'].find((k) => k !== c.from && !this.cornerUsed(k) && p && Math.hypot(P[k].x - p.x, P[k].y - p.y) < CONFIG.connect.reach) || toward();
    if (hit) { this.conn = null; this.setState({ conn: null }); this.connTo(c.from, hit); return; }
    // released on its own corner (a tap): keep it picked until the next corner is tapped
    this.conn = c.moved ? null : { from: c.from, live: false };
    this.setState({ conn: c.moved ? null : { from: c.from, x: P[c.from].x, y: P[c.from].y } });
  }
  connTo(a, b) {
    const s = this.state;
    if (this.opp(a) !== b) { this.oops(this.cur().wrong); return; }
    const k = this.diagKey(a, b);
    if (s.diag[k]) return;
    const diag = Object.assign({}, s.diag, { [k]: 1 });
    this.setState({ diag: diag });
    this.sfx('snap'); this.popAt(this.shapeP()[b]);
    if (diag.AC && diag.BD) { this.solved = this.stepTok; this.tm(() => this.finishTask(), 300); }
  }

  // ---------- fill / match checks ----------
  // Number (or segment) tiles go into blanks: drag a tile onto a blank, or tap it to fill the highlighted blank.
  // When every blank is full they are checked; right ones lock, wrong ones slide back out with a tip.
  fillDef() { return this.cur().fill; }
  activeBlank() {
    const F = this.state.fill, D = this.fillDef();
    if (F.sel && !F.at[F.sel]) return F.sel;
    const b = D.blanks.find((x) => !F.at[x.id]);
    return b ? b.id : null;
  }
  // a right equation of segment boxes becomes its statement: the two names slide together out of their boxes (which
  // go) into one tag, "OA = OC", in the tag row - the row the next screen keeps
  boxMerge(n) {
    const FD = this.fillDef(), F = this.state.fill, stage = typeof document !== 'undefined' && document.querySelector('.stage');
    const idsOf = (g) => FD.blanks.filter((b) => b.pair === g).map((b) => b.id);
    const tagOf = (g) => { const have = idsOf(g).map((id) => F.at[id]).sort().join('|'), pr = FD.pairs.find((x) => x.slice().sort().join('|') === have); return pr ? pr[0] + ' = ' + pr[1] : null; };
    const t = tagOf(n);
    if (!t) return CHIP_GAP;
    const pts = idsOf(n).map((id) => { const b = this.elBox(stage && stage.querySelector('[data-blank="' + id + '"]')); return b && { t: F.at[id], p: { x: b.x + b.w / 2, y: b.y + b.h / 2 } }; }).filter(Boolean);
    // (every equation's tag has its place in the row from the first merge, in the boxes' order - each merges up into
    // its own place, never across the other's boxes)
    const add = FD.blanks.map((b) => b.pair).filter((g, i, a) => a.indexOf(g) === i).map(tagOf).filter((x) => x && this.state.chips.every((c) => c.t !== x));
    this.setState({ boxGone: Object.assign({}, this.state.boxGone, { [n]: 1 }), chips: this.state.chips.concat(add.map((x) => ({ t: x, k: 'gold', arriving: 1 }))) },
      () => this.mergeTags([], { t: t, k: 'gold' }, pts));
    return 1500;
  }
  tileUsed(t) { const D = this.fillDef(), F = this.state.fill; return !!D.match && Object.keys(F.at).some((k) => F.at[k] === t); }
  tileDown(t, e) {
    const F = this.state.fill, D0 = this.fillDef();
    if (this.state.done || (F.checking && !D0.match) || this.busy() || this.tileUsed(t)) return; // (segments: only the boxes being checked wait)
    const tgt = e.currentTarget, root = tgt && tgt.closest ? tgt.closest('.stage') : null;
    if (e.preventDefault) e.preventDefault();
    this.touched = true; this.hideHand();
    if (!root) { this.fd = { t: t, moved: false }; return; }
    const r = root.getBoundingClientRect(), sc = r.width / 1280 || 1;
    try { tgt.setPointerCapture(e.pointerId); } catch (err) {}
    this.fd = { t: t, r: r, sc: sc, sx: e.clientX, sy: e.clientY, moved: false };
  }
  tileMove(e) {
    const D = this.fd;
    if (!D.r) return;
    if (!D.moved && Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < 6) return;
    D.moved = true;
    this.setState({ fill: Object.assign({}, this.state.fill, { drag: { t: D.t, x: (e.clientX - D.r.left) / D.sc, y: (e.clientY - D.r.top) / D.sc } }) });
  }
  tileUp(e) {
    const D = this.fd;
    this.fd = null;
    this.setState({ fill: Object.assign({}, this.state.fill, { drag: null }) });
    if (!D.moved) { // a tap fills the highlighted blank - not a segment's: those are dragged into place (a tap is no answer)
      if (this.fillDef().match) { this.poke(); return; }
      const b = this.activeBlank(); if (b) this.fillBlank(b, D.t); return;
    }
    let el = null;
    try { el = (document.elementsFromPoint(e.clientX, e.clientY) || []).find((x) => x.getAttribute && x.getAttribute('data-blank')); } catch (err) {}
    if (el) this.fillBlank(el.getAttribute('data-blank'), D.t);
  }
  // ---------- dropdown answers (number blanks: fill without match) ----------
  // A blank is a box with a chevron; a tap opens one menu of the screen's choices (fill.tiles) under it (above it when
  // there is no room). Picking a value closes the menu and checks that blank at once: right - it locks with a soft
  // green pulse and the correct sound; wrong - an orange outline, a small shake, the tip, and the box empties for
  // another try. The screen is done when every blank is right. Nothing shows until the question has been asked.
  isDropdown() { const D = this.fillDef(); return !!(D && !D.match); }
  ddOpen(id) {
    this.hideHand(); // (the hint goes as the menu opens: never behind it)
    const F = this.state.fill, D = this.fillDef();
    if (this.state.done || F.checking || F.locked[id] || this.busy()) return;
    if (F.open === id) { this.ddClose(); return; }
    // the choices in one row right under the box - into the room the answers keep under the boxes, so the menu never
    // lies over the shape - each a tile-sized target, the row kept inside the card; a notch points up at the box
    // (sized as css draws the choices - 30px type, 16px padding and a 2px border each side; the menu itself is never
    // narrower than its choices, max-content, so a wider font can only widen it, not let a choice stick out)
    const DD = CONFIG.dropdown, itemW = (t) => Math.max(DD.minItemW, Math.round(this.textW(t, '800 30px "Baloo 2"') + 36));
    const w = D.tiles.reduce((a, t) => a + itemW(t), 0) + DD.gap * (D.tiles.length - 1) + 18, h = DD.itemH + 14;
    let x = 640 - w / 2, y = 0, up = false, nx = w / 2;
    if (typeof document !== 'undefined') {
      const el = document.querySelector('[data-blank="' + id + '"]'), st = document.querySelector('.stage');
      if (el && st) {
        const r = el.getBoundingClientRect(), sr = st.getBoundingClientRect(), k = sr.width / 1280 || 1;
        const top = (r.top - sr.top) / k, bot = (r.bottom - sr.top) / k, cx = (r.left - sr.left) / k + r.width / k / 2;
        x = Math.max(DD.left, Math.min(DD.right - w, cx - w / 2)); nx = Math.max(22, Math.min(w - 22, cx - x));
        up = bot + 10 + h > DD.maxBottom; y = up ? top - 10 - h : bot + 10;
      }
    }
    this.touched = true; this.hideHand();
    this.setState({ fill: Object.assign({}, F, { open: id, closing: false, menu: { x: Math.round(x), y: Math.round(y), w: Math.round(w), nx: Math.round(nx), up: up } }) });
    this.sfx('tap');
  }
  // a choice picked: the menu closes and the box takes it (pickBlank checks it at once)
  ddPick(id, t) {
    const F = this.state.fill;
    if (!F.open || F.closing) return;
    this.ddClose(() => this.pickBlank(id, t));
  }
  ddClose(then) {
    const F = this.state.fill;
    if (!F.open) { if (then) then(); return; }
    const tok = this.stepTok;
    this.setState({ fill: Object.assign({}, F, { closing: true }) });
    this.tm(() => { if (tok !== this.stepTok) return; this.setState({ fill: Object.assign({}, this.state.fill, { open: null, closing: false }) }); if (then) then(); }, Motion.reduced ? 0 : CONFIG.dropdown.closeMs);
  }
  pickBlank(id, t) {
    const st = this.cur(), D = this.fillDef(), F = this.state.fill, b = D.blanks.find((x) => x.id === id);
    if (!b || F.locked[id] || F.checking || this.state.done) return;
    const at = Object.assign({}, F.at, { [id]: t });
    if (t === b.ans) {
      const locked = Object.assign({}, F.locked, { [id]: true });
      this.setState({ fill: Object.assign({}, F, { at: at, locked: locked, bad: {}, open: null, closing: false }) });
      this.popAt(typeof document !== 'undefined' ? document.querySelector('[data-blank="' + id + '"]') : null);
      if (st.fig) { // (its value jumps to its "?" on the figure: the figure's key for the box)
        const flip = { AD: 'DA', CB: 'BC', DC: 'CD' }, key = (st.fig.sides || {})[id] ? id : (st.fig.sides || {})[flip[id]] ? flip[id] : id;
        this.flyAnswer([key], typeof document !== 'undefined' ? document.querySelector('[data-blank="' + id + '"]') : null);
        // (the part it measures comes forward as it lands - the last one's in the right answer's own words, when it has them)
        const last = D.blanks.every((x) => locked[x.id]) && !!st.okCues;
        if (last) {} else if ((st.fig.sides || {})[key]) this.lightFor([key], 1500); else if ((st.fig.angles || {})[key]) this.emphasize(['a' + key]);
      }
      if (D.blanks.every((x) => locked[x.id])) {
        const s = this.state, results = Object.assign({}, s.results);
        if (results[st.id] === undefined && !st.practice && st.cp) results[st.id] = s.cfuFirst;
        this.setState({ done: true, results: results });
        if (st.okChips && !(st.okCues || []).some((c) => c.chip)) this.addChips(st.okChips); // (or each on its words: okCues)
        this.cheer();
        this.interject({ m: CONFIG.swiftee.correct, t: st.ok, cues: st.okCues, fb: 1 });
      } else { this.sfx('snap'); this.poke(); }
      return;
    }
    // wrong: the value shows briefly in an orange box that shakes, the tip plays, then the box empties for a retry - the
    // tip for that value in that box ("B:65"), else for the value, else for the box, else the screen's own
    this.setState({ fill: Object.assign({}, F, { at: at, bad: { [id]: true }, checking: true, open: null, closing: false, tried: Object.assign({}, F.tried, { [id]: ((F.tried || {})[id] || []).concat([t]) }) }), cfuFirst: false });
    this.oops((D.fb && (D.fb[id + ':' + t] || D.fb[t] || D.fb[id] || D.fb.any)) || I18n.plain('lsTipTryAgain'));
    const tok = this.stepTok;
    this.tm(() => {
      if (tok !== this.stepTok) return;
      const F2 = this.state.fill, at2 = Object.assign({}, F2.at); delete at2[id];
      this.setState({ fill: Object.assign({}, F2, { at: at2, bad: {}, checking: false }) });
      this.poke();
    }, CONFIG.dropdown.wrongMs);
  }
  // A tap on a number box opens its choices (ddOpen); a match box that holds a segment empties again
  blankTap(id) {
    const F = this.state.fill;
    if (this.isDropdown()) { this.ddOpen(id); return; }
    if (this.state.done || F.checking || F.locked[id] || this.busy()) return;
    const at = Object.assign({}, F.at); delete at[id]; // tapping a filled blank empties it again
    this.setState({ fill: Object.assign({}, F, { at: at, sel: id }) });
    this.sfx('tap');
  }
  fillBlank(id, t) {
    if (this.isDropdown()) { this.pickBlank(id, t); return; } // (tests and older callers: a value for a dropdown)
    const F = this.state.fill, D = this.fillDef();
    if (F.locked[id] || this.state.done || (F.checking && (!D.match || !F.checkIds || F.checkIds.indexOf(id) >= 0))) return;
    const at = Object.assign({}, F.at);
    if (D.match) Object.keys(at).forEach((k) => { if (at[k] === t) delete at[k]; }); // a segment sits in one place only
    at[id] = t;
    this.setState({ fill: Object.assign({}, F, { at: at, sel: null, bad: D.match ? F.bad : {} }) }); // (a wrong equation still being shown keeps its orange)
    this.sfx('pop');
    // (segment pairs: each equation is checked as soon as both its boxes hold a segment, one at a time)
    const bk = D.blanks.find((x) => x.id === id), grp = D.match && bk && bk.pair ? D.blanks.filter((x) => x.pair === bk.pair) : D.blanks;
    if (grp.every((b) => at[b.id])) {
      this.setState({ fill: Object.assign({}, this.state.fill, { checking: true, checkIds: grp.map((b) => b.id) }) });
      const tok = this.stepTok;
      this.tm(() => { if (tok === this.stepTok) this.checkFill(grp); }, 420);
    }
  }
  // which blanks are right: a fill blank holds its answer; a match pair holds one of the equal pairs (either order)
  fillRight(at) {
    const D = this.fillDef(), ok = {};
    if (!D.match) { D.blanks.forEach((b) => { ok[b.id] = at[b.id] === b.ans; }); return ok; }
    const groups = {};
    D.blanks.forEach((b) => { (groups[b.pair] = groups[b.pair] || []).push(b.id); });
    Object.keys(groups).forEach((g) => {
      const v = groups[g].map((id) => at[id]).sort().join('|');
      const good = D.pairs.some((pr) => pr.slice().sort().join('|') === v);
      groups[g].forEach((id) => { ok[id] = good; });
    });
    return ok;
  }
  checkFill(only) {
    const st = this.cur(), s = this.state, D = this.fillDef(), F = s.fill, judge = only || D.blanks;
    const ok = this.fillRight(F.at), at = Object.assign({}, F.at), locked = Object.assign({}, F.locked), bad = {};
    let wrongTile = null;
    judge.forEach((b) => { if (ok[b.id]) locked[b.id] = true; else { bad[b.id] = true; wrongTile = wrongTile || at[b.id]; } });
    const pop = () => { if (typeof document !== 'undefined') judge.forEach((b, i) => this.tm(() => this.popAt(document.querySelector('[data-blank="' + b.id + '"]')), i * 90)); };
    if (!wrongTile && !D.blanks.every((b) => locked[b.id])) { // (this equation is right and stays; the next is still to make)
      this.setState({ fill: Object.assign({}, F, { locked: locked, checking: false, checkIds: null }) });
      pop(); this.sfx('snap'); this.poke();
      return;
    }
    if (D.blanks.every((b) => locked[b.id])) {
      const results = Object.assign({}, s.results);
      if (results[st.id] === undefined && !st.practice && st.cp) results[st.id] = s.cfuFirst;
      this.setState({ fill: Object.assign({}, F, { locked: locked, checking: false }), done: true, results: results });
      pop();
      if (st.okChips && !(st.okCues || []).some((c) => c.chip)) this.addChips(st.okChips); // (or each on its words: okCues)
      this.cheer();
      this.interject({ m: CONFIG.swiftee.correct, t: st.ok, cues: st.okCues, fb: 1 });
      return;
    }
    // wrong blanks wobble orange, then empty again for another try
    this.setState({ fill: Object.assign({}, F, { locked: locked, bad: bad, checking: true, checkIds: Object.keys(bad) }), cfuFirst: false });
    this.oops((D.fb && (D.fb[wrongTile] || D.fb.any)) || I18n.plain('lsTipTryAgain'));
    const tok = this.stepTok;
    this.tm(() => {
      if (tok !== this.stepTok) return;
      const F2 = this.state.fill, at2 = Object.assign({}, F2.at);
      Object.keys(bad).forEach((k) => delete at2[k]);
      this.setState({ fill: Object.assign({}, F2, { at: at2, bad: {}, checking: false, checkIds: null }) });
      this.poke();
    }, 900);
  }
  // the pointer over the whole stage: a diagonal being drawn, a tile being dragged, or corner B
  rootMove(e) {
    if (this.conn && this.conn.live) return this.connMove(e);
    if (this.fd) return this.tileMove(e);
    if (this.drag) return this.move(e);
  }
  rootUp(e) {
    if (this.conn && this.conn.live) return this.connUp(e);
    if (this.fd) return this.tileUp(e);
    if (this.drag) return this.up(e);
  }

  // ---------- render ----------
  geo() {
    const s = this.state, st = this.cur(), fig = st.fig || null, P = this.shapeP(), task = st.task;
    const f = fig ? Object.assign({ diag: fig.diag, O: fig.diag, ticks: fig.ticks, hticks: fig.hticks, toMarks: fig.toMarks, arcs: Object.keys(fig.angles || {}).join('') }, s.done && st.okF ? st.okF : {}) : this.fl();
    // (a checkpoint's given values and its '?'s come in as the question names them - figIn - all of them once asked)
    const named = fig ? this.figNamed(st) : {}, figOff = (key) => !!(fig && s.figIn && named[key] && !s.figIn[key]);
    const A = P.A, B = P.B, C = P.C, D = P.D;
    const dsp = (b) => (b ? 'inline' : 'none');
    const r1 = (v) => Math.round(v * 10) / 10;
    const seg = (p, q, show, extra) => Object.assign({ x1: r1(p.x), y1: r1(p.y), x2: r1(q.x), y2: r1(q.y), d: dsp(show) }, extra || {});
    const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const noop = () => {};
    const g = {};
    const zs = this.sceneFit(st).k || 1; // the board's zoom: angle marks and their values keep one size on screen
    g.poly = [A, B, C, D].map((p) => r1(p.x) + ',' + r1(p.y)).join(' ');
    const said = (k) => !!(s.glow && s.glow.indexOf(k) >= 0);
    const act = task === 'measure' ? this.activeSide() : null;
    const meas = (k) => task === 'measure' && (!!s.tap[k] || s.measuring === k);
    // A highlighted side ("lit": named by a line's glow or a word cue, or being measured) is drawn bolder and gets the
    // marker (hlCls, below); while only some sides are lit the others step back (.edge.dim). All four lit (the whole
    // outline named): nothing steps back.
    const lit = {};
    ['DA', 'BC', 'AB', 'CD'].forEach((k) => { lit[k] = said(k) || (!st.auto && (act === k || meas(k))); });
    const nLit = ['AB', 'BC', 'CD', 'DA'].filter((k) => lit[k]).length;
    {
      const tp = s.tape, ends = tp ? this.walkEnds(tp.leg) : null;
      if (ends) {
        const L = this.dist(ends[0], ends[1]) || 1, ux = (ends[1].x - ends[0].x) / L, uy = (ends[1].y - ends[0].y) / L;
        // as in Fishing Frenzy's lesson: the tape lies along the side on the side Swiftee is standing on (she walks upright,
        // so that is the screen-up side), from the start corner under her feet up into her hand, never crossing the line
        let nx = -uy, ny = ux; if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
        const off = 6, p0 = { x: ends[0].x + nx * off, y: ends[0].y + ny * off };
        const foot = { x: p0.x + ux * L * tp.t, y: p0.y + uy * L * tp.t }, tip = tp.tip || foot;
        g.tape = { p: 'M' + r1(p0.x) + ',' + r1(p0.y) + ' L' + r1(foot.x) + ',' + r1(foot.y) + ' L' + r1(tip.x) + ',' + r1(tip.y), d: 'inline' };
        let tk = '';
        for (let hh = 0; hh * this.S / 2 <= L * tp.t + 0.01; hh++) { // ticks every half cm across the tape
          const q = { x: p0.x + ux * hh * this.S / 2, y: p0.y + uy * hh * this.S / 2 }, len = hh % 2 ? 2.5 : 4.5;
          tk += 'M' + r1(q.x - nx * len) + ',' + r1(q.y - ny * len) + ' L' + r1(q.x + nx * len) + ',' + r1(q.y + ny * len) + ' ';
        }
        g.tapeTk = { p: tk || 'M0,0', d: 'inline' };
      } else {
        g.tape = { p: 'M0,0', d: 'none' }; g.tapeTk = { p: 'M0,0', d: 'none' };
      }
    }
    // the pen drawing the outline on screen 1 (runBuild, below)
    g.trace = seg(D, D, false, { cls: 'trace' });
    // shape colours, as in Fishing Frenzy's lesson (CONFIG.palette): the bases AB, CD always blue; the legs AD, BC blue
    // until the parallel pair has been found, then teal for good - the trapezium's legs, then (once the drag makes a
    // parallelogram) the second pair - so a screen without arrows never turns them back to blue. PU: a corner to drag
    const PAL = CONFIG.palette, PU = '#00b8a9', pgShape = this.isPg(P);
    const legsPlain = !!f.par && !f.par2 && !pgShape;
    const pair2 = !!f.par2 || pgShape;
    const baseCol = () => PAL.line;
    const legCol = () => (pair2 ? PAL.pair2 : legsPlain ? PAL.slate : PAL.line);
    // emph (named in the voice-over), lit / dim (the named sides lead, the others step back)
    // focus: a side the voice names grows and, while it is named, the sides it does not name step back too (as a lit
    // side's do), so the eye goes to the part being talked about
    const nNamed = ['AB', 'BC', 'CD', 'DA'].filter((k) => s.emph && s.emph[k]).length;
    const eCls = (k) => 'e' + k + (s.emph && s.emph[k] ? ' emph' : '') + (lit[k] ? ' lit' : (nLit && nLit < 4) || (!nLit && nNamed && nNamed < 4 && !(s.emph && s.emph[k])) ? ' dim' : '');
    // build (screen 1): the shape draws itself while Swiftee talks - empty panel, then a glowing pink pen runs
    // D->A->B->C->D in one continuous stroke, leaving each finished edge behind; corners (dot + letter) appear as
    // the pen reaches them. Then a soft glow settles round the outline and the fill fades in (s.build, runBuild).
    const bd = st.build ? (s.build || { d: 0 }) : null, building = !!(bd && !bd.done);
    const bOrder = [['DA', D, A], ['AB', A, B], ['BC', B, C], ['CD', C, D]], bAt = {};
    { let acc = 0; bOrder.forEach((e) => { const L = this.dist(e[1], e[2]); bAt[e[0]] = { s: acc, L: L, p: e[1], q: e[2] }; acc += L; }); }
    const edgeOn = (k) => !building || bd.d >= bAt[k].s + bAt[k].L - 0.01;
    const vOn = (k) => !building || (k === 'D' ? bd.d > 0 : bd.d >= bAt[{ A: 'AB', B: 'BC', C: 'CD' }[k]].s - 0.01);
    if (building && bd.d > 0) {
      const cur = bOrder.map((e) => bAt[e[0]]).find((e) => bd.d < e.s + e.L) || bAt.CD;
      g.trace = seg(cur.p, lerp(cur.p, cur.q, Math.min(1, (bd.d - cur.s) / cur.L)), true, { cls: 'trace' });
    }
    g.ol = { d: dsp(!!(bd && bd.settle) || !!st.assemble) };
    // the named side (as in Fishing Frenzy's lesson): a sunflower-yellow marker redraws it, a glowing pen tip running
    // ahead of it, while the side is lit or the voice names it (css .hl)
    const hlCls = (k) => 'hl' + (lit[k] && edgeOn(k) ? ' on' : ''); // (a side a word names only grows bolder: .edge.emph)
    g.eAB = seg(A, B, edgeOn('AB'), { c: baseCol('AB'), cls: eCls('AB'), hl: hlCls('AB') });
    g.eCD = seg(C, D, edgeOn('CD'), { c: baseCol('CD'), cls: eCls('CD'), hl: hlCls('CD') });
    g.eBC = seg(B, C, edgeOn('BC'), { c: legCol('BC'), cls: eCls('BC'), hl: hlCls('BC') });
    g.eDA = seg(D, A, edgeOn('DA'), { c: legCol('DA'), cls: eCls('DA'), hl: hlCls('DA') });
    // a tick mark across the middle of p->q (one, or two side by side), for the diagonals' equal halves: the sides'
    // own ticks (CONFIG.marks)
    const ad = this.dist(A, D), bc = this.dist(B, C), MK = CONFIG.marks;
    const tick = (p, q, one) => {
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, L = this.dist(p, q) || 1;
      const dx = (q.x - p.x) / L, dy = (q.y - p.y) / L, nx = -dy, ny = dx;
      let out = '';
      (one ? [0] : [-MK.tickStep / 2, MK.tickStep / 2]).forEach((k) => {
        const cx = mx + dx * k, cy = my + dy * k;
        out += 'M' + r1(cx - nx * MK.tickHalf) + ',' + r1(cy - ny * MK.tickHalf) + ' L' + r1(cx + nx * MK.tickHalf) + ',' + r1(cy + ny * MK.tickHalf) + ' ';
      });
      return out;
    };
    // ---- side markings: Fishing Frenzy's lesson's own marks (CONFIG.marks), from the vertices ----
    // For every side: the true midpoint m, the unit vector u along the side and n across it. Parallel arrows are open
    // orange chevrons on a white halo (index.html), 11 deep and 22 tall, pointing along u - clockwise round the shape, the
    // way the side's light runs (A->B, B->C, C->D, D->A): two back to back on AB, CD and one on AD, BC. Equal-length ticks are navy
    // strokes 24 long across the side: one on AB, CD and two on AD, BC. A side carrying both has its arrows MK.gap before
    // the midpoint and its ticks MK.gap after it; a side carrying one kind has it centred on the midpoint. Rebuilt every
    // frame from the vertices, so the marks stay on their sides through drags and moves.
    const pgNow = this.isPg(P);
    const showPar1 = !!f.par, showPar2 = !!(f.par2 || (task === 'dragB' && pgNow));
    const showTk = !!f.ticks;
    // a side (or a half of a diagonal) showing its measurement carries no marks: the number says it
    const isM = st.task === 'measure', lon = (k) => !f.lenSeq || !!(s.lenOn && s.lenOn[k]);
    const lenOn = (k) => (isM && !!s.tap[k]) || (((k === 'AB' || k === 'CD') ? !!f.sideLen : !!f.legLen) && lon(k)) || !!(fig && fig.sides && fig.sides[k]);
    const fHalves = {};
    if (fig) { Object.assign(fHalves, fig.halves || {}); this.askedHalves(st).forEach((k) => { fHalves[k] = '?'; }); }
    this.figPos = {}; // (where each of a checkpoint's labels sits, board px: the answers jump there, flyAnswer)
    // (toMarks: a pair's lengths become its marks on a cue - hMarks - screen 46)
    // (its lengths leave as their copies glide off - hNum - and its marks draw in as they arrive - hMarks)
    const pairK = { A: 'A', C: 'A', B: 'B', D: 'B' }, toMark = (k) => !!(f.toMarks && s.hNum && s.hNum[pairK[k]]), markIn = (k) => !!(f.toMarks && s.hMarks && s.hMarks[pairK[k]]);
    const halfOn = (k) => (fig ? !!fHalves[k] : !!(f.halves && (f.split || f.halfPairs)) && !toMark(k));
    const SIDES = { AB: [A, B], BC: [B, C], CD: [C, D], DA: [A, D] }; // (each the way its name is said: AD is A->D)
    const nArrows = { AB: showPar1 && !lenOn('AB') ? 2 : 0, CD: showPar1 && !lenOn('CD') ? 2 : 0, DA: showPar2 && !lenOn('DA') ? 1 : 0, BC: showPar2 && !lenOn('BC') ? 1 : 0 };
    // a parallelogram's top and bottom are equal too (one tick); a trapezium's equal legs get theirs alone (two)
    const nTicks = { AB: showTk && pgNow && !lenOn('AB') ? 1 : 0, CD: showTk && pgNow && !lenOn('CD') ? 1 : 0, DA: showTk && !lenOn('DA') ? 2 : 0, BC: showTk && !lenOn('BC') ? 2 : 0 };
    const frame = (k) => {
      const p = SIDES[k][0], q = SIDES[k][1], L = this.dist(p, q) || 1, ux = (q.x - p.x) / L, uy = (q.y - p.y) / L;
      return { mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2, ux: ux, uy: uy, nx: -uy, ny: ux };
    };
    const at = (F, d) => ({ x: F.mx + F.ux * d, y: F.my + F.uy * d });
    const arrows = (k, n, c0) => {
      n = n || nArrows[k]; if (!n) return '';
      const F = frame(k); c0 = c0 != null ? c0 : nTicks[k] ? -MK.gap : 0;
      let out = '';
      for (let i = 0; i < n; i++) {
        const c = at(F, c0 + (i - (n - 1) / 2) * MK.arrowStep), tip = { x: c.x + F.ux * MK.arrowDepth, y: c.y + F.uy * MK.arrowDepth };
        const back = { x: c.x - F.ux * MK.arrowDepth, y: c.y - F.uy * MK.arrowDepth };
        out += 'M' + r1(back.x + F.nx * MK.arrowWing) + ',' + r1(back.y + F.ny * MK.arrowWing) + ' L' + r1(tip.x) + ',' + r1(tip.y) +
          ' L' + r1(back.x - F.nx * MK.arrowWing) + ',' + r1(back.y - F.ny * MK.arrowWing) + ' ';
      }
      return out;
    };
    const ticks = (k) => {
      const n = nTicks[k]; if (!n) return '';
      const F = frame(k), c0 = nArrows[k] ? MK.gap : 0;
      let out = '';
      for (let i = 0; i < n; i++) {
        const c = at(F, c0 + (i - (n - 1) / 2) * MK.tickStep);
        out += 'M' + r1(c.x - F.nx * MK.tickHalf) + ',' + r1(c.y - F.ny * MK.tickHalf) + ' L' + r1(c.x + F.nx * MK.tickHalf) + ',' + r1(c.y + F.ny * MK.tickHalf) + ' ';
      }
      return out;
    };
    const tkPath = ticks('AB') + ticks('CD') + ticks('DA') + ticks('BC');
    g.tk = { p: tkPath || 'M0,0', d: dsp(!!tkPath) };
    // each side's arrows on their own (css .par-ch pops them on as the side's light passes them); a side whose arrows a
    // word cue traces on (markCues) keeps its slot but shows them only from that cue
    // A side parallel to its opposite with no arrows of its own gets them for a moment when they are called out (s.parTmp, from
    // parBeat): two on AB, CD and one on AD, BC as ever; on a side showing its length they sit back along the side, clear
    // of the number (or not at all if the side is too short for that)
    const due = this.markCues(st);
    ['AB', 'CD', 'DA', 'BC'].forEach((k) => {
      const on = !!nArrows[k] && !(due[k] && !(s.marked && s.marked[k]));
      const tmp = !on && !due[k] && this.sidePar(P, k) && s.parTmp && s.parTmp[k], half = this.dist(SIDES[k][0], SIDES[k][1]) / 2;
      const c0 = lenOn(k) ? -MK.tempShift : 0, fits = !lenOn(k) || half >= MK.tempShift + MK.arrowStep + MK.arrowDepth;
      const path = on ? arrows(k) : tmp && fits ? arrows(k, k === 'AB' || k === 'CD' ? 2 : 1, c0) : '';
      g['ch' + k] = { p: path || 'M0,0', d: dsp(!!path), x: !on && path ? ' tmp' + (tmp === 'out' ? ' out' : '') : '' };
    });
    // which way each side's light runs: on a lettered shape always A->B, B->C, C->D and A->D - the way its name is said
    // and its parallel arrows point ("AD", never "DA"), whether or not the arrows are showing - so the light and the
    // marks always go together, screen after screen; only the unlettered quadrilateral of the opening screens (built,
    // its sides counted 1-4) lights clockwise round
    const round = !!st.sideNums || !!f.noLetters || !!st.build;
    const cw = [A, B, C, D].reduce((sum, p, i, Q) => sum + p.x * Q[(i + 1) % 4].y - Q[(i + 1) % 4].x * p.y, 0) >= 0;
    ['AB', 'BC', 'CD', 'DA'].forEach((k) => {
      const e = g['e' + k], rev = round ? !cw : k === 'DA';
      Object.assign(e, rev ? { h1x: e.x2, h1y: e.y2, h2x: e.x1, h2y: e.y1 } : { h1x: e.x1, h1y: e.y1, h2x: e.x2, h2y: e.y2 });
    });
    // diagonals AC and BD (drawn by the pen on the diags screen, then shown by f.diag) and their meeting point O
    const O = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 }, O0 = () => O;
    // (a diagonal named alone: the other steps back while it is said)
    const dCls = (k) => (s.emph && s.emph[k] ? 'emph' : s.emph && (s.emph.dAC || s.emph.dBD) ? 'dim' : '');
    g.dAC = seg(A, C, !!(f.diag || s.diag.AC), { cls: dCls('dAC') });
    g.dBD = seg(B, D, !!(f.diag || s.diag.BD), { cls: dCls('dBD') });
    // split: the four halves in four colours; halfPairs: the equal halves share a colour (OA, OC pink; OB, OD blue)
    {
      // (pairSeq: the four colours, each diagonal taking one as its colour runs along it - pairsIn - screen 46)
      const one = (a) => f.halfPairs || !!(f.pairSeq && s.pairsIn && s.pairsIn[a]);
      const HC = { A: PAL.vA, B: PAL.vB, C: one('A') ? PAL.vA : PAL.vC, D: one('B') ? PAL.vB : PAL.vD };
      const on = !!(f.split || f.halfPairs);
      const hNamed = ['hA', 'hB', 'hC', 'hD'].some((k) => s.emph && s.emph[k]); // (a half named: the halves it is not step back)
      // (splitSeq: the halves come in one at a time, each on its own cue - screen 42)
      ['A', 'B', 'C', 'D'].forEach((k) => { g['h' + k] = seg(O0(), P[k], on && (!f.splitSeq || !!(s.halvesIn && s.halvesIn[k])), { c: HC[k], cls: 'hseg' + (f.halfPairs || f.pairSeq ? ' pr' : '') + (s.emph && s.emph['h' + k] ? ' emph' : hNamed ? ' dim' : '') }); });
    }
    // connect: the line follows the finger from the picked corner
    g.cn = s.conn ? seg(P[s.conn.from], { x: s.conn.x, y: s.conn.y }, true) : seg(A, A, false);
    // supp: two adjacent angles side by side on one straight line, drawn as Fishing Frenzy's lesson draws it (suppAt).
    // For the pair XY the demo sits at Y: side ZY carried on past Y (dashed, in the bases' blue: along a base it runs
    // out 80 px, up or down a leg just past the angle, clear of the plate and the name tags), Y's own angle, and a copy
    // of X's angle that slides down the side from X and makes a half-turn onto the line beside it; a gold rim then draws
    // round the half-disc the two make, with its "180°". Both angles 38 px on screen at any zoom, in their wedges'
    // colours. (css .supp-*: sA / sB restart it for each pair)
    let s180 = null;
    {
      const pair = f.supp && s.supp != null ? f.supp[s.supp] : null;
      if (pair) {
        // (drawn large - 52 px on screen, past the corner's own small wedge - so the two angles filling the straight line
        // read at a glance; the corner's own size moves out past it meanwhile: suppAt, below)
        const X = pair[0], Y = pair[1], Z = this.nb(Y).find((k) => k !== X), Py = P[Y], Rr = 52 / zs;
        this.suppAt = { k: Y, R: Rr };
        const un = (p, q) => { const L = this.dist(p, q) || 1; return { x: (q.x - p.x) / L, y: (q.y - p.y) / L }; };
        const toX = un(Py, P[X]), toZ = un(Py, P[Z]), ext = { x: -toZ.x, y: -toZ.y };
        const wedge = (a, b) => { const cr = a.x * b.y - a.y * b.x;
          return 'M' + r1(Py.x) + ',' + r1(Py.y) + ' L' + r1(Py.x + a.x * Rr) + ',' + r1(Py.y + a.y * Rr) + ' A' + r1(Rr) + ',' + r1(Rr) + ' 0 0 ' + (cr > 0 ? 1 : 0) + ' ' + r1(Py.x + b.x * Rr) + ',' + r1(Py.y + b.y * Rr) + ' Z'; };
        const col = (k) => PAL['v' + (f.pairCol ? { A: 'A', C: 'A', B: 'B', D: 'B' }[k] : k)]; // the wedges' own colours
        const L = Math.abs(ext.y) < 0.5 ? Math.max(80, Rr + 40 / zs) : Rr + 26 / zs, side = ext.x * toX.y - ext.y * toX.x, sk = s.supp % 2 ? 'sB' : 'sA';
        const a0 = { x: Py.x + ext.x * Rr, y: Py.y + ext.y * Rr }, a1 = { x: Py.x + toZ.x * Rr, y: Py.y + toZ.y * Rr };
        g.sp = { d: 'inline', line: 'M' + r1(Py.x) + ',' + r1(Py.y) + ' L' + r1(Py.x + ext.x * L) + ',' + r1(Py.y + ext.y * L),
          own: wedge(toX, toZ), cOwn: col(Y), copy: wedge(toX, ext), cCopy: col(X), o: r1(Py.x) + 'px ' + r1(Py.y) + 'px',
          rim: 'M' + r1(a0.x) + ',' + r1(a0.y) + ' A' + r1(Rr) + ',' + r1(Rr) + ' 0 0 ' + (side > 0 ? 1 : 0) + ' ' + r1(a1.x) + ',' + r1(a1.y),
          lcls: 'supp-line ' + sk, ocls: 'supp-own ' + sk, cls: 'supp-copy ' + sk, rcls: 'supp-rim ' + sk,
          dx: r1(P[X].x - Py.x) + 'px', dy: r1(P[X].y - Py.y) + 'px' };
        // its "180°": beyond the half-disc, between the line and side YX, outside the shape (21 px on screen)
        let bx = ext.x + toX.x, by = ext.y + toX.y; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
        s180 = { t: '180°', x: r1(Py.x + bx * (Rr + 30 / zs)), y: r1(Py.y + by * (Rr + 30 / zs)), cls: 'alab s180 ' + sk };
      } else { this.suppAt = null; g.sp = { d: 'none', line: 'M0,0', own: 'M0,0', copy: 'M0,0', rim: 'M0,0', cOwn: PAL.vB, cCopy: PAL.vA, o: '0px 0px', lcls: 'supp-line', ocls: 'supp-own', cls: 'supp-copy', rcls: 'supp-rim', dx: '0px', dy: '0px' }; }
    }
    const oOn = !!(f.O || (f.Oat && s.oIn)); // (Oat: O comes in as the voice names it)
    g.oDot = { x: r1(O.x), y: r1(O.y), d: dsp(oOn), cls: s.emph && s.emph.vO ? 'emph' : '' };
    // hticks: equal halves marked like equal sides (one tick on OA and OC, two on OB and OD)
    {
      // (one path per pair, so each pair's marks can come in on their own: toMarks)
      const tk1 = (halfOn('A') ? '' : tick(O, A, true)) + (halfOn('C') ? '' : tick(O, C, true)), tk2 = (halfOn('B') ? '' : tick(O, B)) + (halfOn('D') ? '' : tick(O, D));
      const mk = (a) => !f.toMarks || markIn(a);
      g.htk = { p: tk1 || 'M0,0', d: dsp(f.hticks && !!tk1 && mk('A')) }; g.htk2 = { p: tk2 || 'M0,0', d: dsp(f.hticks && !!tk2 && mk('B')) };
    }
    // angles
    const V = this.vals(P);
    const arcSet = (f.arcs || '') + Object.keys(s.angIn || {}).join(''); // angIn: measured with the protractor (screen 24)
    const foundAC = f.pairCol || f.pairA || (task === 'tapEq' && st.ref === 'A' && s.done);
    const foundBD = f.pairCol || (task === 'tapEq' && st.ref === 'D' && s.done);
    const pairCls = (k) => ((k === 'A' || k === 'C') ? (foundAC ? ' pa' : '') : (foundBD ? ' pb' : ''));
    const unit = (p, q) => { const L = this.dist(p, q) || 1; return { x: (q.x - p.x) / L, y: (q.y - p.y) / L }; };
    const aTag = {}, em = s.emph || {}; // parts the voice-over is naming right now
    // angle focus: while a line names angles ("∠A and ∠D..."), the other angles and their values fade back (s.aFocus)
    const aDim = (k) => (s.aFocus && !s.aFocus[k] ? ' dim' : '');
    // the angle a question asks about beats until it is answered (css .asked): the one its cue names (screens 26-27),
    // or a checkpoint's '?' angle while its '?' is up
    const askedK = (k) => !s.done && (s.askedAng === k || !!(fig && String(this.figVal(this.cur(), k, (fig.angles || {})[k] || '')).indexOf('?') >= 0 && !figOff(k)));
    // Angle marks (as in Fishing Frenzy's lesson): the angle filled in as a wedge in its corner's own colour (A orange,
    // B green, C violet, D amber; once opposite angles are shown equal, A and C share A's and B and D share B's), edged
    // in navy, and its size in a darker shade of that colour. The size rides the interior bisector, pushed out just far
    // enough that its whole box clears both sides and the wedge; a corner too tight for that gets the smaller size.
    // The wedge and its value keep one size on screen whatever the shape's size (zs: the board's zoom), as there: the
    // wedge's radius is CONFIG.angleR(the angle) stage px (+3.5, its rim), clipped to the shape (index.html #shapeClip).
    ['A', 'B', 'C', 'D'].forEach((k) => {
      const n = this.nb(k), Vk = P[k], u = unit(Vk, P[n[0]]), v = unit(Vk, P[n[1]]);
      const cross = u.x * v.y - u.y * v.x;
      const R = CONFIG.angleR(this.angle(P, k)) / zs;
      const RW = R + 3.5 / zs, ws = { x: Vk.x + u.x * RW, y: Vk.y + u.y * RW }, we = { x: Vk.x + v.x * RW, y: Vk.y + v.y * RW };
      (this.arcR = this.arcR || {})[k] = RW; // (screen 24's protractor traces each angle out to its wedge's edge)
      const show = arcSet.indexOf(k) >= 0, peek = !show && !!em['a' + k] && vOn(k); // (named before it is drawn: it peeks in)
      // when several angles come in together their values fade in one after another (css .d0-.d3)
      const stag = (f.arcs || '').length > 1 ? ' d' + (f.arcs || '').indexOf(k) : '';
      g['a' + k] = { p: 'M' + r1(Vk.x) + ',' + r1(Vk.y) + ' L' + r1(ws.x) + ',' + r1(ws.y) + ' A' + r1(RW) + ',' + r1(RW) + ' 0 0 ' + (cross > 0 ? 1 : 0) + ' ' + r1(we.x) + ',' + r1(we.y) + ' Z',
        d: dsp(show || peek), cls: 'wedge k' + k + stag + pairCls(k) + (peek ? ' peek' : em['a' + k] ? ' emph' : '') + (askedK(k) ? ' asked' : '') + (fig && s.done ? '' : aDim(k)), o: r1(Vk.x) + 'px ' + r1(Vk.y) + 'px' };
      // its size wears the darker shade of the wedge's colour (lA..lD; equal opposite angles share A's or B's)
      const lk = /\bpa\b/.test(pairCls(k)) ? 'A' : /\bpb\b/.test(pairCls(k)) ? 'B' : k;
      const at = fig ? this.figVal(this.cur(), k, (fig.angles || {})[k] || '') : V[k] + '°';
      // The value sits inside its corner on the angle's bisector, just past the wedge and clear of both sides (as in
      // Fishing Frenzy's lesson): its box (21 px bold text at its 1.2x focus size, in screen px over the zoom) is moved
      // out from the corner until it clears both sides' strokes and the wedge's rim. It is sized by its value at least
      // '110°' wide, so every value sits at the same distance.
      const hw = 1.2 * (Math.max(4, at.length) * 11.5 + 6) / 2 / zs, hh = 1.2 * 14 / zs, sg = 2.5 + 5 / zs;
      const clearOf = (cx, cy) => {
        const sideGap = (w) => Math.abs((cx - Vk.x) * w.y - (cy - Vk.y) * w.x) - (hw * Math.abs(w.y) + hh * Math.abs(w.x));
        const near = Math.hypot(Math.max(0, Math.abs(cx - Vk.x) - hw), Math.max(0, Math.abs(cy - Vk.y) - hh));
        return sideGap(u) >= sg && sideGap(v) >= sg && near >= RW + 8 / zs;
      };
      let bx = u.x + v.x, by = u.y + v.y; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
      // (while the 180° demo is at this corner its half-disc is larger: the size steps out past it)
      const RD = this.suppAt && this.suppAt.k === k ? Math.max(RW, this.suppAt.R + 4 / zs) : RW;
      const clearOfD = (x, y) => clearOf(x, y) && Math.hypot(Math.max(0, Math.abs(x - Vk.x) - hw), Math.max(0, Math.abs(y - Vk.y) - hh)) >= RD + 6 / zs;
      let dl = RW + 6 / zs; while (dl < 160 && !clearOfD(Vk.x + bx * dl, Vk.y + by * dl)) dl += 1 / zs;
      (this.alabAt = this.alabAt || {})[k] = { x: Vk.x + bx * dl, y: Vk.y + by * dl }; // (where screen 24 counts the size up)
      if (fig) this.figPos[k] = { x: Vk.x + bx * dl, y: Vk.y + by * dl };
      aTag[k] = { t: at, x: r1(Vk.x + bx * dl), y: r1(Vk.y + by * dl), cls: 'alab l' + lk + stag + (show && !figOff(k) ? '' : ' off') + (at.indexOf('?') >= 0 ? ' q' : fig && ((fig.angles || {})[k] || '').indexOf('?') >= 0 ? ' solved' : '') + (em['a' + k] ? ' emph' : '') + (askedK(k) ? ' asked' : '') + (fig && s.done ? '' : aDim(k)) };
    });
    // vertices
    const dk = this.dragKey();
    ['A', 'B', 'C', 'D'].forEach((k) => {
      const Vk = P[k], drag = dk === k;
      // noDots hides the corner dots, but never the handle of a corner the learner can drag. As in Fishing Frenzy's
      // lesson: white dots ringed in blue; a corner named in the voice-over grows gold with a soft glow (css .vdot.on);
      // the corner to drag is the others' size, ringed in teal - small but plain to see - and beats gently until it has
      // been moved (.drag-cue), and all the while it is dragged (.dragging)
      const gold = !!em['v' + k];
      g['v' + k] = { x: r1(Vk.x), y: r1(Vk.y), r: vOn(k) && (!f.noDots || drag) ? 7 + (gold && !drag ? 3 : 0) : 0,
        c: gold ? '#ffab00' : drag ? PU : PAL.dot, w: gold || drag ? 4 : 3,
        cls: (gold && vOn(k) ? 'on' : '') + (drag && s.dragging ? ' dragging' : drag && !s.moved ? ' drag-cue' : '') };
      const tapV = task === 'tapEq' && !s.done;
      const conn = task === 'connect' && !s.done && !fig, used = conn && this.cornerUsed(k); // (its diagonal drawn: the corner is done with)
      if (used) g['v' + k].cls += ' used';
      // what the learner is to touch is what pulses - never a ring or a disc round it: on a tap-the-angle question each
      // angle still to try (its wedge) beats gently from its corner; on the diagonals each corner to draw from (its dot)
      const pulse = (tapV && !s.ang[k] && k !== st.ref) || (conn && !used && !(s.conn && s.conn.from === k));
      if (pulse && !this.busy()) {
        if (tapV && g['a' + k]) g['a' + k].cls += ' try'; // (each pulses while the question waits: css .wedge.try)
        if (conn) g['v' + k].cls += ' drag-cue';
      }
      // (an angle to tap is tapped in the angle - its target sits between its wedge and its size, inside the shape -
      // not on the corner point, so a tap near a corner never lands on the neighbouring angle)
      const inAngle = tapV && this.alabAt && this.alabAt[k] ? { x: Vk.x + (this.alabAt[k].x - Vk.x) * 0.55, y: Vk.y + (this.alabAt[k].y - Vk.y) * 0.55 } : Vk;
      g['k' + k] = {
        x: r1(inAngle.x), y: r1(inAngle.y), d: dsp(tapV || drag || (conn && !used)), cls: '',
        cur: drag ? (s.dragging ? 'grabbing' : 'grab') : 'pointer',
        click: tapV ? () => this.tapVertex(k) : noop,
        down: drag || conn ? (e) => this.down(k, e) : noop
      };
      if (conn && s.conn && s.conn.from === k) g['v' + k].r = 11;
      if (conn && s.conn && s.conn.near === k) { g['v' + k].r = 11; g['v' + k].c = '#ffab00'; g['v' + k].cls = 'on'; } // (the corner the line is on)
    });
    // labels: a fixed set of slots (hidden ones get "off") so each tag keeps its element and
    // only animates when it first appears
    const cx = (A.x + B.x + C.x + D.x) / 4, cy = (A.y + B.y + C.y + D.y) / 4;
    const tags = [];
    ['A', 'B', 'C', 'D'].forEach((k) => {
      // as in Fishing Frenzy's lesson: each corner letter sits 28 px outside its corner, mostly above (A, B) or below
      // (C, D) it, so it never lands on a side or its marks
      const Vk = P[k]; let dx = Vk.x - cx, dy = Vk.y - cy;
      { const l0 = Math.hypot(dx, dy) || 1; dx /= l0; dy /= l0; if (Math.abs(dy) < 0.82) { dy = (dy < 0 ? -1 : 1) * 0.82; dx = (dx < 0 ? -1 : 1) * 0.57; } }
      tags.push({ t: k, x: r1(Vk.x + dx * 28), y: r1(Vk.y + dy * 28), cls: 'vlab' + (vOn(k) && !f.noLetters ? '' : ' off') });
    });
    // on a tap-the-corner question an angle's size takes the tap as well as its corner
    if (task === 'tapEq' && !s.done) ['A', 'B', 'C', 'D'].forEach((k) => { if (k !== st.ref && !s.ang[k] && aTag[k] && !/ off\b/.test(aTag[k].cls)) { aTag[k].click = () => this.tapVertex(k); aTag[k].cls += ' tapme'; } });
    ['A', 'B', 'C', 'D'].forEach((k) => tags.push(aTag[k]));
    tags.push(s180 || { t: '180°', x: 0, y: 0, cls: 'alab s180 off' }); // (a fixed slot, so the tags after it keep their elements)
    // O: the diagonals' meeting point, its letter just above it (between the two diagonals)
    tags.push({ t: 'O', x: r1((A.x + C.x) / 2), y: r1((A.y + C.y) / 2 - 26), cls: 'vlab' + (f.O || (f.Oat && s.oIn) ? '' : ' off') });
    // a half-diagonal's length (a checkpoint's given AO = 6 cm, or the measured halves of screens 44-46): each beside
    // the middle of its own half (clear of its tick), out into a triangle of its own (AO toward AD, BO toward AB, ...),
    // so two never line up under one side - the length on the part it measures, not on a card away from it
    const measured = !fig && f.halves && (f.split || f.halfPairs);
    if ((fig && fig.halves) || measured) {
      const Om = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 };
      const found = fig ? this.figHalves(this.cur()) : {}, asked = {};
      if (fig) this.askedHalves(this.cur()).forEach((k) => { asked[k] = '?'; });
      const H = fig ? Object.assign({}, fig.halves, asked, found) : { A: this.cm(this.dist(Om, A)), B: this.cm(this.dist(Om, B)), C: this.cm(this.dist(Om, C)), D: this.cm(this.dist(Om, D)) };
      const hueOf = (k) => (f.halfPairs ? { A: 'A', C: 'A', B: 'B', D: 'B' }[k] : k); // (its half's colour: equal halves share one)
      const walked = task === 'measure' && st.segs; // (measured by the walk: each comes in as the tape lands on its half)
      Object.keys(H).forEach((k, i) => {
        // written along its half, as on a ruler (turned to the half's slope, never upside down), beside it in the triangle
        // the half shares with its neighbour (AO's and BO's in the one under AB, OC's and OD's in the one over CD): as near
        // the half's middle as its box fits inside that triangle clear of all three of its lines and of the letter O;
        // failing that, on the half's other side - so a length never touches a side, O or another length, and reads with
        // the half it measures
        const L = this.dist(P[k], Om) || 1, ux = (Om.x - P[k].x) / L, uy = (Om.y - P[k].y) / L;
        const unknown = walked && !s.tap['O' + k], txt = unknown ? '?' : H[k]; // (not measured yet: its length is a question)
        const hw = this.textW(txt, fig ? '800 17px Nunito' : '800 16px Nunito') / 2, hh = fig ? 11 : 10, gap = hh + 5; // (css .mtag.hv, .fig.hf)
        let deg = Math.atan2(uy, ux) * 180 / Math.PI;
        if (deg > 90) deg -= 180; else if (deg <= -90) deg += 180;
        const nb = { A: ['B', 'D'], B: ['A', 'C'], C: ['D', 'B'], D: ['C', 'A'] }[k];
        const inTri = (T, x, y) => T.every((p, j) => { const q = T[(j + 1) % 3], r = T[(j + 2) % 3], L2 = this.dist(p, q) || 1;
          const side = (X, Y) => ((q.x - p.x) * (Y - p.y) - (q.y - p.y) * (X - p.x)) / L2;
          return side(x, y) * Math.sign(side(r.x, r.y)) >= 6; }); // (6 px clear of the line, its stroke and a gap)
        const at = (t, into) => {
          const T = [Om, P[k], P[into]], cxh = P[k].x + ux * L * t, cyh = P[k].y + uy * L * t;
          let nx = -uy, ny = ux; if (nx * (P[into].x - cxh) + ny * (P[into].y - cyh) < 0) { nx = -nx; ny = -ny; }
          const c = { x: cxh + nx * gap, y: cyh + ny * gap };
          const ok = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every((e) => inTri(T, c.x + ux * hw * e[0] + nx * hh * e[1] * 0.75, c.y + uy * hw * e[0] + ny * hh * e[1] * 0.75));
          // (and clear of the letter O just above O: about 20 px across, in the label's own frame, a gap apart)
          const ox = Om.x - c.x, oy = Om.y - 26 - c.y, along = Math.abs(ox * ux + oy * uy), across = Math.abs(ox * nx + oy * ny);
          return ok && (!f.O || along > hw + 20 || across > hh + 22) ? c : null;
        };
        // (above its line, as writing sits on a line - every length the same way: into whichever neighbour's triangle
        // lies over its half, and only failing that the one under it)
        const up = (into) => { const mx = (P[k].x + Om.x) / 2, my = (P[k].y + Om.y) / 2; let nx = -uy, ny = ux; if (nx * (P[into].x - mx) + ny * (P[into].y - my) < 0) { nx = -nx; ny = -ny; } return ny; };
        const [first, other] = up(nb[0]) <= up(nb[1]) ? [nb[0], nb[1]] : [nb[1], nb[0]];
        let c = null;
        // (t: from the corner, 0, to O, 1 - tried from the half's middle outwards, nearest first)
        const ts = [0.5, 0.54, 0.46, 0.58, 0.42, 0.62, 0.38, 0.66, 0.34, 0.7, 0.3, 0.74, 0.26];
        for (const into of [first, other]) { for (const t of ts) { c = at(t, into); if (c) break; } if (c) break; }
        if (!c) c = at(0.5, first) || { x: (P[k].x + Om.x) / 2 - uy * gap, y: (P[k].y + Om.y) / 2 + ux * gap };
        if (fig) this.figPos['O' + k] = { x: c.x, y: c.y };
        tags.push({ t: txt, x: r1(c.x), y: r1(c.y), r: txt === '?' ? '0deg' : deg.toFixed(1) + 'deg', cls: toMark(k) || figOff('O' + k) ? 'mtag off' : fig ? 'mtag fig hf' + (found[k] ? ' solved' : H[k] === '?' ? ' q' : '') : walked ? 'mtag hv h' + hueOf(k) + (unknown ? ' wq' : '') : 'mtag hv h' + hueOf(k) + ' hd' + i });
      });
    }
    // a tag beside a side, pushed out along the side's outward normal far enough that its box clears the line
    // (as in Fishing Frenzy's lesson: the box's reach towards the side plus one small gap, so every label sits the same
    // distance from its side whatever its slope; a side carrying arrows or ticks keeps them clear (markGap) - a side
    // showing its length carries none)
    const marked = (p, q) => { const k = [p, q].map((V) => ['A', 'B', 'C', 'D'].find((x) => P[x] === V)).sort().join('');
      const key = { AB: 'AB', BC: 'BC', CD: 'CD', AD: 'DA' }[k]; return !!(key && (nArrows[key] || nTicks[key])); };
    const lNamed = ['lAB', 'lBC', 'lCD', 'lDA'].filter((k) => s.emph && s.emph[k]).length;
    const emL = (k) => (s.emph && s.emph['l' + k] ? ' emph' : lNamed && lNamed < 4 ? ' dim' : ''); // (the lengths grow when the line names them; the others step back)
    // A side's length sits OUTSIDE the shape, by the middle of its own side, upright, as far out as its own box and
    // the side's marks need - so each number reads with the side it measures; in = inside instead
    const side = (p, q, text, cls, show, inn) => {
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, L = this.dist(p, q) || 1;
      let nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L;
      if ((nx * (mx - cx) + ny * (my - cy) < 0) !== !!inn) { nx = -nx; ny = -ny; }
      // the label's own box (css: plain 21px Nunito 900, no padding): half width / half height in board px
      const hw = this.textW(text, '900 24px Nunito') / 2, hh = 15;
      const off = hw * Math.abs(nx) + hh * Math.abs(ny) + CONFIG.marks.labelGap + (marked(p, q) ? CONFIG.marks.markGap : 0);
      return { t: text, x: r1(mx + nx * off), y: r1(my + ny * off), cls: cls + (show ? '' : ' off') };
    };
    // (the measuring tape carries tick marks only - no numbers; each side's length is shown once, by its side)
    // lengths wear their sides' colours, as in Fishing Frenzy: AB, CD blue; AD, BC teal (mleg)
    tags.push(side(D, A, this.cm(ad), 'mtag mleg' + emL('DA'), isM && !!s.tap.DA)); // values only, no side names
    tags.push(side(B, C, this.cm(bc), 'mtag mleg' + emL('BC'), isM && !!s.tap.BC));
    tags.push(side(A, B, this.cm(this.dist(A, B)), 'mtag' + emL('AB'), isM && !!s.tap.AB));
    tags.push(side(D, C, this.cm(this.dist(D, C)), 'mtag' + emL('CD'), isM && !!s.tap.CD)); // all four outside, by their sides
    {
      const L = { DA: side(D, A, this.cm(ad), 'mtag mleg' + emL('DA'), !!f.legLen && lon('DA')), BC: side(B, C, this.cm(bc), 'mtag mleg' + emL('BC'), !!f.legLen && lon('BC')),
        AB: side(A, B, this.cm(this.dist(A, B)), 'mtag' + emL('AB'), !!f.sideLen && lon('AB')), CD: side(D, C, this.cm(this.dist(D, C)), 'mtag' + emL('CD'), !!f.sideLen && lon('CD')) };
      this.lenAt = L; // (where each length sits: the equal-sides slide carries one onto its opposite, runCue)
      tags.push(L.DA, L.BC, L.AB, L.CD);
    }
    if (fig && fig.sides) {
      const E = { AB: [A, B], BC: [B, C], CD: [D, C], DA: [D, A] };
      Object.keys(fig.sides).forEach((k) => { const t = this.figVal(this.cur(), k, fig.sides[k]); const tg = side(E[k][0], E[k][1], t, 'mtag fig' + (figOff(k) ? ' off' : '') + (k === 'BC' || k === 'DA' ? ' mleg' : '') + (t.indexOf('?') >= 0 ? ' q' : fig.sides[k].indexOf('?') >= 0 ? ' solved' : '') + emL(k), true); // (emL: it grows as its side is named)
        this.figPos[k] = { x: tg.x, y: tg.y }; tags.push(tg); });
    }
    // sideNums (screen 2): the four sides numbered clockwise from the left (storyboard page 2): 1 left, 2 top, 3 right,
    // 4 bottom - each number flies in from its
    // own side's direction, one after another (CSS .snum: ease-out, slight overshoot, 90% -> 100% scale)
    {
      const on = !!st.sideNums;
      tags.push(side(D, A, '1', 'snum n1', on));
      tags.push(side(A, B, '2', 'snum n2', on));
      tags.push(side(B, C, '3', 'snum n3', on));
      tags.push(side(D, C, '4', 'snum n4', on));
    }
    tags.forEach((t) => { if (!t.click) t.click = noop; if (!t.r) t.r = '0deg'; });
    return { g: g, tags: tags, V: V };
  }

  // a card as a notation panel: a small caption naming the property it states, and its relation signs (∥ = +) split
  // out so they wear the highlight colour (p0 s0 p1 s1 ... in index.html)
  // (its words in the player's language - I18n.label: a word card's, a caption, a unit - read from its English, c.t)
  chipView(c) {
    const t = I18n.label(c.show || c.t || ''), ttl = c.t || '', side = '(AB|BC|CD|AD|DA)', half = '(AO|OA|BO|OB|CO|OC|DO|OD)';
    const cap = /\bname\b|brk/.test(c.k) ? '' : /∥/.test(ttl) ? I18n.t('capParallelSides') : /^∠[A-D] = ∠[A-D]$/.test(ttl) ? I18n.t('capEqualAngles') :
      /180°/.test(ttl) ? I18n.t('capSupplementary') : new RegExp('^' + side + ' = ' + side + '$').test(ttl) ? I18n.t('capEqualSides') :
      new RegExp('^' + half + ' = ' + half + '$').test(ttl) ? I18n.t('capEqualHalves') : '';
    const bits = t.split(/ (∥|=|\+) /), v = { cap: cap };
    // the spaces travel with the sign, so unused slots take no room (the runtime wraps every value in a span: no :empty)
    for (let i = 0; i < 5; i++) { v['p' + i] = bits[2 * i] || ''; if (i < 4) v['s' + i] = bits[2 * i + 1] ? ' ' + bits[2 * i + 1] + ' ' : ''; }
    return v;
  }
  // The card (as Fishing Frenzy's lesson fits its plate). Each screen is a vertical stack - the shape (padded for its
  // letters and labels), then the block under it (answers, answer boxes, name tags). The shape has ONE place on every
  // screen: its stack always reserves the same lane under it (CONFIG.card.lane: two rows of name tags, the most any
  // explanation screen shows), its centre sits at the middle of the room left between the instruction plate and the
  // sand, and it is drawn as big as fits there (at most CONFIG.card.scale) - so it never twitches from screen to
  // screen whatever comes and goes under it. Only a block taller than the lane (a row of answer boxes with its tiles,
  // a wide answer on its own row) pulls it up, or shrinks it, as far as that block needs; the measuring screens and
  // the first put it right of Swiftee. Returns the scale, the shape point placed at F (stage px), and the stack's
  // shape bottom (where the answers / name tags start).
  sceneFit(st) {
    const C = CONFIG.card, P0 = st.fig ? st.fig.P : ((this.snaps && this.snaps[this.state.step]) || this.state.P);
    let x0 = Math.min(P0.A.x, P0.D.x), x1 = Math.max(P0.B.x, P0.C.x);
    const y0 = Math.min(P0.A.y, P0.B.y), y1 = Math.max(P0.C.y, P0.D.y);
    if (st.task === 'dragB') x1 = Math.max(x1, P0.C.x + (P0.A.x - P0.D.x)); // B slides out until BC is parallel to AD
    const f = st.f || {}, lengths = !!st.sideNums; // (labels round the outside of the sides - screen 2's numbers - need room; lengths sit inside)
    const padX = C.padX + (lengths ? C.lenPadX : 0), padT = C.padTop + (lengths ? C.lenPadY : 0), padB = C.padBottom + (lengths ? C.lenPadY : 0) + (f.sums ? 34 : 0);
    const w = x1 - x0 + 2 * padX, h = y1 - y0 + padT + padB;
    // name tags above the shape (a right answer's tags: under it, above the answers) - a practice question's too, when it
    // makes tags: their row then has its own room between the line and the shape
    const above = !!(st.chipTop && st.chipTop < 200);
    const top = above ? C.topChips : C.top, below = this.belowH(st);
    const walk = st.task === 'measure' || st.task === 'measureAngles' || !!st.own; // Swiftee measures, or speaks her own thought: the shape sits right of her
    // (Swiftee's own thought over lengths shown outside the shape: a little further right and narrower, so her bubble
    // stays clear of the left side's length)
    const ownLens = !!st.own && !!(f.sideLen || f.legLen);
    const cxS = st.id === 'intro' ? C.introCx : ownLens ? C.measureCx + 40 : walk ? C.measureCx : 640;
    const maxW = st.id === 'intro' ? C.introW : ownLens ? C.measureW - 80 : walk ? C.measureW : C.maxW;
    // (the lane under the shape: the answer row, the tallest thing most screens put there - one row of cards fits in it -
    // so the shape is as big as that leaves room for, and the same size from screen to screen)
    const lane = C.optGap + C.optH, room = C.bottom - top - lane; // (its size: as on every screen)
    const free = C.bottom - top - below; // the room this screen leaves it: under the line (and tags above) to the answers / tags / sand
    const kHome = Math.min(C.scale, maxW / w, room / h), k = Math.min(kHome, free / h);
    const y = top + Math.max(0, (free - h * k) / 2); // centred in that room, the same gap over it as under its block
    // the block under the shape (name cards, answers) starts right under it - under its corner letters - so a shape and
    // what it says read as one group, and the group is centred between the line and the sand
    // (head: the top of its corner letters, 23 board px over the top corners and 21 px tall on screen)
    return { k: k, cx: (x0 + x1) / 2, cy: (y0 - padT + y1 + padB) / 2, F: { cx: cxS, cy: y + h * k / 2 }, bottom: y + h * k, head: y + (padT - 23) * k - 11 };
  }
  // the height of what sits under the shape (stage px, with its gap): the answer row(s), the answer boxes (and their
  // tiles), or the name-tag lane - reserved on every explanation screen so the shape keeps one place from screen to screen
  belowH(st) {
    const C = CONFIG.card;
    if (st.opts && !st.grid && st === this.cur() && this.state.optsGone) return this.hasChips(st) ? C.chipGap + C.chipLane : 0; // (answered: the answers have gone)
    if (st.opts) {
      if (this.tagsAsked(st)) return C.chipGap + C.chipLane + C.optGap + C.optH; // (tags shown while it asks: their row, then the answers)
      if (!st.optWrap) return C.optGap + C.optH;
      const rows = (st.opts.some((o) => !o.wide) ? 1 : 0) + st.opts.filter((o) => o.wide).length; // short ones in a row, each wide one under
      return C.optGap + rows * C.optH + (rows - 1) * C.optGapX;
    }
    if (st.fill) return C.optGap + C.fillH + C.optGapX + C.tileH; // (the answer boxes, and the choices under them: the segments, or a number box's menu - which opens there, off the figure)
    if (!this.hasChips(st) || (st.chipTop && st.chipTop < 200)) return 0; // (no tags, or tags above it: nothing kept under it)
    return C.chipGap + (st.chipRows ? C.rowsH : C.chipLane);
  }
  // a right answer: the answers go, the shape (and its tags) settle into the room they leave - centred - and then the
  // praise and its pictures (fn), so nothing is drawn where the shape is leaving; a grid's cards are the question: they stay
  answersGo(st, fn) {
    if (!st.opts || st.grid) { fn(); return; }
    // (the praise comes at once, with the green answer; the answers go as it ends - or sooner, when a tag comes to take
    // their place: addChips - and the shape settles, centred, before the screen moves on)
    const tok = this.stepTok, glide = window.Motion && Motion.reduced ? 0 : 720; // (css .board, .chip-row: 0.7 s)
    this.afterPraise = () => { if (tok === this.stepTok && !this.state.optsGone) { this.setState({ optsGone: true }); this.busyFor(glide + 150); } };
    fn();
  }
  // a question showing tags while it asks (screen 27: screen 26's): their row under the shape, over the answers. A
  // question whose tags come with its right answer keeps no row for them - they take the answers' place as they go
  tagsAsked(st) { return !!(st.opts && !st.grid && st.enterChips); }
  tagsForAnswers(st) { return !!(st.opts && !st.grid && !st.enterChips && this.hasChips(st)); }
  // whether a screen shows cards under its shape at any point (so their row is kept free from the start)
  hasChips(st) {
    const f = st.f || {};
    const made = (cs) => (cs || []).some((c) => c.chip || c.tags || c.merge || c.boxMerge || made(c.steps));
    return !!(st.enterChips || st.okChips || made(st.okCues) || (st.lines || []).concat(st.after || []).some((L) => L.chips || made(L.cues)));
  }
  zoomTf(st) {
    const Z = this.sceneFit(st), B = CONFIG.board || { x: 640, y: 104 };
    // (and, while two sides are carried on until they meet, out about the shape's bottom middle just far enough for
    // their meeting point to show under the plate - never further; the same three steps otherwise, so it glides)
    let out = ' translate(0px, 0px) scale(1) translate(0px, 0px)';
    const M = this.meetZoom(st, Z);
    if (M) out = ' translate(' + M.px.toFixed(1) + 'px, ' + M.y1.toFixed(1) + 'px) scale(' + M.f.toFixed(3) + ') translate(' + (-M.px).toFixed(1) + 'px, ' + (-M.y1).toFixed(1) + 'px)';
    return 'translate(' + (Z.F.cx - B.x) + 'px, ' + (Z.F.cy - B.y) + 'px) scale(' + Z.k.toFixed(3) + ') translate(' + (-Z.cx).toFixed(1) + 'px, ' + (-Z.cy).toFixed(1) + 'px)' + out;
  }
  // the zoom out (f) about the shape's bottom middle (px, y1) that shows where the sides being carried on meet
  meetZoom(st, Z) {
    const X = this.state.meet && this.meetPoint(this.state.meet);
    if (!X) return null;
    Z = Z || this.sceneFit(st);
    const P = this.shapeP(), y1 = Math.max(P.C.y, P.D.y), px = (Math.min(P.A.x, P.D.x) + Math.max(P.B.x, P.C.x)) / 2;
    const bottom = Z.F.cy + Z.k * (y1 - Z.cy), top = CONFIG.card.top + 24;
    return { px: px, y1: y1, f: Math.max(0.4, Math.min(1, (bottom - top) / (Z.k * Math.max(1, y1 - X.y)))) };
  }
  // where two sides of the shape, carried on, meet (board px), or null if they never do (parallel)
  meetPoint(pair) {
    const P = this.shapeP(), end = (k) => [P[k[0]], P[k[1]]];
    const [a, b] = end(pair[0]), [c, d] = end(pair[1]);
    const r = { x: b.x - a.x, y: b.y - a.y }, q = { x: d.x - c.x, y: d.y - c.y }, den = r.x * q.y - r.y * q.x;
    if (Math.abs(den) < 1e-6) return null;
    const t = ((c.x - a.x) * q.y - (c.y - a.y) * q.x) / den;
    return { x: a.x + r.x * t, y: a.y + r.y * t };
  }
  // A wrong "these are parallel": the two sides light and are carried on, past their ends, until they meet - the
  // card zooming out just enough to show where (zoomTf) - while the tip is said; then they go and the card comes back.
  // span (s): from the cue's word to its until word - the lines meet as that word is said. They are drawn in the sides'
  // own colour and weight, from the corners, so they read as the same sides carried on.
  showMeet(pair, span) {
    const tok = this.stepTok, X = this.meetPoint(pair), settle = Motion.reduced ? 0 : 800;
    if (!X || !window.Motion) return;
    this.setState({ meet: pair, glow: pair });
    // (once the zoom has settled - its transition's end, however long the machine takes - the lines are drawn on the
    // stage, where the zoomed shape now is)
    let drawn = false;
    const board = typeof document !== 'undefined' && document.querySelector('.stage svg[data-board]');
    const zooms = !Motion.reduced && (this.meetZoom(this.cur()) || { f: 1 }).f < 0.999;
    if (board && zooms) board.addEventListener('transitionend', function done(e) { if (e.target === board && e.propertyName === 'transform') { board.removeEventListener('transitionend', done); draw(); } });
    const draw = () => {
      if (drawn || tok !== this.stepTok || !this.state.meet) return;
      drawn = true;
      const P = this.shapeP(), toStage = (p) => this.boardToStage(p);
      const edge = (k) => document.querySelector('.stage svg .edge.e' + k);
      const lines = pair.map((k) => {
        const a = P[k[0]], b = P[k[1]], near = Math.hypot(a.x - X.x, a.y - X.y) < Math.hypot(b.x - X.x, b.y - X.y) ? a : b;
        const from = toStage(near), to = toStage(X), far = toStage(near === a ? b : a), el = edge(k);
        if (!from || !to || !far) return null;
        const zoom = Math.hypot(from.x - far.x, from.y - far.y) / (Math.hypot(a.x - b.x, a.y - b.y) || 1); // (board px -> stage px)
        return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, col: (el && getComputedStyle(el).stroke) || CONFIG.palette.line, w: Math.max(3, 5 * zoom) };
      }).filter(Boolean);
      const at = toStage(X);
      if (lines.length === 2 && at) Motion.meet(lines, at, span ? Math.max(0.9, span - settle / 1000) : 1.3);
    };
    this.tm(draw, zooms ? settle + 900 : settle); // (no zoom, or no transition end heard: on time)
  }
  hideMeet() {
    if (!this.state.meet) return;
    const tok = this.stepTok, pair = this.state.meet;
    if (window.Motion) Motion.unmeet();
    // (its sides' light goes with it; a light lit since - a right answer's - stays)
    this.tm(() => { if (tok === this.stepTok) this.setState({ meet: null, glow: this.state.glow === pair ? null : this.state.glow }); }, Motion.reduced ? 0 : 420);
  }
  // a caption screen (reference isPlate): no Swiftee - her line is the navy plate across the top. She stays where she
  // does something: the first screen (she arrives and speaks), the measuring walk and the end
  // The answer row on the card: every pill as wide as the longest answer needs (measured in the pill's own font, as
  // css/game.css sizes it) plus even padding, never narrower than a comfortable tap target; the row is centred under the
  // shape. With optWrap the short answers share one row and each 'wide' answer spans a row of its own under it.
  optRow(st) {
    const C = CONFIG.card, O = st.opts || [], wrap = !!st.optWrap, gap = C.optGapX;
    if (!O.length) return { w: C.optW, left: 640 - C.optW / 2 };
    let m = this._measure;
    if (m === undefined) { try { m = document.createElement('canvas').getContext('2d') || null; } catch (e) { m = null; } this._measure = m; }
    if (!m) m = { font: '', measureText: (t) => ({ width: t.length * (parseFloat(m.font.slice(4)) || 26) * 0.52 }) }; // no canvas (headless test): an estimate
    // a pill's width for its text: short answers (68°, 6 cm) are set bigger, long ones smaller (css .opt.short / .long)
    const textW = (o) => { const t = I18n.label(o.t || o.id), long = t.length > 14, short = t.length <= 4; /* (as shown: renderVals mk) */ m.font = '700 ' + (long ? 28 : short ? 42 : 36) + "px 'Baloo 2', system-ui, sans-serif"; return m.measureText(t).width + 2 * (long ? C.pillPadLong : C.pillPad); };
    const narrow = O.filter((o) => !o.wide), cols = Math.max(1, narrow.length);
    let pw = Math.max(C.pillMin, ...narrow.map(textW));
    pw = Math.min(pw, (C.rowMax - gap * (cols - 1)) / cols);
    let w = cols * pw + gap * (cols - 1);
    O.filter((o) => o.wide).forEach((o) => { w = Math.max(w, textW(o)); });
    w = Math.ceil(Math.min(w, C.rowMax));
    return { w: w, left: Math.round(640 - w / 2), pw: Math.floor(pw) };
  }
  // the plate glides in once when a screen with Swiftee's bubble hands over to a caption screen (not on every line)
  plateEnter(st) {
    const step = this.state.step;
    if (this._plateStep !== step) { this._plateIn = !this._plateWas; this._plateWas = this.isPlate(st); this._plateStep = step; }
    return this._plateIn && this._plateWas;
  }
  // a narrator's line: the plate, without Swiftee. Before a screen's first line starts, its first line says; so the
  // card is a plate from the moment a narrated screen opens, and a screen of hers drops the plate as it opens - her
  // flight in is seen, not hidden behind the plate left by the screen before
  narrLine() {
    if (!this.state.opened || this.diveTl) return false; // (she is diving in: the card is hers)
    const st = this.cur(), L0 = st && (st.lines || [])[0];
    if (this.curLine && this.curLineStep === this.state.step) return !!this.curLine.narr;
    return !!(L0 && L0.narr);
  }
  isPlate(st) { return !!(this.state.opened && st && st.id !== 'intro' && st.task !== 'measure' && st.task !== 'measureAngles' && !st.own && !st.end && !st.summary && !(st.hero && JOURNEY)); } // (own: Swiftee's own thought, in her bubble)
  // A line in another language (I18n.tr): its own words, its *starred* ones the key words (gold, as KEY_WORDS are in
  // English), each \n a break. The voice is still the English line's and s.reveal counts its words (say()), so the shown
  // words come in at the same share of the line: the first with the voice's first word, the last with its last.
  shownWords(text, s) {
    const all = this.toWords(s.line || '').length, list = [];
    // (a number and its unit, and short equations, stay on one line, as toWords keeps them)
    const unit = I18n.t('unitCm').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const glue = new RegExp('(\\d) (cm|' + unit + ')(?=$|[\\s.,;:!?)।])', 'g'); // (।: the danda, hi and od's full stop)
    text.split('\n').forEach((part, li) => {
      if (li) list.push(null);
      let open = false; // (a star may open on one word and close on a later one)
      part.replace(glue, '$1\u00a0$2').replace(/ ([=+\u2212]) /g, '\u00a0$1\u00a0').split(/[ \t]+/).filter(Boolean).forEach((tok) => {
        let on = open, key = false;
        for (const ch of tok) { if (ch === '*') on = !on; else if (on) key = true; }
        open = on;
        const t = tok.replace(/\*/g, '');
        if (t) list.push({ t: t, key: key });
      });
    });
    const n = list.filter(Boolean).length, upTo = Math.min(n, Math.ceil(Math.min(s.reveal, all) * n / Math.max(1, all)));
    let i = 0;
    return list.map((w) => {
      if (!w) return { t: '', cls: 'brk' };
      const k = i++;
      return { t: w.t, cls: (k < upTo - 1 ? 'on' : (k === upTo - 1 ? (s.talking ? 'cur' : 'on') : '')) + (w.key ? ' key' : '') };
    });
  }
  // the markup's own words, in the player's language (index.html: {{tx.*}})
  texts() {
    return this._tx || (this._tx = {
      board: I18n.t('ariaBoard'), shapeA: I18n.t('ariaShape', { name: 'A' }), shapeB: I18n.t('ariaShape', { name: 'B' }),
      shapeC: I18n.t('ariaShape', { name: 'C' }), shapeD: I18n.t('ariaShape', { name: 'D' }), swiftee: I18n.t('altSwiftee'),
      lessonComplete: I18n.t('lessonComplete'), playAgain: I18n.t('lessonPlayAgain'), next: I18n.t('btnNext'),
    });
  }
  renderVals() {
    const s = this.state, steps = this.steps(), st = this.cur();
    const isLesson = !st.grid && !st.end && !st.summary; // (the summary draws its own ideas: no board)
    // a newline in a line forces a break in the bubble (a full-width zero-height item); it is not a word, so reveal timing is unchanged
    let wi = 0;
    let words = [];
    // the line in the player's language (shell/i18n.js; in English it is s.line itself)
    const shown = I18n.tr(s.line || '');
    if (shown === (s.line || '')) {
      (s.line || '').split('\n').forEach((part, li) => {
        if (li) words.push({ t: '', cls: 'brk' });
        // key words (the lesson's terms) wear gold on the caption plate, as in the reference (dual coding)
        this.toWords(part).forEach((w) => { const i = wi++, key = KEY_WORDS.test(w.toLowerCase().replace(/[^a-z0-9°]/g, '')) ? ' key' : '';
          words.push({ t: w, cls: (i < s.reveal - 1 ? 'on' : (i === s.reveal - 1 ? (s.talking ? 'cur' : 'on') : '')) + key }); });
      });
    } else {
      words = this.shownWords(shown, s);
      wi = words.filter((w) => w.cls !== 'brk').length;
    }
    // the narration plate: the whole line on one line (its own breaks ignored), each word popping in as it is said
    const onPlate = this.isPlate(st) || this.narrLine();
    if (onPlate) words = words.filter((w) => w.cls !== 'brk');
    const plate = onPlate ? this.plateFit(words) : null;
    const G = isLesson ? this.geo() : { g: {}, tags: [], V: {} };
    // chips
    const chips = s.chips.slice();
    // (the measured half-diagonals are on the halves themselves: tags, above - no cards for them)
    // cfu options
    const optPulse = s.hand && s.hand.kind === 'opts';
    // once answered, the other answers fold away and the right one (or ones) settle alone in the centre - on every row
    // of answers (not the grid of shapes): no greyed answers left lying about
    const soloRow = !!(st.opts && !st.grid), solo = soloRow && !!s.done;
    // (an answer as shown: in the player's language, I18n.label - its English, o.t, is what is checked)
    const mk = (o) => ({ id: o.id, t: I18n.label(o.t || o.id), cls: (s.picks[o.id] || (optPulse && !s.done ? 'nudged' : '')) + (o.wide ? ' wide' : '') + (I18n.label(o.t || o.id).length > 14 ? ' long' : I18n.label(o.t || o.id).length <= 4 ? ' short' : '') + (solo ? (o.ok ? ' solo' : ' leave') : ''), dis: !!s.picks[o.id] || s.done, pick: () => this.pick(o) });
    const c1 = {};
    if (st.grid) st.opts.forEach((o) => { c1[o.id] = mk(o); });
    // screen-change fade class; combined classes below are built here because the template runtime drops a class
    // attribute that starts with a binding and holds two bindings ("{{a}} {{b}}")
    const fadeV = st.end || st.cp || st.fig ? (s.step % 2 ? 'fadeA' : 'fadeB') : 'fadeA';
    const hasOpts = !!(st.opts && !st.grid);
    // fill / match: the blanks row and the tile tray under the board
    const F = s.fill || this.freshFill(), FD = st.fill;
    const actB = FD && !s.done ? this.activeBlank() : null;
    const dd = !!(FD && !FD.match);
    const blanks = FD ? FD.blanks.map((b, i) => ({ id: b.id, pre: b.pre || '', post: I18n.label(b.post || ''), eq: FD.match && i % 2 === 0 ? '=' : '',
      aria: I18n.t('ariaAnswerBox', { name: b.pre || '' }),
      ph: dd && !F.at[b.id] ? 'ph' : '', exp: 'false',
      gap: (FD.match && i % 2 === 1 && i < FD.blanks.length - 1 ? 'gap' : '') + (b.pair && s.boxGone && s.boxGone[b.pair] ? ' gone' : ''), // (gone: merged into its tag)
      t: (s.boxVal && s.boxVal[b.id]) || F.at[b.id] || (dd ? '?' : ''), cls: 'blank' + (dd ? ' dd' : '') + (F.locked[b.id] ? ' good' : F.bad[b.id] ? ' bad' : F.at[b.id] ? ' full' : b.id === actB ? ' act' : '') + (FD.match ? ' seg' : '') + (dd && F.open === b.id ? ' open' : '') + (b.pair && s.boxHi === b.pair ? ' hot' : '') +
        (s.boxVal && s.boxVal[b.id] ? ' val' : s.boxBack && s.boxBack[b.id] ? ' back' : ''), // (pairJump: a length in the box a moment, then its name again)
      tap: () => this.blankTap(b.id) })) : [];
    // the choices: for a number box, in its own menu (ddOpen); for the segment pairs, tiles under the boxes, tapped
    // (into the picked box) or dragged onto a box
    const tiles = FD && !dd ? FD.tiles.map((t, i) => ({ t: t, i: i, cls: 'tile' + (this.tileUsed(t) ? ' used' : '') + (F.drag && F.drag.t === t ? ' lift' : '') + (s.done || (F.checking && !FD.match) ? ' spent' : '') + (s.done ? ' done' : ''), down: (e) => this.tileDown(t, e) })) : [];
    const opts = hasOpts ? st.opts.map(mk) : [];
    // end
    const nRight = Object.keys(s.results).filter((k) => s.results[k]).length;
    const nStars = CONFIG.stars.find((r) => nRight >= r[0])[1];
    const nChecks = steps.filter((x) => x.cp).length;
    return {
      rootMove: (e) => this.rootMove(e),
      rootUp: (e) => this.rootUp(e),
      start: () => this.start(),
      begin: () => this.begin(),
      restart: () => this.restart(),
      replay: () => this.replay(),
      notStarted: !JOURNEY && !s.started && !s.opening && !s.opened, // on its own page: the Next that starts it
      isLesson: isLesson && s.started,
      isCfu1: !!st.grid,
      fillOn: !!FD, blanks: blanks, tiles: tiles,
      menuOn: !!(dd && F.open && F.menu), menu: F.menu ? { x: F.menu.x, y: F.menu.y, w: F.menu.w, nx: F.menu.nx, cls: 'dd-menu' + (F.menu.up ? ' up' : '') + (F.closing ? ' closing' : '') } : { x: 0, y: 0, w: 0, nx: 0, cls: 'dd-menu' },
      menuItems: dd && F.open ? FD.tiles.map((t) => { const no = ((F.tried || {})[F.open] || []).indexOf(t) >= 0; return { t: t, cls: 'dd-item' + (no ? ' tried' : ''), dis: no, pick: () => { if (!no) this.ddPick(F.open, t); } }; }) : [], fillCls: 'fill-ui ' + fadeV + (this.busy() ? ' wait' : ' go') + (FD && FD.match ? ' match' : ''),
      ghostOn: !!(F.drag), ghost: F.drag ? { t: F.drag.t, x: Math.round(F.drag.x), y: Math.round(F.drag.y) } : { t: '', x: 0, y: 0 },
      gridCls: fadeV + (this.busy() ? ' wait' : ' go'),
      isEnd: !!st.end && !JOURNEY, // (in the journey the fishing follows: no score card or Play again, but Next)
      endNext: !!(st.end && JOURNEY && s.endNext && !this.handedOff),
      endGo: () => { if (!this.handedOff) { this.sfx('tap'); this.setState({ endNext: false }); this.handOff(); } },
      showSumNext: !!(st.summary && s.sumNext && !this.handedOff), sumNextGo: () => this.sumNextGo(),
      g: G.g, tags: G.tags.map((tg) => { const t = I18n.label(tg.t); return t === tg.t ? tg : Object.assign({}, tg, { t: t }); }), // (a unit in the player's language)
      words: words, plateW: plate ? plate.w : 0,
      // a line with its own breaks keeps exactly those lines: the bubble widens instead of wrapping again
      bubCls: s.bub + (shown.indexOf('\n') >= 0 ? ' manual' : ''),
      // lesson steps share one board, so it only fades in when it first appears; each check fades in fresh
      fadeCls: fadeV,
      chipRowCls: st.chipRows ? ' top' : '', // rows grow downward from chipTop, so the first row never moves
      // chipRows: the name card sits on its own centred row under the others; chipHi: the card for the pair being said
      // a card about a pair of sides wears that pair's colour (AB, CD: pairA; AD, BC: pairB), like the sides themselves
      chips: chips.reduce((a, c) => a.concat(st.chipRows && /\bname\b/.test(c.k) && a.length ? [{ t: '', k: 'brk' }] : [], [c]), [])
        .map((c) => (/^(AB|CD) [∥=] (AB|CD)$/.test(c.t) ? Object.assign({}, c, { k: c.k + ' pairA' }) :
          /^(AD|BC) [∥=] (AD|BC)$/.test(c.t) ? Object.assign({}, c, { k: c.k + ' pairB' }) : c))
        .map((c) => ((v) => Object.assign(v, { k: v.k + (v.cap ? ' hascap' : '') }))(Object.assign({ t: c.t, a: I18n.label(c.t), k: c.k + (I18n.label(c.t).length > 20 ? ' long' : '') + (c.arriving ? ' arriving' : c.landed ? ' landed' : '') + (c.kept ? ' kept' : '') + (c.morph ? ' m' + c.morph : '') + (c.t && c.t === s.chipHi ? ' hi' : s.chipHi && c.k !== 'brk' ? ' lo' : '') }, this.chipView(c)))),
      rootDown: (e) => this.rootDown(e),
      wordSize: plate ? plate.size : wi > 15 || shown.replace(/\*/g, '').length > 80 ? 22 : 24, // the plate's fit; a long bubble line gets the smaller size
      c1: c1, hasOpts: hasOpts, opts: opts,
      // the answers (and answer boxes) in a row under the shape, centred on the card
      optTop: isLesson ? Math.round(this.sceneFit(st).bottom + CONFIG.card.optGap + (this.tagsAsked(st) ? CONFIG.card.chipGap + CONFIG.card.chipLane : 0)) : 376, // (under a right answer's tags)
      optLeft: this.optRow(st).left, optPill: this.optRow(st).pw, // (a pill's own width: a right answer left alone keeps it)
      optW: this.optRow(st).w, optCls: fadeV + (s.optsGone ? ' gone' : '') + (this.busy() ? ' wait' : ' go') + (st.optWrap ? ' wrap' : '') + (st.multi ? ' multi' : '') + (soloRow ? ' solo-ok' : ''),
      // the name tags: under the shape, or above it on a question screen (its answers have the space under it)
      // (tags under the shape: their row centred in the lane kept for them - between its letters and the answers or sand)
      // (tags above the shape: their row centred between the line's plate and the shape's letters)
      chipTop: isLesson ? (st.chipTop && st.chipTop < 200 ? Math.round((CONFIG.card.plateBottom + this.sceneFit(st).head) / 2 - 52) : Math.round(this.sceneFit(st).bottom + CONFIG.card.chipGap + CONFIG.card.chipLane / 2 - 52)) : st.chipTop || 528, chipLeft: 200, // (the row: 1040 wide, centred on the card, so four tags stay one row)
      stars: [0, 1, 2].map((i) => ({ cls: i < nStars ? 'on' : '' })),
      scoreText: I18n.t('lessonScore', { right: nRight, total: nChecks }),
      tx: this.texts(), // the markup's own words
      // every screen is a scene on the card: the shape centred on it, Swiftee (where she is) on the sand at the left
      sceneCls: (s.opened ? 'in-card ' : s.opening ? 'card-wait ' : 'pre-open ') + 'scene' + (this.plateEnter(st) ? ' plate plate-enter' : this.isPlate(st) ? ' plate' : this.narrLine() ? ' plate' : '') + (st.skin ? ' skin-' + st.skin : '') + (st.summary ? ' summary' : '') + (st.hero && JOURNEY ? ' hero endhero' : '') + (st.fig ? ' figsync' : '') + (st.task === 'measure' || st.task === 'measureAngles' || st.own ? ' measure-room' : '') + (st.okGlow || (st.lines || []).some((L) => L.cues) ? ' cue-pulse' : ''), // skin: a screen's own look; summary / measure-room: their own places for Swiftee (css/game.css)
      boardTf: isLesson ? this.zoomTf(st) : 'none',
      boardZ: isLesson ? this.sceneFit(st).k : 1, // the board's zoom: angle values keep one size on screen (css .tag.alab)
      meetZ: (isLesson && this.meetZoom(st) || { f: 1 }).f.toFixed(3), // (zoomed out to show where sides meet: the letters keep their size)
      boardCls: fadeV,
      // the shape (and its labels) zooms once about its own centre on a cue (Motion.pop)
      popO: s.P ? Math.round((s.P.A.x + s.P.B.x + s.P.C.x + s.P.D.x) / 4) + 'px ' + Math.round((s.P.A.y + s.P.B.y + s.P.C.y + s.P.D.y) / 4) + 'px' : 'center',
      swCls: s.swAway ? 'swiftee away' : 'swiftee',
      bubHide: !s.line ? 'gone' : s.swAway || s.bubOff ? 'away' : '', // (she sets off: her bubble fades, never blinks out)
      // hand: fingertip lands on (x, y); drags travel (dx, dy). key restarts the animation on each showing
      handOn: !!(s.hand && s.hand.kind !== 'opts'),
      hand: s.hand && s.hand.kind !== 'opts'
        ? { cls: 'hand-nudge ' + s.hand.kind + (s.hand.down ? ' down' : '') + (s.hand.once ? ' once' : ''), x: s.hand.x, y: s.hand.y, dx: s.hand.dx, dy: s.hand.dy }
        : { cls: 'hand-nudge', x: 0, y: 0, dx: 0, dy: 0 }
    };
  }
};
