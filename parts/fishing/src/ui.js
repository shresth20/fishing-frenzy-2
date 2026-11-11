(function (PopoGame) {
'use strict';

const $ = (id) => document.getElementById(id);
const NUDGE = 12; // an arrow key's direction, in logical pixels; the corner moves a stop that way
const LONG_LINE = 7; // a sentence of more words than this breaks at its comma

// Text into a parent, with each ∠ drawn: Fredoka has no angle sign and other fonts draw it
// small and low, so it is a little line drawing in the text's colour, sized to its capitals. The
// sign itself stays in the text, unseen, so the line still reads (and copies) as written.
const ANGLE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10.5 1.5 2 10.5h9.5"/></svg>';
function appendText(parent, text) {
  text.split(/(∠)/).forEach((bit) => {
    if (!bit) return;
    if (bit !== '∠') { parent.appendChild(document.createTextNode(bit)); return; }
    const angle = document.createElement('span');
    angle.className = 'ang';
    angle.innerHTML = ANGLE;
    const sign = document.createElement('span');
    sign.className = 'ang-sign';
    sign.textContent = bit;
    angle.appendChild(sign);
    parent.appendChild(angle);
  });
}

// A line split into the words it is delivered in. Each word is a list of pieces ({ text, em })
// so a *starred* part keeps its highlight, and `newLine` marks a word that starts a new part of
// the line: after a sentence (or a colon), and at the comma nearest the middle of a long
// sentence. The line stays one line; each new part comes after a beat, with a bounce, so the
// child takes in one idea at a time.
function wordsOf(text) {
  const words = [];
  let word = null;
  text.split(/(\*[^*]+\*)/).forEach((part) => {
    if (!part) return;
    const em = part.length > 2 && part.startsWith('*') && part.endsWith('*');
    (em ? part.slice(1, -1) : part).split(/(\s+)/).forEach((bit) => {
      if (!bit) return;
      if (!bit.trim()) { word = null; return; }
      if (!word) words.push(word = { pieces: [], text: '', em: false, newLine: false });
      word.pieces.push({ text: bit, em });
      word.text += bit;
      word.em = word.em || em;
    });
  });
  words.forEach((w, i) => { if (i && /[.!?:…]$/.test(words[i - 1].text)) w.newLine = true; });
  const starts = words.map((w, i) => (!i || w.newLine ? i : -1)).filter((i) => i >= 0);
  starts.forEach((from, n) => {
    const to = n + 1 < starts.length ? starts[n + 1] : words.length;
    if (to - from <= LONG_LINE) return;
    const middle = (from + to) / 2;
    let best = -1;
    for (let i = from + 1; i < to - 1; i += 1) {
      if (words[i].text.endsWith(',') && (best < 0 || Math.abs(i + 1 - middle) < Math.abs(best + 1 - middle))) best = i;
    }
    if (best >= 0) words[best + 1].newLine = true;
  });
  return words;
}

class UI {
  constructor() {
    this.el = {
      hud: $('hud'), hits: $('hits'), handle: $('handle'), stepBack: $('step-back'), stepOn: $('step-on'), hand: $('hand'), start: $('screen-start'), loading: $('loading'), play: $('btn-play'),
      instruction: $('instruction'), instructionText: $('instruction-text'), instructionSay: $('instruction-say'), drop: $('btn-drop'),
      sound: $('btn-sound'), pause: $('btn-pause'),
      pauseOverlay: $('overlay-pause'), resume: $('btn-resume'), restart: $('btn-restart'),
      again: $('btn-again'), action: $('btn-action'), scene: $('scene'), catch: $('catch'), catchCount: $('catch-count'), catchBadge: $('catch-badge'),
      rotate: $('rotate-hint'), speech: $('speech'), caption: $('caption'),
    };
    this.handlers = {};
    this.scale = 1;
    this.dragId = null;
    const h = (name) => (e) => { e.preventDefault(); this.emit(name); };
    this.el.play.addEventListener('click', h('play'));
    this.el.play.addEventListener('pointerenter', () => this.emit('playHover', true));
    this.el.play.addEventListener('pointerleave', () => this.emit('playHover', false));
    this.el.play.addEventListener('pointerdown', () => this.emit('playPress'));
    this.el.sound.addEventListener('click', h('sound'));
    this.el.pause.addEventListener('click', h('pause'));
    this.el.resume.addEventListener('click', h('resume'));
    this.el.restart.addEventListener('click', h('restart'));
    this.el.drop.addEventListener('click', h('drop'));
    this.el.action.addEventListener('click', h('action'));
    this.unzoom = null; // the game's: a pointer on the zoomed-in view back to stage coordinates (Game.applyFocus)
    this.zoomed = null; // ...and a stage point to where the zoomed-in view shows it
    this.el.again.addEventListener('click', h('again'));
    this.wireHandle();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name, ...args) {
    if (this.handlers[name]) this.handlers[name](...args);
  }

  // --- the net's corner ------------------------------------------------------
  // One pointer at a time, captured so the drag carries on outside the button. The stage
  // rectangle is measured once per drag (and again on resize), not on every move. The two
  // arrows sit tight against the knob, over its grab target: a press on one that stays put is
  // a tap (the corner slides a stop that way), one that moves is the knob's drag, from where
  // it began, so a drag never fails for starting on an arrow.
  wireHandle() {
    const handle = this.el.handle;
    const begin = (e, el) => {
      this.dragId = e.pointerId;
      this.dragRect = this.el.hits.parentElement.getBoundingClientRect(); // (the stage: the hits layer itself zooms with the view)
      el.setPointerCapture(e.pointerId);
      handle.focus({ preventScroll: true });
      this.emit('dragStart', this.dragPoint(e));
    };
    handle.addEventListener('pointerdown', (e) => {
      if (this.dragId !== null || e.button > 0) return;
      e.preventDefault();
      begin(e, handle);
    });
    const move = (e) => {
      if (e.pointerId === this.dragId) this.emit('dragMove', this.dragPoint(e));
    };
    const end = (e) => {
      if (e.pointerId !== this.dragId) return;
      this.dragId = null;
      this.emit('dragEnd', this.dragPoint(e));
    };
    for (const el of [handle, this.el.stepBack, this.el.stepOn]) {
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }
    for (const [el, steps] of [[this.el.stepBack, -1], [this.el.stepOn, 1]]) {
      el.addEventListener('pointerdown', (e) => {
        if (this.dragId !== null || e.button > 0) return;
        e.preventDefault();
        this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, start: e };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        const p = this.press;
        if (!p || e.pointerId !== p.id || this.dragId !== null || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;
        this.press = null;
        begin(p.start, el);
        this.emit('dragMove', this.dragPoint(e));
      });
      el.addEventListener('pointerup', (e) => {
        const p = this.press;
        this.press = null;
        if (p && e.pointerId === p.id) this.emit('step', steps);
      });
      el.addEventListener('pointercancel', () => { this.press = null; });
      el.addEventListener('click', (e) => { e.preventDefault(); if (e.detail === 0) this.emit('step', steps); }); // (the keyboard)
    }
    handle.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[e.key];
      if (step) {
        e.preventDefault();
        this.emit('nudge', step[0], step[1]);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.emit('drop');
      }
    });
  }

  dragPoint(e) {
    const r = this.dragRect;
    const p = { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
    return this.unzoom ? this.unzoom(p) : p;
  }

  placeHandle(x, y) {
    this.el.handle.style.transform = `translate(${(x * this.scale).toFixed(1)}px, ${(y * this.scale).toFixed(1)}px)`;
  }

  showHandle(on) {
    this.el.handle.hidden = !on;
    if (!on) {
      this.dragId = null;
      this.placeSteps(null, null);
    }
  }

  // The tap targets over the two arrows beside the knob (stage points, or null for an arrow
  // at the end of the track, which isn't drawn).
  placeSteps(back, on) {
    for (const [el, p] of [[this.el.stepBack, back], [this.el.stepOn, on]]) {
      el.hidden = !p || this.el.handle.hidden;
      if (p) el.style.transform = `translate(${(p.x * this.scale).toFixed(1)}px, ${(p.y * this.scale).toFixed(1)}px)`;
    }
  }

  // Drop Net, the one action: 'on' while the child solves, 'hidden' while the net is down. It
  // looks the same whether the net is right or not. Once pressed it drops away rather than
  // vanishing.
  setDrop(mode) {
    if (mode === this.dropMode) return;
    const shown = !this.el.drop.hidden;
    this.dropMode = mode;
    const b = this.el.drop;
    clearTimeout(this.dropLeaving);
    b.classList.remove('leave');
    if (mode !== 'hidden' || !shown) {
      b.hidden = mode === 'hidden';
      return;
    }
    b.classList.add('leave');
    this.dropLeaving = setTimeout(() => {
      b.hidden = true;
      b.classList.remove('leave');
    }, 260);
  }

  // The nets' action button, bottom left: 'check' (the corner set), 'catch' (a right net open in the water), 'again'
  // (a tangled net), or 'hidden'. Pressed, it drops away rather than vanishing.
  setAction(mode) {
    if (mode === this.actionMode) return;
    const b = this.el.action;
    const shown = !b.hidden;
    this.actionMode = mode;
    clearTimeout(this.actionLeaving);
    b.classList.remove('leave');
    if (mode !== 'hidden') {
      b.dataset.mode = mode;
      b.querySelector('.label').textContent = T({ check: 'btnCheck', catch: 'btnCatch', again: 'tryAgain' }[mode]);
      b.hidden = false;
      this.pop(b);
      return;
    }
    if (!shown) { b.hidden = true; return; }
    b.classList.add('leave');
    this.actionLeaving = setTimeout(() => {
      b.hidden = true;
      b.classList.remove('leave');
    }, 260);
  }

  // Where the hint hand's fingertip goes on a HUD button, as a stage point: on its face, left of its middle (the
  // hand hangs down and right of its finger), or, low (a pill along the bottom of the stage), on its very middle,
  // the hand straight and small enough to stay on the screen.
  buttonPoint(el, low = false) {
    const r = el.getBoundingClientRect();
    const h = this.el.hits.parentElement.getBoundingClientRect();
    const p = low ? { x: (r.left + r.width * 0.5 - h.left) / this.scale, y: (r.top + r.height * 0.5 - h.top) / this.scale }
      : { x: (r.left + r.width * 0.42 - h.left) / this.scale, y: (r.top + r.height * 0.55 - h.top) / this.scale };
    return this.unzoom ? this.unzoom(p) : p;
  }
  buttonLow(el) {
    const r = el.getBoundingClientRect(), h = this.el.hits.parentElement.getBoundingClientRect();
    return (r.top + r.height / 2 - h.top) / h.height > 0.6;
  }

  pop(el) {
    el.classList.remove('say');
    void el.offsetWidth;
    el.classList.add('say');
  }

  // --- story lines -----------------------------------------------------------
  // A story line: Popo's or Swiftee's speech bubble, anchored at a stage point, or the narrator's caption.
  // The caption lays its words out hidden, so its plate never changes size. The bubble lays the
  // whole line out once, balanced over its lines, and pins each break there; then it starts
  // small and grows word by word into exactly that shape, with no empty space ahead.
  // maxW (px, optional): the bubble's widest, so it wraps its line onto more rows to fit a gap (Popo's, beside the
  // crane's mast); 0 keeps its usual width.
  showLine(who, words, maxW = 0) {
    this.hideLines();
    const el = who === 'narrator' ? this.el.caption : this.el.speech;
    if (el === this.el.speech) el.style.maxWidth = maxW ? `${maxW.toFixed(0)}px` : '';
    const line = el.querySelector('.line');
    line.innerHTML = '';
    this.wordEls = words.map((w, i) => {
      const span = document.createElement('span');
      span.className = w.em ? 'w em' : 'w';
      span.textContent = i < words.length - 1 ? `${w.text} ` : w.text;
      line.appendChild(span);
      return span;
    });
    el.classList.toggle('swiftee', who === 'swiftee');
    el.hidden = false;
    if (el === this.el.speech) this.pinBreaks(el, line);
    el.classList.remove('pop', 'bump');
    void el.offsetWidth;
    el.classList.add('pop');
    this.el.hud.classList.add('talking');
    this.lineEl = el;
  }

  // Measures the bubble with every word showing and its lines balanced, then pins a break before
  // each word that starts a new line.
  pinBreaks(el, line) {
    el.classList.add('measuring');
    // a word's middle, not its top: the bigger stressed words sit higher in the same line
    const mids = this.wordEls.map((span) => span.offsetTop + span.offsetHeight / 2);
    const em = parseFloat(getComputedStyle(el).fontSize);
    this.speechBox = { w: el.offsetWidth, h: el.offsetHeight, em };
    el.classList.remove('measuring');
    this.breaks = this.wordEls.map((span, i) => {
      if (!i || mids[i] - mids[i - 1] < em * 0.6) return null;
      const br = document.createElement('br');
      line.insertBefore(br, span);
      return br;
    });
  }

  revealWord(i, bump) {
    const span = this.wordEls && this.wordEls[i];
    if (span) span.classList.add('in');
    if (this.breaks && this.breaks[i]) this.breaks[i].classList.add('in');
    if (bump && this.lineEl === this.el.speech) {
      this.el.speech.classList.remove('pop', 'bump');
      void this.el.speech.offsetWidth;
      this.el.speech.classList.add('bump');
    }
  }

  // (x, y) is where the tail points. The bubble sits above and to the right of it, so it's
  // nudged down or left when it would run off the top or right of the stage, and kept clear of the HUD's top row
  // (the counter, sound and pause: on a small screen their type never shrinks, so a bubble reached them). Its tail
  // keeps pointing at (x, y) wherever the bubble has had to move (--tail).
  // `avoid`: boxes the speaker's bubble keeps to its own side of, in stage pixels ({ x0, y0, x1, y1 }): Popo's keeps
  // left of the crane's mast, its width fitted to the room there (Game.popoBubbleWidth). The side is the speaker's, not
  // the bubble's middle, so it never flips across as the raft bobs. Each piece of the HUD it would touch it clears by
  // the smallest move: sideways within that room, or down below it.
  placeSpeech(x, y, avoid = []) {
    const b = this.speechBox || { w: 0, h: 0, em: 0 };
    const width = this.el.hits.clientWidth;
    const ax = x * this.scale, inset = 0.6 * b.em, k = this.scale;
    // (the room: never past the stage's edges, even at the height of a bump, which widens it 8% about its tail)
    let lo = 6 + 0.08 * b.w, hi = width - 4;
    for (const a of avoid) if (ax < ((a.x0 + a.x1) / 2) * k) hi = Math.min(hi, a.x0 * k - 6);
    const fits = (l) => l - inset >= lo && l - inset + b.w <= hi;
    let left = Math.max(lo + inset, Math.min(ax, hi - b.w + inset));
    // the tail's tip on (x, y) (css .speech::before), the bubble's bottom clear above it; clear of the top edge, even
    // as it pops, and never down over what it points at: if the room above is short, it stays up and the tail reaches
    let top = Math.max(y * this.scale - 0.88 * b.em, b.h + 14);
    const floor = (y - 10) * this.scale; if (top > floor) top = floor;
    for (const r of this.hudBoxes()) {
      const l0 = left - inset;
      if (l0 + b.w <= r.l - 6 || l0 >= r.r + 6 || top <= r.t - 6 || top - b.h >= r.b + 6) continue;
      const moves = [r.l - 6 - b.w + inset, r.r + 6 + inset].filter(fits).map((l) => ({ left: l, d: Math.abs(l - left) }));
      moves.push({ top: r.b + 6 + b.h, d: r.b + 6 + b.h - top });
      const m = moves.reduce((p, q) => (q.d < p.d ? q : p));
      if (m.left !== undefined) left = m.left; else top = m.top;
    }
    const tail = Math.max(0, Math.min(b.w - 2.4 * b.em, ax - left));
    const st = this.el.speech.style;
    st.left = `${left.toFixed(1)}px`;
    st.top = `${top.toFixed(1)}px`;
    st.setProperty('--tail', `${tail.toFixed(1)}px`);
  }

  // The HUD's top-row pieces a speech bubble keeps clear of, in stage pixels (measured once per size, while the HUD
  // shows).
  hudBoxes() {
    if (this.el.hud.hidden) return [];
    if (this.hudCache && this.hudCache.scale === this.scale) return this.hudCache.boxes;
    const st = this.el.hud.parentElement.getBoundingClientRect();
    const boxes = [this.el.catch, this.el.sound.parentElement].map((el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left - st.left, t: r.top - st.top, r: r.right - st.left, b: r.bottom - st.top };
    }).filter((r) => r.r - r.l > 2);
    if (boxes.length) this.hudCache = { scale: this.scale, boxes };
    return boxes;
  }

  hideLines() {
    this.el.speech.hidden = true;
    this.el.caption.hidden = true;
    this.el.hud.classList.remove('talking');
    this.lineEl = null;
    this.wordEls = null;
    this.breaks = null;
  }

  // --- screens and HUD ---------------------------------------------------------
  placePlay(x, y, r) {
    const k = this.scale;
    const s = this.el.play.style;
    s.transform = `translate(${((x - r) * k).toFixed(1)}px, ${((y - r) * k).toFixed(1)}px)`;
    s.width = s.height = `${(2 * r * k).toFixed(1)}px`;
  }

  setScale(scale) {
    this.scale = scale;
    if (this.dragId !== null) this.dragRect = this.el.hits.getBoundingClientRect();
    this.fitInstruction();
  }

  setLoading(text) {
    this.el.loading.textContent = text;
    this.el.loading.hidden = !text;
    this.el.play.disabled = Boolean(text);
  }

  hideStart() {
    this.el.start.classList.add('fade-out');
    clearTimeout(this.startGone);
    this.startGone = setTimeout(() => { this.el.start.hidden = true; }, 500);
  }

  showStart() {
    clearTimeout(this.startGone); // (shown again before it had faded: it stays)
    this.el.start.hidden = false;
    this.el.start.classList.remove('fade-out');
    this.el.hud.hidden = true;
  }

  showHud() {
    this.el.hud.hidden = false;
    this.hudCache = null;
  }

  // The HUD fades away (the hook's net becoming the lesson's shape), or back.
  fadeHud(away) {
    this.el.hud.classList.toggle('away', !!away);
  }

  // --- delivered text ------------------------------------------------------------
  // Lays a line out in `el` as hidden words for the game to show one at a time (Game.deliver).
  // Laid out whole first, the plate is its final size from the start and never changes as the
  // words come. `plate` is what bounces as each new part of the line begins.
  layWords(el, plate, text) {
    const words = wordsOf(text);
    el.textContent = '';
    const spans = words.map((w, i) => {
      if (i) el.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = w.em ? 'w em' : 'w';
      for (const piece of w.pieces) {
        if (!piece.em) { appendText(span, piece.text); continue; }
        const b = document.createElement('b');
        b.className = 'hl';
        appendText(b, piece.text);
        span.appendChild(b);
      }
      el.appendChild(span);
      return span;
    });
    this.delivered = { words, spans, plate };
    return words;
  }

  // The next word pops in (a stressed one with a boing); a word that starts a new sentence
  // gives its plate a little bounce.
  showWord(i) {
    const d = this.delivered;
    if (!d || !d.spans[i]) return;
    d.spans[i].classList.add('in');
    if (i && d.words[i].newLine) {
      d.plate.classList.remove('say', 'pulse', 'bump');
      void d.plate.offsetWidth;
      d.plate.classList.add('bump');
    }
  }

  // The instruction plate: a prompt or hint, its words hidden until the game shows them.
  // Screen readers get the whole line at once. The plate gives a little boing on every change.
  setInstruction(text) {
    const plate = this.el.instruction;
    plate.classList.toggle('empty', !text);
    this.el.instructionSay.textContent = text.replace(/\*/g, '');
    const words = this.layWords(this.el.instructionText, plate, text);
    if (!text) return words;
    plate.classList.remove('say', 'pulse', 'bump');
    this.fitInstruction();
    void plate.offsetWidth;
    plate.classList.add('say');
    return words;
  }

  // The instruction is always one line, never two: one too long for the room between the
  // corner buttons has its words shrunk until it fits. Layout widths ignore the plate's
  // animations, so this holds mid-boing too.
  fitInstruction() {
    const t = this.el.instructionText;
    const plate = this.el.instruction;
    t.style.fontSize = '';
    if (!t.textContent) return;
    const column = parseFloat(getComputedStyle(plate.parentElement).gridTemplateColumns.split(' ')[1]);
    const box = getComputedStyle(plate);
    const room = column - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight) - parseFloat(box.borderLeftWidth) * 2;
    if (t.scrollWidth > room) t.style.fontSize = `${(room / t.scrollWidth).toFixed(3)}em`;
  }

  pulseInstruction() {
    this.el.instruction.classList.remove('pulse', 'say');
    void this.el.instruction.offsetWidth;
    this.el.instruction.classList.add('pulse');
  }

  setSound(muted) {
    this.el.sound.setAttribute('aria-pressed', String(!muted));
    this.el.sound.setAttribute('aria-label', T(muted ? 'ariaSoundOff' : 'ariaSoundOn'));
    this.el.sound.classList.toggle('muted', muted);
  }

  showPause(show) {
    this.el.pauseOverlay.hidden = !show;
    if (show) this.el.resume.focus();
  }

  // The catch so far at the top left. `move` is how it greets the number: 'gulp' for a fish
  // arriving, 'cheer' for every tenth.
  setCatch(n, move = null) {
    this.el.catchCount.textContent = String(n);
    this.el.catch.setAttribute('aria-label', T('ariaFishCaught', { n }));
    if (!move) return;
    this.el.catch.classList.remove('gulp', 'cheer');
    void this.el.catch.offsetWidth;
    this.el.catch.classList.add(move);
  }

  // "+3" after a catch, popping up beside the counter and drifting off.
  floatGain(n) {
    const gain = document.createElement('span');
    gain.className = 'gain';
    gain.textContent = `+${n}`;
    gain.setAttribute('aria-hidden', 'true');
    gain.addEventListener('animationend', () => gain.remove());
    this.el.catch.appendChild(gain);
  }

  // The middle of the counter's fish badge, as a stage point: where a caught fish flies to.
  counterPoint() {
    const r = this.el.catchBadge.getBoundingClientRect();
    const h = this.el.hits.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - h.left) / this.scale, y: (r.top + r.height / 2 - h.top) / this.scale };
  }

  // The end screen's one button, springing in at the foot of its card once the count is done.
  showAgain(show) {
    this.el.again.hidden = !show;
    if (show) this.el.again.focus({ preventScroll: true });
  }

  // The End's card: the catch against `goal`, coming in at nought (countGoal counts it up, endGoal finishes it).
  showGoal(goal) {
    const card = document.getElementById('goal');
    card.classList.remove('won');
    document.getElementById('goal-of').textContent = goal;
    document.getElementById('goal-line').textContent = '';
    this.countGoal(0, goal);
    card.hidden = false;
  }

  // the catch so far, and the bar filled to it (full at the goal), its fish riding the tip
  countGoal(n, goal) {
    document.getElementById('goal-n').textContent = n;
    document.getElementById('goal-bar').style.setProperty('--k', `${Math.min(100, (100 * n) / goal).toFixed(1)}%`);
  }

  // The count is done: reached, the star at the bar's end lights and the line says so; short of it, the line asks
  // for more. Returns whether the goal was reached.
  endGoal(n, goal) {
    const won = n >= goal;
    this.countGoal(n, goal);
    document.getElementById('goal').classList.toggle('won', won);
    document.getElementById('goal-line').textContent = T('goalLine');
    return won;
  }

  // the trophy's middle as a stage point (the curtain's own units: no view zoom), where the card's bubbles rise from
  goalCup() {
    const r = document.querySelector('#goal .goal-cup').getBoundingClientRect(), h = this.el.hits.parentElement.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - h.left) / this.scale, y: (r.top + r.height / 2 - h.top) / this.scale };
  }

  hideGoal() {
    document.getElementById('goal').hidden = true;
  }

  // The end screen moves the scene (the water and the world) under its circle; the curtain,
  // HUD and buttons stay put.
  panScene(x, y) {
    this.el.scene.style.transform = x || y ? `translate(${(x * this.scale).toFixed(1)}px, ${(y * this.scale).toFixed(1)}px)` : '';
  }


  // --- hint hand ---------------------------------------------------------------
  showHand(dragging = false) {
    this.el.hand.hidden = false;
    this.el.hand.classList.toggle('drag', dragging);
    this.el.hand.classList.remove('fade');
  }

  fadeHand() {
    this.el.hand.classList.add('fade');
  }

  hideHand() {
    this.el.hand.hidden = true;
    this.el.hand.classList.remove('fade', 'drag');
  }

  // (the hand's own transform carries the view's zoom on the net, Game.applyFocus: its fingertip is the image's
  // top-left corner, so it scales from there)
  // The hand hangs down and right of its fingertip, so pointing at a pill along the bottom of the stage it would run
  // off the screen: its fingertip then moves up (or left) just enough for the whole hand, and its tap, to stay on it -
  // still on the pill.
  moveHand(x, y) {
    const q = this.zoomed ? this.zoomed({ x, y }) : { x, y, z: 1 };
    const hand = this.el.hand, stage = this.el.hits.parentElement;
    let px = q.x * this.scale, py = q.y * this.scale;
    const w = hand.offsetWidth * q.z, h = hand.offsetHeight * q.z, tap = 0.7 * parseFloat(getComputedStyle(hand).fontSize || 0); // (hand-tap moves it 0.7em)
    if (h) py = Math.min(py, stage.clientHeight - h - tap - 4);
    if (w) px = Math.min(px, stage.clientWidth - w - tap - 4);
    hand.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)` + (q.z !== 1 ? ` scale(${q.z.toFixed(4)})` : '');
  }

  showRotateHint(show) {
    this.el.rotate.hidden = !show;
  }
}

Object.assign(PopoGame, { UI });
})(window.PopoGame = window.PopoGame || {});
