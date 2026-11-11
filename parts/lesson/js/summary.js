// =====================================================================
// SUMMARY — "Let's recall what we learnt about parallelograms" (Fishing Frenzy's lesson summary, parts/lesson/js/summary.js
// there, brought to the parallelogram). One glassy bubble per idea, in the order the lesson taught them. Each goes
// through these states, strictly in turn:
//   CARD_ENTER      the bubble blows up in the middle of the card
//   CONCEPT_REVEAL  its idea is drawn on the parallelogram inside it
//   SWIFTEE_ENTER   Swiftee rises from behind the bubble (she is under the bubble layer, so it hides her body)
//   EXPLANATION     she says one line; key words light up the part of the bubble they name
//   READING_PAUSE   a short breath
//   SWIFTEE_EXIT    she sinks back behind the bubble
//   CARD_COLLECT    the bubble shrinks into an album at the side (three on the left, three on the right)
//   NEXT_CONCEPT    then the next idea
// After the last: FINAL_SUMMARY (the albums gather in, she rises and every idea glows once; no closing line), then READY
// (tapping a bubble replays its idea, and Next moves on when the learner chooses). Each state waits for the one before,
// so lines never overlap and nothing can be tapped while she talks.
// Coordinates are the kit's 1000 x 562 board, scaled to the 1280 x 720 stage. Reduced motion: same states, no movement.
// Engine: Summary.enter(engine, ready) when the screen opens (ready: she is up, the opening line may start),
// Summary.start(engine) once that line is said, Summary.stop() on every screen change, Summary.lines() = the lines
// she says here (for the voice-over loader).
// =====================================================================
(function () {
  const G = window.gsap, NS = 'http://www.w3.org/2000/svg', W = 1000, H = 562;
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- layout in board units (1000 x 562), and timings ----------
  const SUM = { card: { cx: 500, cy: 322, w: 300 }, mini: { w: 132, y: [200, 378], plate: { w: 118, h: 27, size: 15.5, rim: 2 } }, enterMs: 420, collectMs: 580, pauseMs: 200 };
  // each idea is a glassy bubble on the sea card: its centre and radius, the zoom of the idea drawn inside it, the
  // idea's centre in its own units (the shape plus the sum line under it), how far Swiftee peeks higher, and the
  // docked bubbles' columns (wide apart, so the round bubbles and their plates never touch)
  const BUB = { cx: 500, cy: 346, r: 160, k: 1.28, oy: 327, enterMs: 560, peekDy: -35, tailDy: 24, miniX: [[68, 232], [768, 932]] };
  // the lesson's colours (css/game.css, config.js palette): blue sides, teal second pair, pale-aqua fill, orange parallel
  // arrows; one colour per angle, opposite angles sharing one once shown equal
  const INK = { base: '#1e7bff', leg: '#00b8a9', fill: 'rgba(228,251,255,0.96)', chev: '#ff7a00', navy: '#123b63', diag: ['#ff7a00', '#00c853', '#9d4dff', '#ffab00'] };
  const ANG = { A: '#ff7a00', B: '#00c853', C: '#ff7a00', D: '#00c853' };
  const TXT = { A: '#e65100', B: '#00963f', C: '#e65100', D: '#00963f' };
  // Swiftee's two spots: 'peek' over the bubble's top edge, 'middle' standing on the sand between the albums. y = offset
  // in stage px from her CSS position, s = scale of her 259 px box, hide = how far she sinks to be out of sight
  const SPOT = { peek: { y: 0, s: 218 / 259, hide: 154 }, middle: { y: 308, s: 300 / 259, hide: 300 } }; // (middle: her feet on the sand)

  // ---------- the parallelogram in every bubble (board units): AB at y = TOP, DC at y = BOT; lean 37, so ∠D = 70° ----------
  const TOP = 262, BOT = 364, LEAN = 37;
  const P = { A: { x: 442, y: TOP }, B: { x: 592, y: TOP }, C: { x: 555, y: BOT }, D: { x: 405, y: BOT } };
  const SIDES = { AB: ['A', 'B'], BC: ['B', 'C'], DC: ['D', 'C'], DA: ['D', 'A'] };
  const O = { x: (P.A.x + P.C.x) / 2, y: (P.A.y + P.C.y) / 2 };

  // ---------- the ideas, in teaching order. card() draws any of them from this data; the lines are the lesson's recap
  // clips (vo_lines.js) ----------
  // (the words are in locales/locales.json: a line is its English, I18n.plain - its clip and its cue words are the English
  // line's, and the engine shows it in the player's language; a name plate is only shown, so it is in that language, T)
  //   visual: draw (outline draws itself); chev (parallel arrows on both pairs); ticks (equal-length ticks on both
  //           pairs); wedges (angles with their values); lit (sides that glow); diag (the diagonals, O and their equal halves)
  //   cue:    spoken word -> what it highlights (see cue() below)
  const IDEAS = [
    { id: 'parallelogram', label: T('wordParallelogram'), t: I18n.plain('sumParallelogram'),
      visual: { draw: true, chev: true }, cue: { quadrilateral: 'outline', parallel: 'pair' } },
    { id: 'parallel', label: T('capParallelSides'), t: I18n.plain('sumParallel'),
      visual: { chev: true }, cue: { opposite: 'pairs', parallel: 'chev' } },
    { id: 'equal', label: T('capEqualSides'), t: I18n.plain('sumEqual'),
      visual: { ticks: true }, cue: { opposite: 'pairs', equal: 'ticks' } },
    { id: 'angles', label: T('capEqualAngles'), t: I18n.plain('sumAngles'),
      visual: { wedges: ['A', 'B', 'C', 'D'] }, cue: { angles: 'wedges', equal: 'values' } },
    { id: 'supplementary', label: T('capSupplementary'), t: I18n.plain('sumSupplementary'),
      visual: { wedges: ['A', 'B'], lit: ['AB'] }, cue: { adjacent: 'lit', angles: 'wedges', supplementary: 'tag', add: 'add', 180: 'sum' } },
    { id: 'diagonals', label: T('capDiagonals'), t: I18n.plain('lsDiagonalsBisect'),
      visual: { diag: true }, cue: { diagonals: 'diag', bisect: 'halves' } }
  ];

  // ---------- small helpers ----------
  // make an SVG element: null attributes are skipped, attrs.text becomes its text
  function mk(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => { if (attrs[k] == null) return; if (k === 'text') el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }
  const f1 = (n) => +n.toFixed(1);
  const unit = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L, L: L }; };

  const Summary = {
    run: 0, S: null,
    get state() { return this.S ? this.S.state : null; },
    lines() { return IDEAS.map((c) => c.t); },

    // ---------- screen opens: build the bubble layer; Swiftee rises in the middle for the opening line ----------
    enter(engine, ready) {
      this.stop();
      const root = document.querySelector('.stage .sum-root');
      if (!root) { if (ready) ready(); return; } // (no layer: she speaks anyway)
      const run = ++this.run, eng = engine, tok = eng.stepTok;
      this.eng = eng;
      // live() turns false once the screen changes; every async step checks it, so nothing runs late
      const live = () => run === this.run && tok === eng.stepTok && root.isConnected;
      this.live = live;
      this.ctx = G ? G.context(() => {}) : null;
      this.timers = [];
      root.innerHTML = '';
      const svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + H, width: 1280, height: 720, 'aria-label': T('ariaSummary'), role: 'img' }, root);
      this.svg = svg;
      this.defs = mk('defs', {}, svg);
      this.layer = mk('g', {}, svg);
      this.fx = mk('g', { 'pointer-events': 'none' }, svg);
      this.root = root;
      this.S = { cards: {}, collected: [], active: null, state: 'SUMMARY_START' };
      this.busy = false;
      this.setState('SUMMARY_START');
      this.layer.addEventListener('pointerdown', (e) => {
        const g = e.target.closest && e.target.closest('.summary-card');
        if (g && this.S && this.S.state === 'READY') this.replay(g.getAttribute('data-concept'));
      });
      // she rises into the middle, and speaks once she is up
      this.place('middle', true, 0);
      this.rise('middle').then((ok) => { if (ok && ready) ready(); });
    },
    // after the opening line: each idea in turn, then the finale. A step that resolves false (screen changed) ends the chain
    start(engine) {
      if (!this.S || engine !== this.eng || !this.live()) { this.enter(engine); }
      const live = this.live;
      if (!live()) return;
      this.hush();
      let chain = this.sink().then(() => live());
      IDEAS.forEach((c) => {
        chain = chain.then((ok) => ok && this.show(c))
          .then((ok) => { if (!ok) return false; this.setState('SWIFTEE_ENTER', c.id); return this.rise('peek'); })
          .then((ok) => { if (!ok) return false; this.setState('EXPLANATION', c.id); return this.say(c); })
          .then((ok) => { if (!ok) return false; this.setState('READING_PAUSE', c.id); this.hush(); return this.hold(SUM.pauseMs); })
          .then((ok) => { if (!ok) return false; this.setState('SWIFTEE_EXIT', c.id); return this.sink(); })
          .then((ok) => ok && this.collect(c.id));
      });
      return chain.then((ok) => ok && this.hold(400))
        .then((ok) => ok && this.gather())
        .then((ok) => ok && this.rise('middle'))
        .then((ok) => { if (ok) this.cue('all'); return ok && this.hold(600); })
        .then((ok) => { if (ok && live()) { this.hush(); this.ready(); } return ok; });
    },
    // screen change: cancel timers and tweens, put Swiftee and her bubble back, clear the layer
    stop() {
      this.run++;
      (this.timers || []).forEach(clearTimeout); this.timers = [];
      if (this.ctx) { this.ctx.revert(); this.ctx = null; }
      const sw = document.querySelector('.stage .swiftee');
      if (sw && G) G.set(sw, { clearProps: 'transform,opacity' });
      this.peekMask(false);
      if (this.root) { this.root.innerHTML = ''; delete this.root.dataset.spot; }
      this.root = null; this.S = null; this.busy = false;
    },
    // also written to the root as data-state, for tests and debugging
    setState(state, id) {
      if (!this.S) return;
      this.S.state = state;
      if (this.root) this.root.setAttribute('data-state', state + (id ? ':' + id : ''));
    },

    // ---------- timing: no timer fires after the screen has changed ----------
    later(ms, fn) { const live = this.live, t = setTimeout(() => { if (live()) fn(); }, ms); this.timers.push(t); return t; },
    hold(ms) { const live = this.live; return new Promise((r) => { if (reduced() || !ms) { r(live()); return; } this.later(ms, () => r(true)); this.timers.push(setTimeout(() => { if (!live()) r(false); }, ms + 20)); }); },
    sfx(k) { if (this.live && this.live()) this.eng.sfx(k); },

    // ---------- Swiftee: the lesson's own mascot element, moved between the two SPOTs ----------
    place(where, down, ms) {
      const sw = document.querySelector('.stage .swiftee');
      this.spot = where || this.spot || 'middle';
      const P0 = Object.assign({}, SPOT[this.spot]);
      if (this.spot === 'peek') P0.y += BUB.peekDy; // (her face and mask clear the bubble's top as she peeks)
      // her speech bubble sits just over her head at either spot (css/game.css .sum-root[data-spot] + .bubble: an inline
      // style would be written over by the stage's next render); in the middle it stays narrow enough to fit between the albums
      if (this.root) this.root.dataset.spot = this.spot;
      if (!sw || !G) return Promise.resolve(this.live());
      const to = { y: P0.y + (down ? P0.hide : 0), scale: P0.s, opacity: down ? 0 : 1 };
      const mask = () => this.peekMask(this.spot === 'peek'); // (behind the see-through bubble: cut out where it covers her)
      if (!ms || reduced()) { this.ctx.add(() => { G.set(sw, to); mask(); }); return Promise.resolve(this.live()); }
      return new Promise((res) => this.ctx.add(() => G.to(sw, Object.assign(to, { duration: ms / 1000, ease: down ? 'power2.in' : 'power3.out', onStart: mask, onUpdate: mask, onComplete: () => { mask(); res(this.live()); } }))));
    },
    // rise: start out of sight, come up (340 ms). sink: drop out of sight (300 ms)
    rise(where) { this.place(where, true, 0); this.eng.pose('happy'); return this.place(where, false, 340); },
    sink() { return this.place(null, true, 300); },
    // say one line in Swiftee's voice; each cue word calls cue() as it is spoken. Resolves when the line ends
    say(c) {
      const live = this.live;
      return new Promise((res) => {
        if (!live()) { res(false); return; }
        const cues = Object.keys(c.cue || {}).map((w) => ({ at: String(w), fn: () => this.cue(c.cue[w]) }));
        this.eng.say({ m: c.m || 'happy', t: c.t, cues: cues }, () => res(live()));
      });
    },
    // hide the speech bubble
    hush() { if (this.live && this.live()) this.eng.setState({ bubOff: true }); },

    // ---------- build one bubble: the glassy skin, the parallelogram (hidden until reveal) and its name plate ----------
    card(c) {
      const w = 2 * BUB.r, h = 2 * BUB.r, cx = BUB.cx, cy = BUB.cy, x = cx - w / 2, y = cy - h / 2;
      const g = mk('g', { 'class': 'summary-card', 'data-concept': c.id }, this.layer);
      g._rect = { x: x, y: y, w: w, h: h }; g._c = c;
      const pp = mk('g', {}, g); g._pop = pp;           // animations run on the inner group, the collect transform on the outer
      this.bubble(pp, cx, cy, BUB.r);
      // the idea is drawn larger, centred in the bubble (everything inside vis scales with it)
      const host = mk('g', { transform: 'translate(' + cx + ' ' + cy + ') scale(' + BUB.k + ') translate(' + (-SUM.card.cx) + ' ' + (-BUB.oy) + ')' }, pp);
      const vis = mk('g', {}, host); g._vis = vis;
      g._P = P;
      g._fill = mk('polygon', { points: ['A', 'B', 'C', 'D'].map((k) => f1(P[k].x) + ',' + P[k].y).join(' '), fill: INK.fill, opacity: 0 }, vis);
      g._bands = mk('g', {}, vis);                       // highlight bands, under the side lines
      g._wedgeG = mk('g', {}, vis);
      g._sides = {};
      Object.keys(SIDES).forEach((s) => {
        const a = P[SIDES[s][0]], b = P[SIDES[s][1]];
        g._sides[s] = mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: s === 'AB' || s === 'DC' ? INK.base : INK.leg, 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0 }, vis);
      });
      g._marks = mk('g', {}, vis);
      g._dots = ['A', 'B', 'C', 'D'].map((k) => mk('circle', { cx: P[k].x, cy: P[k].y, r: 4.2, fill: '#fff', stroke: INK.base, 'stroke-width': 2.2, opacity: 0 }, vis));
      // the corner letters, as on the lesson's board, so the line's AB, CD and ∠A can be found in the bubble
      const OFF = { A: [-11, -9], B: [11, -9], C: [11, 13], D: [-11, 13] };
      g._letters = ['A', 'B', 'C', 'D'].map((k) => mk('text', { x: f1(P[k].x + OFF[k][0]), y: f1(P[k].y + OFF[k][1] + 4), 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 900,
        'font-family': 'Nunito, system-ui, sans-serif', fill: INK.navy, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round', opacity: 0, text: k }, vis));
      // the name plate centred on the bubble's bottom edge
      g._tag = this.nameTag(pp, cx, cy + BUB.r - 2, c.label);
      g._tag.setAttribute('opacity', 0);
      return g;
    },
    // a real bubble, like the card's own: see-through (the water shows through its middle), brightening to a thin
    // white rim where the film turns edge-on, a faint soap-film rainbow round the edge, a window glint top left and a
    // soft crescent bottom right. No shadow: it floats. Its skin sways gently (css .sum-bub-skin); the idea drawn in
    // it stays still. Swiftee peeking from behind it is cut out where it covers her (peekMask)
    bubble(parent, cx, cy, r) {
      if (!this.defs.querySelector('#sumFilm')) {
        const rg = mk('radialGradient', { id: 'sumFilm', cx: '50%', cy: '50%', r: '50%' }, this.defs);
        [['0%', '#ffffff', 0.12], ['60%', '#effcff', 0.16], ['82%', '#ffffff', 0.26], ['94%', '#ffffff', 0.5], ['100%', '#ffffff', 0.8]]
          .forEach((st) => mk('stop', { offset: st[0], 'stop-color': st[1], 'stop-opacity': st[2] }, rg));
        const sh = mk('linearGradient', { id: 'sumSheen', x1: 0, y1: 0, x2: 1, y2: 1 }, this.defs);
        [['0%', '#7ff3ff'], ['28%', '#b9a2ff'], ['52%', '#ff9fd8'], ['76%', '#ffe58a'], ['100%', '#8dffc6']].forEach((st) => mk('stop', { offset: st[0], 'stop-color': st[1] }, sh));
        const soft = mk('filter', { id: 'sumSoft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, this.defs);
        mk('feGaussianBlur', { stdDeviation: 2.4 }, soft);
      }
      const skin = mk('g', { 'class': 'sum-bub-skin' }, parent);
      mk('circle', { cx: cx, cy: cy, r: r, fill: 'url(#sumFilm)' }, skin);
      mk('circle', { cx: cx, cy: cy, r: f1(r * 0.955), fill: 'none', stroke: 'url(#sumSheen)', 'stroke-width': f1(r * 0.07), opacity: 0.5, filter: 'url(#sumSoft)' }, skin);
      mk('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: '#ffffff', 'stroke-width': f1(r * 0.014), 'stroke-opacity': 0.92 }, skin);
      // the glints hug the rim (clear of the idea inside): a curved window top left with a dot after it, a faint crescent bottom right
      const arc = (rr, a0, a1, w, o) => mk('path', { d: 'M' + f1(cx + rr * Math.cos(a0)) + ',' + f1(cy + rr * Math.sin(a0)) + ' A' + f1(rr) + ',' + f1(rr) + ' 0 0 1 ' + f1(cx + rr * Math.cos(a1)) + ',' + f1(cy + rr * Math.sin(a1)),
        fill: 'none', stroke: '#ffffff', 'stroke-width': f1(w), 'stroke-linecap': 'round', opacity: o }, skin);
      arc(r * 0.82, Math.PI * 1.06, Math.PI * 1.3, r * 0.075, 0.8);
      mk('circle', { cx: f1(cx + r * 0.82 * Math.cos(Math.PI * 1.39)), cy: f1(cy + r * 0.82 * Math.sin(Math.PI * 1.39)), r: f1(r * 0.04), fill: '#ffffff', opacity: 0.8 }, skin);
      arc(r * 0.84, Math.PI * 0.12, Math.PI * 0.36, r * 0.04, 0.45);
    },
    // the big bubble is see-through, so while Swiftee peeks from behind it its disc is cut out of her: a mask in her own
    // box, worked out again every frame she moves (on: false takes it off)
    // (the layer's units -> the page, read off two unseen probe squares in it: their client boxes include every
    // transform on the way, in every browser - Safari's getScreenCTM leaves the page's own scaling out, which put the
    // cut-out off the bubble and showed her body through it)
    peekMask(on) {
      const sw = document.querySelector('.stage .swiftee');
      if (!sw) return;
      if (!on || !this.svg) { sw.style.maskImage = sw.style.webkitMaskImage = ''; return; }
      let pr = this.svg.querySelector('g.probe');
      if (!pr) { pr = mk('g', { 'class': 'probe', visibility: 'hidden' }, this.svg); [0, 100].forEach((v) => mk('rect', { x: v, y: v, width: 1, height: 1 }, pr)); }
      const a = pr.children[0].getBoundingClientRect(), b = pr.children[1].getBoundingClientRect(), sx = (b.left - a.left) / 100, sy = (b.top - a.top) / 100;
      const rc = sw.getBoundingClientRect(), k = rc.width / (sw.offsetWidth || 1);
      if (!sx || !sy || !k) return;
      const x = (a.left + sx * BUB.cx - rc.left) / k, y = (a.top + sy * BUB.cy - rc.top) / k, R = (sx * BUB.r) / k;
      sw.style.maskImage = sw.style.webkitMaskImage = 'radial-gradient(circle ' + f1(R) + 'px at ' + f1(x) + 'px ' + f1(y) + 'px, transparent ' + f1(R - 0.5) + 'px, #000 ' + f1(R + 0.5) + 'px)';
    },
    // every plate has the instruction plate's look, a little larger: navy glass, a gold rim and gold lettering
    nameTag(parent, x, y, text, o) {
      const g = mk('g', { 'class': 'badge' }, parent), k = 1.15;
      const H0 = ((o && o.h) || 50) * k, fs = ((o && o.size) || 26) * k, rim = (o && o.rim) || 4;
      if (!this.defs.querySelector('#sumNavy')) {
        const lg = mk('linearGradient', { id: 'sumNavy', x1: 0, y1: 0, x2: 0, y2: 1 }, this.defs);
        [['0%', '#103a7a'], ['100%', '#061e4a']].forEach((st) => mk('stop', { offset: st[0], 'stop-color': st[1] }, lg));
      }
      const t = mk('text', { x: x, y: y + fs * 0.36, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800,
        'font-family': "'Baloo 2', Nunito, system-ui, sans-serif", fill: '#ffd166', text: text }, g);
      let w = 0; try { w = t.getComputedTextLength(); } catch (e) {}
      if (!w) w = text.length * fs * 0.54; // could not measure the text: estimate
      const bw = (o && o.w) ? Math.max(o.w * k, w + 16 * k) : (w + 60 * k);
      g.insertBefore(mk('rect', { x: x - bw / 2, y: y - H0 / 2, width: bw, height: H0, rx: H0 / 2, fill: 'url(#sumNavy)',
        stroke: '#ffc94d', 'stroke-width': Math.max(2, rim * 0.75), style: 'filter: drop-shadow(0 3px 5px rgba(0, 20, 60, 0.35))' }), t);
      return g;
    },
    // bring an element in: a plain fade (marks are drawn, never popped); fill 'backwards' keeps it hidden during the delay
    pop(el, delay) {
      el.setAttribute('opacity', 1);
      if (reduced() || !el.animate) return;
      try { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay: delay || 0, easing: 'ease-out', fill: 'backwards' }); } catch (e) {}
    },
    // a named part swells once and settles, slightly staggered: one smooth beat, no blur
    warmPulse(els, peak) {
      const p = String(Math.min(1.1, parseFloat(peak) || 1.1)); // marks swell a little, never out of their bubble
      (els || []).filter(Boolean).forEach((e, i) => {
        if (reduced() || !e.animate) return;
        e.style.transformBox = 'fill-box'; e.style.transformOrigin = 'center';
        try { e.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: p, filter: 'brightness(1.12)', offset: 0.45 }, { scale: '1', filter: 'brightness(1)' }],
          { duration: 700, delay: i * 120, easing: 'ease-in-out' }); } catch (x) {}
      });
    },
    // a frame-by-frame tween (SVG attributes): fn(t) with t 0..1 over ms, after delay; stops when the screen changes
    tween(ms, delay, fn) {
      if (reduced()) { this.later(delay || 0, () => fn(1)); return; }
      const run = this.run;
      this.later(delay || 0, () => {
        let t0 = null;
        const step = (now) => { if (run !== this.run) return; if (t0 == null) t0 = now; const t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    },
    // a warm stroke runs along each line and fades. It is a copy in the fx layer, mapped through the bubble's transform,
    // so the line itself is never changed
    trace(lines, together) {
      (lines || []).filter(Boolean).forEach((src, i) => {
        if (reduced()) return;
        const a = { x: +src.getAttribute('x1'), y: +src.getAttribute('y1') }, b = { x: +src.getAttribute('x2'), y: +src.getAttribute('y2') };
        const m = src.getCTM && this.svg.getCTM ? this.svg.getCTM().inverse().multiply(src.getCTM()) : null;
        const Pm = (p) => (m ? { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f } : p);
        const A2 = Pm(a), B2 = Pm(b), len = Math.hypot(B2.x - A2.x, B2.y - A2.y) || 1;
        const ln = mk('line', { x1: A2.x, y1: A2.y, x2: B2.x, y2: B2.y, stroke: '#ffd000', 'stroke-width': 8, 'stroke-linecap': 'round', style: 'filter: drop-shadow(0 0 3px rgba(255,170,0,.85))' }, this.fx);
        ln.style.strokeDasharray = len + ' ' + len;
        try {
          const an = ln.animate([{ strokeDashoffset: len + 'px', opacity: 1 }, { strokeDashoffset: '0px', opacity: 1, offset: 0.35 }, { strokeDashoffset: '0px', opacity: 0.55, offset: 0.55 }, { strokeDashoffset: '0px', opacity: 1, offset: 0.75 }, { strokeDashoffset: '0px', opacity: 0 }],
            { duration: 1700, delay: together ? 0 : i * 220, easing: 'ease-out', fill: 'both' });
          an.onfinish = () => ln.remove();
        } catch (e) { ln.remove(); }
      });
    },
    // grow a line from a to b over ms, after delay
    growLine(line, a, b, ms, delay) {
      const set = (t) => { line.setAttribute('x2', f1(a.x + (b.x - a.x) * t)); line.setAttribute('y2', f1(a.y + (b.y - a.y) * t)); };
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      if (reduced()) { set(1); line.setAttribute('opacity', 1); return; }
      set(0);
      const run = this.run;
      this.later(delay || 0, () => {
        line.setAttribute('opacity', 1);
        let t0 = null;
        const step = (now) => { if (run !== this.run) return; if (t0 == null) t0 = now; const t = Math.min(1, (now - t0) / ms); set(1 - Math.pow(1 - t, 3)); if (t < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    },
    // a double (bases) or single (the other pair) chevron at the middle of a side, pointing clockwise round the shape
    // (A->B, B->C, C->D, D->A), the way its outline draws, as the lesson's board marks them
    chevPath(s, double) {
      const cw = { AB: 'AB', BC: 'BC', DC: 'CD', DA: 'DA' }[s], a = P[cw[0]], b = P[cw[1]], u = unit(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, n = { x: -u.y, y: u.x };
      const one = (c) => { const tip = { x: mx + u.x * (c + 5.5), y: my + u.y * (c + 5.5) }, back = { x: mx + u.x * c, y: my + u.y * c };
        return 'M' + f1(back.x - n.x * 5.5) + ',' + f1(back.y - n.y * 5.5) + ' L' + f1(tip.x) + ',' + f1(tip.y) + ' L' + f1(back.x + n.x * 5.5) + ',' + f1(back.y + n.y * 5.5); };
      return double ? one(-7) + ' ' + one(0.5) : one(-3);
    },

    // ---------- reveal a bubble's idea one part at a time, in the order a teacher would draw it. Returns the time in ms ----------
    reveal(g) {
      const V = g._c.visual || {};
      let t = 0;
      const sides = ['DA', 'AB', 'BC', 'DC'];
      if (V.draw && !reduced()) { // the outline draws itself round D -> A -> B -> C -> D, then the fill comes in
        sides.forEach((s, i) => { const L = g._sides[s], ab = SIDES[s], from = s === 'DC' ? P.C : P[ab[0]], to = s === 'DC' ? P.D : P[ab[1]]; this.growLine(L, from, to, 150, i * 140); });
        this.later(80, () => this.sfx('glint'));
        g._dots.forEach((d, i) => this.pop(d, i * 140));
        g._letters.forEach((d, i) => this.pop(d, 120 + i * 140));
        this.later(560, () => { g._fill.setAttribute('opacity', 1); if (g._fill.animate && !reduced()) try { g._fill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); } catch (e) {} });
        t = 680;
      } else {
        [g._fill].concat(sides.map((s) => g._sides[s]), g._dots, g._letters).forEach((el) => el.setAttribute('opacity', 1));
        if (!reduced() && g._vis.animate) try { g._vis.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'backwards' }); } catch (e) {}
        t = 160;
      }
      if (V.chev) { // the parallel arrows: two on each base, one on each of the other pair (as on the lesson's board)
        g._chev = [['AB', true], ['DC', true], ['DA', false], ['BC', false]].map(([s, dbl]) =>
          mk('path', { d: this.chevPath(s, dbl), fill: 'none', stroke: INK.chev, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0, style: 'filter: drop-shadow(0 0 1.5px #fff)' }, g._marks));
        g._chev.forEach((el, i) => this.pop(el, t + i * 120));
        this.later(t, () => this.sfx('pop')); t += 480;
      }
      if (V.lit) { // glow bands grow along the lit sides, under the side lines so their colour still shows
        g._lit = V.lit.map((s) => {
          const ab = SIDES[s], a = P[ab[0]], b = P[ab[1]];
          const band = mk('line', { x1: a.x, y1: a.y, x2: a.x, y2: a.y, stroke: '#ffd000', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0, style: 'filter: drop-shadow(0 0 3px rgba(255,170,0,.85))' }, g._bands);
          this.growLine(band, a, b, 300, t);
          return g._sides[s];
        });
        this.later(t, () => this.sfx('glint')); t += 340;
      }
      if (V.wedges) { // each angle sweeps open at its corner, as in the lesson, then its value fades in
        g._wedges = []; g._values = [];
        V.wedges.forEach((k, i) => {
          const nb = { A: ['D', 'B'], B: ['A', 'C'], C: ['B', 'D'], D: ['C', 'A'] }[k], p = P[k], q = P[nb[0]], r = P[nb[1]];
          let a1 = Math.atan2(q.y - p.y, q.x - p.x), a2 = Math.atan2(r.y - p.y, r.x - p.x);
          let sweep = ((a2 - a1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          if (sweep > Math.PI) { const t0 = a1; a1 = a2; a2 = t0; sweep = 2 * Math.PI - sweep; } // use the angle inside the shape
          const R = 22 * CONFIG.angleR(sweep * 180 / Math.PI) / 38; // the same amount of colour for every angle, as in the lesson
          const s = { x: p.x + Math.cos(a1) * R, y: p.y + Math.sin(a1) * R };
          const wg = mk('g', { opacity: 0 }, g._wedgeG); wg._p = p;
          const wd = (u) => { const b = a1 + sweep * u; return 'M' + p.x + ' ' + p.y + ' L' + f1(s.x) + ' ' + f1(s.y) + ' A' + R + ' ' + R + ' 0 0 1 ' + f1(p.x + Math.cos(b) * R) + ' ' + f1(p.y + Math.sin(b) * R) + ' Z'; };
          const path = mk('path', { d: wd(0.001), fill: ANG[k], 'fill-opacity': 0.92 }, wg);
          g._wedges.push(wg);
          const deg = Math.round(sweep * 180 / Math.PI), mid = a1 + sweep / 2, dl = deg < 80 ? 40 : 34;
          const v = mk('text', { x: f1(p.x + Math.cos(mid) * dl), y: f1(p.y + Math.sin(mid) * dl + 4.5), 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 900,
            'font-family': 'Nunito, system-ui, sans-serif', fill: TXT[k], stroke: '#fff', 'stroke-width': 3.2, 'paint-order': 'stroke', 'stroke-linejoin': 'round', opacity: 0, text: deg + '°' }, g._marks);
          g._values.push(v); v._k = k;
          this.later(t + i * 260, () => wg.setAttribute('opacity', 1));
          this.tween(420, t + i * 260, (u) => path.setAttribute('d', wd(Math.max(0.001, 1 - Math.pow(1 - u, 3)))));
          this.pop(v, t + i * 260 + 380);
          this.later(t + i * 260, () => this.sfx('tick'));
        });
        t += V.wedges.length * 260 + 260;
      }
      if (V.ticks) { this.later(t, () => { this.marks(g); this.sfx('shimmer'); }); t += 80 * 6 + 380; this.later(t - 200, () => this.lengths(g)); t += 300; }
      if (V.diag) { // the diagonals draw themselves from corner to corner, O appears, then the halves' ticks
        g._diag = [['A', 'C'], ['B', 'D']].map(([a, b], i) => {
          const L = mk('line', { x1: P[a].x, y1: P[a].y, x2: P[a].x, y2: P[a].y, stroke: INK.navy, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0 }, g._marks);
          this.growLine(L, P[a], P[b], 380, t + i * 300);
          return L;
        });
        this.later(t, () => this.sfx('glint'));
        t += 720;
        g._o = mk('circle', { cx: f1(O.x), cy: f1(O.y), r: 4.2, fill: '#fff', stroke: INK.navy, 'stroke-width': 2.2, opacity: 0 }, g._marks);
        g._oName = mk('text', { x: f1(O.x + 2), y: f1(O.y - 9), 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 900, 'font-family': 'Nunito, system-ui, sans-serif',
          fill: INK.navy, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round', opacity: 0, text: 'O' }, g._marks);
        this.pop(g._o, t); this.pop(g._oName, t + 120); this.later(t, () => this.sfx('pop')); t += 260;
        this.later(t, () => { this.halfMarks(g); this.sfx('shimmer'); }); t += 80 * 6 + 380;
      }
      // move the corner dots to the top so nothing covers them
      g._dots.forEach((d) => g._vis.appendChild(d));
      return t;
    },
    // a tick across a segment's middle (count of them, off along the segment)
    tickAt(g, a, b, count) {
      const u = unit(a, b), n = { x: -u.y, y: u.x }, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, out = [];
      for (let k = 0; k < count; k++) {
        const off = (k - (count - 1) / 2) * 6;
        out.push(mk('line', { x1: f1(mx + u.x * off - n.x * 7), y1: f1(my + u.y * off - n.y * 7), x2: f1(mx + u.x * off + n.x * 7), y2: f1(my + u.y * off + n.y * 7),
          stroke: INK.navy, 'stroke-width': 2.6, 'stroke-linecap': 'round', opacity: 0, style: 'filter: drop-shadow(0 0 1.5px #fff)' }, g._marks));
      }
      return out;
    },
    // equal-length ticks as in the lesson: one on each base, two on each of the other pair
    marks(g) {
      g._ticks = [];
      [['AB', 1], ['DC', 1], ['DA', 2], ['BC', 2]].forEach(([s, n]) => { const ab = SIDES[s]; g._ticks.push(...this.tickAt(g, P[ab[0]], P[ab[1]], n)); });
      g._ticks.forEach((k, j) => this.pop(k, j * 80));
    },
    // the equal sides' lengths (the lesson's 6 cm and 3 cm), each beside its side in the side's colour
    lengths(g) {
      const L = [['AB', '6 cm', INK.base, 0, -15], ['DC', '6 cm', INK.base, 0, 19], ['DA', '3 cm', INK.leg, -24, 3], ['BC', '3 cm', INK.leg, 24, 3]];
      g._lengths = L.map(([s, t, fill, dx, dy]) => { const ab = SIDES[s], mx = (P[ab[0]].x + P[ab[1]].x) / 2, my = (P[ab[0]].y + P[ab[1]].y) / 2;
        return mk('text', { x: f1(mx + dx), y: f1(my + dy), 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 900, 'font-family': 'Nunito, system-ui, sans-serif', fill: fill,
          stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round', opacity: 0, text: t }, g._marks); });
      g._lengths.forEach((k, j) => this.pop(k, j * 90));
    },
    // the diagonals' equal halves: one tick on AO and OC, two on BO and OD
    halfMarks(g) {
      g._halves = [];
      [['A', 1], ['C', 1], ['B', 2], ['D', 2]].forEach(([k, n]) => { g._halves.push(...this.tickAt(g, P[k], O, n)); });
      g._halves.forEach((k, j) => this.pop(k, j * 80));
    },

    // ---------- word cues: highlight the part of the active bubble a spoken word names ('all' pulses every album bubble) ----------
    cue(kind) {
      const S = this.S, c = S && S.active ? S.cards[S.active] : null;
      if (kind === 'all') { this.warmPulse(S.collected.map((k) => S.cards[k]._pop), '1.05'); return; }
      if (!c) return;
      const sd = c._sides;
      if (kind === 'outline') this.trace([sd.DA, sd.AB, sd.BC, sd.DC]);
      else if (kind === 'pair' || kind === 'pairs') { this.trace([sd.AB, sd.DC], true); this.later(500, () => this.trace([sd.DA, sd.BC], true)); if (kind === 'pair') this.warmPulse(c._chev, '1.7'); } // one pair, then the other
      else if (kind === 'chev') this.warmPulse(c._chev, '1.7');
      else if (kind === 'lit') this.trace(c._lit, true);
      else if (kind === 'ticks') { this.warmPulse(c._ticks, '1.6'); this.warmPulse([c._tag], '1.08'); } // (the marks and the idea's name; the lengths stay still - their swell read as a jump)
      else if (kind === 'wedges') this.anglePulse(c);
      else if (kind === 'add') this.add(c);
      else if (kind === 'values') this.warmPulse([c._tag], '1.08'); // (the idea's name pulses; the angle values stay still)
      else if (kind === 'sum') this.total(c);
      else if (kind === 'tag') this.warmPulse([c._tag], '1.05');
      else if (kind === 'diag') this.trace(c._diag, true);
      else if (kind === 'halves') this.warmPulse(c._halves, '1.6');
    },
    // "angles": each angle swells once from its own corner, one after the other
    anglePulse(c) {
      (c._wedges || []).forEach((wg, i) => {
        const p = wg._p; if (!p) return;
        this.tween(560, i * 300, (u) => {
          const k = 1 + 0.16 * Math.sin(Math.PI * u);
          if (u >= 1) wg.removeAttribute('transform'); else wg.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ') scale(' + k.toFixed(3) + ') translate(' + -p.x + ' ' + -p.y + ')');
        });
      });
    },
    // "add": the two angle values fly from their corners down into a sum under the shape, one after the other, each
    // growing to the sum's size on the way; "+" joins after the first lands. total() completes it on "180".
    add(c) {
      if (!c._values || c._values.length < 2 || c._eq) return;
      const y = BOT + 40, fs = 19, gap = 7, font = 'Nunito, system-ui, sans-serif';
      const grp = mk('g', {}, c._marks);
      const part = (text, fill) => mk('text', { x: 0, y: y, 'font-size': fs, 'font-weight': 900, 'font-family': font, fill: fill, stroke: '#fff', 'stroke-width': 4,
        'paint-order': 'stroke', 'stroke-linejoin': 'round', opacity: 0, text: text }, grp);
      const v = c._values, val = (j) => v[j].textContent;
      const Pp = [part(val(0), TXT[v[0]._k] || INK.navy), part('+', INK.navy), part(val(1), TXT[v[1]._k] || INK.navy), part('=', INK.navy), part(180 + '°', '#e06600')];
      // one centred line: 110° + 70° = 180°
      const w = Pp.map((e) => { let n = 0; try { n = e.getComputedTextLength(); } catch (x) {} return n || e.textContent.length * fs * 0.55; });
      let x = SUM.card.cx - (w.reduce((a, b) => a + b, 0) + gap * (Pp.length - 1)) / 2;
      Pp.forEach((e, i) => { e.setAttribute('x', f1(x)); x += w[i] + gap; });
      const eq = c._eq = { parts: Pp, landed: 0, want: false };
      [0, 1].forEach((j) => {
        const src = v[j], slot = Pp[j * 2], sx = +src.getAttribute('x'), sy = +src.getAttribute('y'), tx = +slot.getAttribute('x') + w[j * 2] / 2;
        // a straight path that would pass the other value bends away from it
        const o = v[1 - j], ox = +o.getAttribute('x'), oy = +o.getAttribute('y'), dx = tx - sx, dy = y - sy, L = Math.hypot(dx, dy) || 1;
        const along = Math.max(0, Math.min(1, ((ox - sx) * dx + (oy - sy) * dy) / (L * L))), cx = sx + dx * along, cy = sy + dy * along;
        const miss = Math.hypot(ox - cx, oy - cy), bx = miss < 34 ? (cx - ox) / (miss || 1) * (34 - miss + 20) : 0, by = miss < 34 ? (cy - oy) / (miss || 1) * (34 - miss + 20) : 0;
        const fly = mk('text', { x: sx, y: sy, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 900, 'font-family': font, fill: slot.getAttribute('fill'),
          stroke: '#fff', 'stroke-width': 3.2, 'paint-order': 'stroke', 'stroke-linejoin': 'round', opacity: 0, text: val(j) }, c._marks);
        this.later(j * 420, () => { fly.setAttribute('opacity', 1); src.setAttribute('opacity', 0); this.sfx('tick'); }); // the number itself sets off
        this.tween(620, j * 420, (u) => {
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // ease in and out, along a small arc
          const arc = Math.sin(Math.PI * u);
          fly.setAttribute('x', f1(sx + (tx - sx) * e + bx * arc)); fly.setAttribute('y', f1(sy + (y - sy) * e - 18 * arc + by * arc));
          fly.setAttribute('font-size', f1(13 + (fs - 13) * e));
          if (u < 1) return;
          fly.remove(); slot.setAttribute('opacity', 1); eq.landed++;
          this.tween(300, 120, (q) => src.setAttribute('opacity', q)); // and its corner shows it again
          if (j === 0) this.tween(250, 0, (q) => Pp[1].setAttribute('opacity', q));
          if (eq.landed === 2 && eq.want) this.total(c);
        });
      });
    },
    // "180": once both values are in, "= 180°" joins the sum and the total gives one gentle beat
    total(c) {
      if (!c._eq) this.add(c);
      const eq = c._eq;
      if (!eq) return;
      if (eq.landed < 2) { eq.want = true; return; }
      if (eq.done) return;
      eq.done = true; this.sfx('chime');
      const [, , , eqs, tot] = eq.parts, y = +tot.getAttribute('y');
      this.tween(320, 0, (u) => { eqs.setAttribute('opacity', u); tot.setAttribute('opacity', u); tot.setAttribute('y', f1(y + 6 * (1 - u))); });
      this.tween(420, 360, (u) => tot.setAttribute('font-size', f1(19 * (1 + 0.1 * Math.sin(Math.PI * u)))));
    },

    // ---------- a bubble coming in, and going to the albums ----------
    // CARD_ENTER (a bubble blowing up), then CONCEPT_REVEAL, then its name plate
    show(c) {
      const S = this.S, g = S.cards[c.id] || (S.cards[c.id] = this.card(c));
      S.active = c.id; this.setState('CARD_ENTER', c.id); this.sfx('whoosh');
      this.layer.querySelectorAll('.summary-card.active').forEach((el) => el.classList.remove('active'));
      g.classList.add('active'); this.root.dataset.focus = '1'; // (the albums step back while this idea is shown and explained)
      if (!reduced() && g._pop.animate) {
        g._pop.style.transformBox = 'fill-box'; g._pop.style.transformOrigin = 'center';
        try { g._pop.animate([{ opacity: 0, scale: '.45' }, { opacity: 1, scale: '1.06', offset: 0.62 }, { scale: '.98', offset: 0.84 }, { scale: '1' }], { duration: BUB.enterMs, easing: 'ease-out' }); } catch (e) {}
      }
      return this.hold(BUB.enterMs).then((ok) => {
        if (!ok) return false;
        this.setState('CONCEPT_REVEAL', c.id);
        return this.hold(this.reveal(g) + 60).then((ok2) => { if (!ok2) return false; this.pop(g._tag, 0); return this.hold(260); });
      });
    },
    // a collected bubble's slot: the first three on the left, the rest on the right, each three a triangle (two in the
    // top row, one below the middle of them), the right one the left's mirror image
    slot(id) {
      const order = IDEAS.map((k) => k.id), i = Math.max(0, order.indexOf(id)), half = Math.ceil(order.length / 2) || 3;
      const col = i < half ? 0 : 1, k = col ? i - half : i, xs = BUB.miniX[col];
      return { x: k < 2 ? xs[k] : (xs[0] + xs[1]) / 2, y: SUM.mini.y[k < 2 ? 0 : 1], col: col };
    },
    // CARD_COLLECT: the bubble shrinks along a small arc into its slot (now = jump straight there)
    collect(id, now) {
      const S = this.S, c = S.cards[id];
      if (!c || c._done) return Promise.resolve(true);
      c._done = true; if (S.active === id) S.active = null;
      this.setState('CARD_COLLECT', id);
      const r = c._rect, cx0 = r.x + r.w / 2, cy0 = r.y + r.h / 2, sl = this.slot(id), k = SUM.mini.w / r.w;
      const land = () => {
        c.setAttribute('transform', 'translate(' + sl.x + ',' + sl.y + ') scale(' + k.toFixed(4) + ') translate(' + (-cx0) + ',' + (-cy0) + ')');
        c._slot = sl;
        const P0 = SUM.mini.plate;
        // the album plate centred on its small bubble's bottom edge
        c._mini = this.nameTag(this.layer, sl.x, sl.y + r.h * k / 2 + 1, c._c.label, { h: P0.h, size: P0.size, w: P0.w, rim: P0.rim });
        c._mini.classList.add('mini');
        if (!now) this.pop(c._mini, 0);
        if (S.collected.indexOf(id) < 0) S.collected.push(id);
        this.setState('NEXT_CONCEPT', id);
      };
      c._tag.setAttribute('opacity', 0);
      c.classList.remove('active'); delete this.root.dataset.focus;
      if (now || reduced()) { land(); return Promise.resolve(true); }
      this.sfx('whoosh');
      const run = this.run;
      return new Promise((resolve) => {
        let t0 = null;
        const step = (ts) => {
          if (run !== this.run || !this.live()) { resolve(false); return; }
          if (t0 == null) t0 = ts;
          const t = Math.min(1, (ts - t0) / SUM.collectMs), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, s = 1 + (k - 1) * e;
          const x = cx0 + (sl.x - cx0) * e, y = cy0 + (sl.y - cy0) * e - 40 * Math.sin(Math.PI * e);
          c.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + s.toFixed(4) + ') translate(' + (-cx0) + ',' + (-cy0) + ')');
          if (t < 1) { requestAnimationFrame(step); return; }
          land(); this.sfx('pop'); resolve(true);
        };
        requestAnimationFrame(step);
      });
    },
    // FINAL_SUMMARY: the album bubbles hop 16 px toward the middle, one after another
    gather() {
      const S = this.S;
      this.setState('FINAL_SUMMARY'); this.sfx('shimmer');
      S.collected.forEach((id, i) => {
        const c = S.cards[id], dx = c._slot && c._slot.col ? -16 : 16;
        this.later(reduced() ? 0 : i * 70, () => {
          [c, c._mini].forEach((el) => {
            if (!el) return;
            if (reduced() || !el.animate) { el.style.translate = dx + 'px 0'; return; }
            try {
              const hop = el.animate([{ translate: '0 0' }, { translate: (dx / 2) + 'px -12px', offset: 0.45 }, { translate: dx + 'px 0' }], { duration: 440, easing: 'cubic-bezier(.3,1.2,.5,1)', fill: 'forwards' });
              hop.onfinish = () => { el.style.translate = dx + 'px 0'; hop.cancel(); };
            } catch (e) { el.style.translate = dx + 'px 0'; }
          });
        });
      });
      return this.hold(S.collected.length * 70 + 460);
    },

    // ---------- READY: the bubbles become tappable, and Next comes up for the learner to move on ----------
    ready() {
      const S = this.S;
      this.setState('READY');
      S.collected.forEach((id) => S.cards[id].classList.add('tappable'));
      this.eng.setState({ sumNext: true });
    },
    // Next is taken only between replays; once taken, no idea can be replayed while the lesson moves on
    canLeave() { return !!(this.S && this.S.state === 'READY' && !this.busy); },
    leave() { if (this.S) this.setState('LEAVING'); },
    // a tapped bubble: dim the others to 42 %, redraw its idea, say its line again, then back to READY.
    // busy blocks other taps until it is done
    replay(id) {
      const S = this.S;
      if (!S || this.busy || S.state !== 'READY' || !S.cards[id]) return Promise.resolve(false);
      this.busy = true;
      const c = S.cards[id], live = this.live;
      this.eng.setState({ sumNext: false }); // (Next steps aside while she explains the idea again)
      this.eng.sfx('tap');
      this.setState('CARD_SELECTED', id);
      S.collected.forEach((k) => { const o = k === id ? '' : '.42'; [S.cards[k], S.cards[k]._mini].forEach((el) => { el.style.transition = 'opacity 240ms ease'; el.style.opacity = o; }); });
      c.classList.add('active');
      if (!reduced() && c._pop.animate) { try { c._pop.animate([{ scale: '1' }, { scale: '1.04', offset: 0.45 }, { scale: '1' }], { duration: 360, easing: 'ease-in-out' }); } catch (e) {} }
      this.setState('REPLAY_EXPLANATION', id);
      // reset the bubble to its starting state so reveal() can draw it again
      [c._bands, c._wedgeG, c._marks].forEach((el) => { while (el.firstChild) el.removeChild(el.firstChild); });
      c._chev = c._lit = c._wedges = c._values = c._ticks = c._lengths = c._eq = c._diag = c._o = c._oName = c._halves = null;
      [c._fill].concat(Object.keys(c._sides).map((s) => c._sides[s]), c._dots, c._letters).forEach((el) => el.setAttribute('opacity', 0));
      S.active = id;
      const ms = this.reveal(c);
      return this.hold(ms + 200).then((ok) => ok && this.say(c._c)).then((ok) => {
        if (!live()) return false;
        this.hush(); S.active = null; this.eng.pose('happy');
        S.collected.forEach((k) => { [S.cards[k], S.cards[k]._mini].forEach((el) => { el.style.opacity = ''; }); });
        c.classList.remove('active');
        this.busy = false; this.setState('READY'); this.eng.setState({ sumNext: true }); return ok;
      });
    }
  };
  window.Summary = Summary;
})();
