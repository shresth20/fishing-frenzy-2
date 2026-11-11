(function (PopoGame) {
'use strict';
const { geo, drawRope, drawPulleyWrap, drawRing, ROPE_WIDTH, RING_KNOT, RING_BAR } = PopoGame;
const { sub, add, times, dot, cross, length, distance, midpoint, lerp, normalize, parallel, angleAt, intersection, isValidQuad, insideConvex, rotate } = geo;

// The fishing net: a rope frame of four corners A, B, C, D (top-left, clockwise) hung from one
// lifting ring, with a mesh inside. Three corners are fixed and the child drags the fourth
// until the frame has the property the level asks for. Positions are in net coordinates,
// measured from the ring, so lowering the net or the raft bobbing never changes the shape;
// the whole stage scales to the screen, so metres and degrees stay the same everywhere.

const TAU = Math.PI * 2;
const CORNERS = 'ABCD';
const corner = (letter) => CORNERS.indexOf(letter);
const side = (name) => [corner(name[0]), corner(name[1])];
// The corner the child moves never stretches freely: it slides along a track (see setLevel)
// and clicks from stop to stop, STOP stage pixels apart. One stop is its exact place, so the
// frame is right exactly there, and only there do the numbers on the net match.
const STOP = 20;
const TRACK_STOPS = 12; // at most this many stops each way from its place
// a hair of rounding for "exactly": a stop either has the property or misses it by a step
const EXACT = { parallel: 1e-3, metres: 0.01, degrees: 0.1 };
const tenths = (m) => Math.round(m * 10) / 10;
const cm = (m) => (Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(1));
// The loaded bag hangs below the open frame by this much, keeping the hauled catch
// clear of the water. Its mouth and toe gather around a broad rounded belly.
const POUCH = { depth: 0.3, most: 45 };
const NECK = 0.012; // above this (a share down the net) the floats fold away as the bag closes
const TOE = 1.01;   // and below this the weights

// The closed bag's half-width down its length (t from mouth to toe), as a share of the net's
// width: a potli. A short neck gathered narrow enough to go up into the ring's bottom bar, round
// shoulders that fill out quickly below it, the full loaded belly and a rounded bottom.
const BAG_NECK = 0.06; // the gathered neck's length, as a share of the bag's
function bagRadius(t) {
  const s = Math.max(0, (t - BAG_NECK) / (1 - BAG_NECK));
  return 0.02 + 0.33 * Math.sin(Math.PI * s ** 0.75) ** 0.6;
}
const GLOW = '#8ff7a8';
const MISS = '#ff6b5e'; // (a wrong net's parts that don't match: drawMiss)
// Wound up, the net gathers under its ring: a tenth as wide and under half as long, hanging
// from the knot where the sling meets.
const GATHER = { x: 0.9, y: 0.55 };
const KNOT = RING_KNOT;
// the outline of a torn hole, as shares of its full size, all the way round
const RAGGED = [1, 0.62, 0.9, 0.7, 1, 0.58, 0.86, 0.66, 0.97, 0.6, 0.92, 0.72, 1, 0.64, 0.84, 0.7];
// the lesson's colours: one per angle (its wedge, and its value), and its orange parallel arrows and navy ticks
const ANG = { A: '#ff7a00', B: '#00c853', C: '#9d4dff', D: '#ffab00' };
const ANG_TXT = { A: '#ff9a3c', B: '#3ddc73', C: '#c08bff', D: '#ffc44d' };
const CHEV = '#ff7a00';
const ARROW_REACH = 44;  // how far from the knob's middle its two slide arrows sit (tight against it)
const FONT = (px) => `700 ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
// A label's half width and height on the stage, as Net.text draws it: its words measured in the font (kept once the
// font has loaded), its dark edge and a hair to spare, at the net's wordScale.
const measurer = document.createElement('canvas').getContext('2d');
const measured = new Map();
function labelHalf(string, px, k) {
  const key = `${px}|${string}`;
  let w = measured.get(key);
  if (w === undefined) {
    measurer.font = FONT(px);
    w = measurer.measureText(string).width;
    if (!document.fonts || document.fonts.check(measurer.font)) measured.set(key, w);
  }
  return { w: ((w + 5) / 2 + 3) * k, h: (px * 0.5 + 4) * k };
}
const INK = 'rgba(12, 40, 70, 0.9)'; // (the labels' dark edge)
// how far a label's box reaches from its middle along the unit direction n
const reach = (half, n) => Math.abs(n.x) * half.w + Math.abs(n.y) * half.h;
// does the segment a-b cross the box (x0, y0, x1, y1)? (Liang-Barsky)
function crosses(box, a, b) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

// A level's solved parallelogram with its top edge at y 0: width, height and either the lean
// (how far the top edge sits right of the bottom) or the angle at A, optionally turned.
function parallelogram(level) {
  const lean = level.angleA ? -level.height / Math.tan(level.angleA * Math.PI / 180) : level.lean;
  const w = level.width / 2;
  const l = lean / 2;
  const h = level.height;
  const points = [{ x: -w + l, y: 0 }, { x: w + l, y: 0 }, { x: w - l, y: h }, { x: -w - l, y: h }];
  return level.rotate ? rotate(points, level.rotate, { x: 0, y: h / 2 }) : points;
}

class Net {
  constructor() {
    this.origin = { x: 0, y: 0 }; // where the ring hangs at rest, on the stage
    this.drop = 0;                 // how far the winch has lowered it
    this.swing = 0;                // pendulum angle about the ring (rowing, settling)
    this.level = null;
    this.points = [{ x: -220, y: 110 }, { x: 220, y: 110 }, { x: 220, y: 310 }, { x: -220, y: 310 }];
    this.solved = this.points.map((p) => ({ ...p }));
    this.start = this.points.map((p) => ({ ...p }));
    this.movable = 1;
    this.target = { ...this.points[1] };
    this.nearby = 44;     // how close to its place counts as near it (see check)
    this.along = null;
    this.scale = 70;      // stage pixels per metre shown
    this.locked = true;
    this.visible = false;
    this.alpha = 1;
    this.time = 0;
    this.wobble = 0;      // a shake of the corner after a wrong check
    this.thrash = 0;      // the whole net shaken by a fish fighting in it (the hook): the frame jolts, the mesh ripples
    this.flash = 0;       // the frame lights up when the shape comes right
    this.glow = null;     // the property highlight: steps played one after another
    this.miss = null;     // a wrong net: the parts that don't match pulse red, the same way
    this.hintPulse = 0;   // the measurements swell for a moment as a hint
    this.ghost = null;    // a hint's ghost of the corner being moved: { x, y, alpha } on the stage (drawGhost)
    this.touched = false; // the child has moved the corner this level
    this.textScale = 1;   // the knob's arrows, the marks and arcs grow on small screens (see Game.labelScale)
    this.wordScale = 1;   // ...and the words (measures, letters), as seen through the zoom on the net (Game.wordScale)
    this.ropePhase = 0;   // rope twists slide as rope pays out
    this.furl = 0;        // 0 open, 1 wound up into a bundle under the ring (between nets)
    this.tangle = 0;      // continuous crumpling of the same mesh, from open to tangled
    this.pouch = 0;       // 0 open, 1 closed into a bag around its catch
    this.track = { min: 0, max: 0 }; // the stops the corner can reach, counted from its place
    this.stopAt = 0;      // the stop it is at
    this.drawn = null;    // where the corner is drawn while it glides onto its new stop
    this.sharpRes = 2;    // texture pixels per stage pixel once the shape holds still (Game.resize)
    this.textureRes = 0;
    this.tear = 0;        // 0 whole, 1 torn open by a catch a wrong net couldn't hold
    this.burst = null;    // bits of mesh flying off as it tears: { t } seconds
    this.outline = null;  // a soft light traced round the frame (traceOutline): { at, trace, hold, fade } seconds
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // bottom: the deepest net-coordinate the frame may reach (just above the water); clear: the
  // net-coordinate x range the corner must keep inside (off the raft, on the stage).
  setLevel(level, bottom, clear = {}) {
    const shape = parallelogram(level);
    const lowest = Math.max(...shape.map((p) => p.y));
    this.level = level;
    this.solved = shape.map((p) => ({ x: p.x, y: p.y - lowest + bottom }));
    this.movable = corner(level.corner);
    this.target = this.solved[this.movable];
    // the track runs through the corner's place along the side or diagonal the level names
    const [i, j] = side(level.along);
    this.along = { base: this.target, dir: normalize(sub(this.solved[j], this.solved[i])) };
    const [name, metres] = Object.entries(level.metres || { AB: 6 })[0];
    this.scale = length(this.sideOf(name, this.solved)) / metres;
    this.nearby = Math.min(level.width, level.height) * 0.22;
    this.locked = false;
    this.touched = false;
    this.flash = 0;
    this.glow = null;
    this.miss = null;
    this.pouch = 0;
    this.drawn = null;
    this.tangle = 0; // a wrong net crumpled into a tangle (framed)
    const xs = this.solved.map((p) => p.x);
    const ys = this.solved.map((p) => p.y);
    // the corner stays near the frame, out of the water, clear of the ring, the raft and the edge
    this.limits = {
      left: Math.max(Math.min(...xs) - level.width * 0.4, clear.left ?? -Infinity),
      right: Math.min(Math.max(...xs) + level.width * 0.4, clear.right ?? Infinity),
      top: Math.max(24, Math.min(...ys) - level.height * 0.55), bottom: bottom + 40,
    };
    // the stops it can reach: on from its place each way while the frame stays a simple, roomy
    // quadrilateral inside the limits
    this.points = this.solved.map((p) => ({ ...p }));
    const reach = (step) => {
      let k = 0;
      while (Math.abs(k) < TRACK_STOPS && this.fits(this.stop(k + step))) k += step;
      return k;
    };
    this.track = { min: reach(-1), max: reach(1) };
    this.stopAt = Math.max(this.track.min, Math.min(this.track.max, level.start));
    this.points[this.movable] = this.stop(this.stopAt);
    this.start = this.points.map((p) => ({ ...p }));
    // which pairs this net comes down with already parallel (its given; the other pair is the child's to make)
    const st = this.start, d = (a, b) => { const l = Math.hypot(st[b].x - st[a].x, st[b].y - st[a].y) || 1; return { x: (st[b].x - st[a].x) / l, y: (st[b].y - st[a].y) / l }; };
    const pl = (u, v) => Math.abs(u.x * v.y - u.y * v.x) < 0.035;
    this.givenPar = { AB: pl(d(0, 1), d(3, 2)), BC: pl(d(1, 2), d(0, 3)) };
  }

  // The point `k` stops from the corner's place along its track.
  stop(k) {
    return add(this.along.base, times(this.along.dir, k * STOP));
  }

  fits(p) {
    const l = this.limits;
    if (p.x < l.left || p.x > l.right || p.y < l.top || p.y > l.bottom) return false;
    return isValidQuad(this.points.map((q, i) => (i === this.movable ? p : q)));
  }

  ring() {
    return { x: this.origin.x, y: this.origin.y + this.drop };
  }

  toStage(p) {
    const r = this.ring();
    const q = this.furl ? this.gathered(p) : p;
    if (!this.swing) return { x: r.x + q.x, y: r.y + q.y };
    const c = Math.cos(this.swing);
    const s = Math.sin(this.swing);
    return { x: r.x + q.x * c - q.y * s, y: r.y + q.x * s + q.y * c };
  }

  // Where a point of the frame is drawn as the net winds up. Only the drawing gathers: the
  // frame keeps its shape, and the net is never wound up while catching, so toNet ignores it.
  gathered(p) {
    return { x: p.x * (1 - GATHER.x * this.furl), y: KNOT + (p.y - KNOT) * (1 - GATHER.y * this.furl) };
  }

  // --- the mesh and the bag ------------------------------------------------------------
  // Keep the logical frame convex. Folding the surface instead of twisting its corners
  // avoids inverted texture triangles and keeps the sling, floats and eyelets attached.
  framed() {
    const p = this.points.map((q) => ({ ...q }));
    if (this.drawn) p[this.movable] = { ...this.drawn };
    if (this.thrash > 0) { // (every corner jolted about its place, each at its own beat - the whole net shaking)
      const k = this.thrash, t = this.time;
      p.forEach((q, i) => { q.x += k * 9 * Math.sin(t * 31 + i * 1.9) * (i === 2 ? 1.6 : 1); q.y += k * 7 * Math.sin(t * 27 + i * 2.6) * (i === 2 ? 1.6 : 1); });
    }
    return p;
  }

  // A point of the mesh by its place in the frame (u across from AD to BC, v down from AB to
  // DC; outside 0 to 1 for the floats and weights beyond the rope), in net coordinates.
  // The whole sheet folds into a cinched, rounded pouch as the lifting rope tightens.
  meshPoint(u, v, p = this.framed()) {
    const [a, b, c, d] = p;
    let x = u, y = v;
    if (this.tangle > 0) {
      const k = this.tangle;
      // Broad shoulders, a pinched waist and a weighted, sagging hem. Extend the
      // same surface beyond the border so floats never look pasted on or clipped.
      x = 0.5 + (u - 0.5) * (1 - k * (0.24 + 0.28 * Math.sin(Math.PI * v) ** 2))
        + k * 0.07 * Math.sin(TAU * v);
      y = 0.5 + (v - 0.5) * (1 - 0.24 * k)
        + k * 0.09 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
        + k * 0.035 * Math.sin(TAU * u);
    }
    const q = lerp(lerp(a, b, x), lerp(d, c, x), y);
    if (this.thrash > 0) { // (a ripple runs through the mesh from the fighting corner, C)
      const k = this.thrash, dx = 1 - u, dy = 1 - v, dist = Math.hypot(dx, dy), w = Math.sin(this.time * 22 - dist * 9) * k * 6 * Math.max(0, 1 - dist);
      q.x += w * 0.6; q.y += w;
    }
    if (!this.pouch) return q;
    // The mouth drawn up into the ring's bottom bar (net 0, KNOT), the broad loaded belly and
    // rounded toe below it, hanging plumb from the ring whichever way the open frame leaned,
    // as deep as the open net and its sag. The same surface carries texture, eyelets and fish,
    // so nothing detaches when the flat net becomes a pouch.
    const t = Math.max(0, Math.min(1, v));
    const width = (distance(a, b) + distance(d, c)) / 2;
    const depth = Math.max(c.y, d.y) + this.sagDepth(p) - midpoint(a, b).y;
    const radius = width * bagRadius(t);
    const across = 2 * u - 1;
    const bag = {
      x: across * radius,
      y: KNOT + depth * v + 14 * (1 - across * across) * Math.sin(Math.PI * t),
    };
    return lerp(q, bag, this.pouch);
  }

  // How far the closed bag's belly hangs below the frame's bottom edge.
  sagDepth(p = this.points) {
    const h = distance(midpoint(p[0], p[1]), midpoint(p[3], p[2]));
    return Math.min(POUCH.most, h * POUCH.depth);
  }

  // A net point's place in the open frame (the inverse of meshPoint with no bag), found by a
  // few steps of Newton's method; a netted fish keeps it, so it rides down into the bag.
  uvOf(point) {
    const [a, b, c, d] = this.points;
    let u = 0.5;
    let v = 0.5;
    for (let n = 0; n < 8; n += 1) {
      const e = sub(point, lerp(lerp(a, b, u), lerp(d, c, u), v));
      const du = sub(lerp(b, c, v), lerp(a, d, v));
      const dv = sub(lerp(d, c, u), lerp(a, b, u));
      const det = du.x * dv.y - du.y * dv.x;
      if (!det) break;
      u += (e.x * dv.y - e.y * dv.x) / det;
      v += (du.x * e.y - du.y * e.x) / det;
    }
    return { u, v };
  }

  // Where a netted fish hangs: as the net closes it slides down into the belly with the others.
  catchPoint({ u, v }) {
    const k = this.pouch;
    return this.meshPoint(0.5 + (u - 0.5) * (1 - 0.42 * k), v + (0.52 + 0.23 * v - v) * k);
  }

  // Where a fish at a stage point hangs (its place for catchPoint) if it is inside the net as it is drawn now - open,
  // or closing into its bag - else null. Its place in the drawn mesh is found by a few steps of Newton's method on
  // meshPoint (from the nearest of a few points over the mesh, in short steps: the closed bag's neck is pinched tight),
  // then catchPoint's slide into the belly is undone, so a fish is netted just where it is and stays in.
  placeOf(stagePoint) {
    if (this.furl || this.tangle) return null;
    const want = this.toNet(stagePoint);
    const frame = this.framed();
    const h = 1e-3;
    let u = 0.5;
    let v = 0.5;
    let near = Infinity;
    for (let i = 0; i < 5; i += 1) {
      for (let j = 0; j < 5; j += 1) {
        const d = distance(this.meshPoint(0.1 + i * 0.2, 0.1 + j * 0.2, frame), want);
        if (d < near) { near = d; u = 0.1 + i * 0.2; v = 0.1 + j * 0.2; }
      }
    }
    for (let n = 0; n < 12; n += 1) {
      const p = this.meshPoint(u, v, frame);
      const e = sub(want, p);
      if (Math.abs(e.x) + Math.abs(e.y) < 0.1) break;
      const du = times(sub(this.meshPoint(u + h, v, frame), p), 1 / h);
      const dv = times(sub(this.meshPoint(u, v + h, frame), p), 1 / h);
      const det = du.x * dv.y - du.y * dv.x;
      if (!det) return null;
      const su = (e.x * dv.y - e.y * dv.x) / det;
      const sv = (du.x * e.y - du.y * e.x) / det;
      const cap = Math.min(1, 0.2 / Math.max(Math.abs(su), Math.abs(sv)));
      u += su * cap;
      v += sv * cap;
    }
    if (u < 0 || u > 1 || v < 0 || v > 1 || distance(this.meshPoint(u, v, frame), want) > 1) return null;
    const k = this.pouch;
    return { u: 0.5 + (u - 0.5) / (1 - 0.42 * k), v: (v - 0.52 * k) / (1 - 0.77 * k) };
  }

  // The hole the catch tears: low in the mesh (in the bag's belly, once closed; the frame
  // holds), growing with the tear.
  tearHole() {
    const [a, b, c, d] = this.points;
    const centre = this.meshPoint(0.5, this.pouch ? 0.85 : 0.75);
    const rx = distance(midpoint(a, d), midpoint(b, c)) * 0.34 * (1 - 0.3 * this.pouch) * this.tear;
    const ry = distance(midpoint(a, b), midpoint(d, c)) * 0.3 * this.tear;
    const outline = RAGGED.map((k, i) => {
      const t = (i / RAGGED.length) * TAU;
      return { x: centre.x + Math.cos(t) * rx * k, y: centre.y + Math.sin(t) * ry * k };
    });
    return { centre, outline };
  }

  toNet(p) {
    const r = this.ring();
    const x = p.x - r.x;
    const y = p.y - r.y;
    if (!this.swing) return { x, y };
    const c = Math.cos(-this.swing);
    const s = Math.sin(-this.swing);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  handle() {
    return this.toStage(this.points[this.movable]);
  }

  distance() {
    return distance(this.points[this.movable], this.target);
  }

  // The net's lowest point: its frame's lower corner, or the bottom of the bag hanging from
  // the ring.
  bottom() {
    const open = Math.max(...this.points.map((p) => p.y));
    if (!this.pouch) return open;
    const bag = KNOT + open + this.sagDepth() - (this.points[0].y + this.points[1].y) / 2;
    return open + (bag - open) * this.pouch;
  }

  // The net's footprint everything in it must share: between the inner ends of its slanted
  // sides and below the lower of its top corners down to the higher of its bottom corners,
  // so a fish there is inside the frame whichever way it leans or tilts.
  innerSpan() {
    const [a, b, c, d] = this.solved;
    return { left: Math.max(a.x, d.x), right: Math.min(b.x, c.x), top: Math.max(a.y, b.y), bottom: Math.min(c.y, d.y) };
  }

  contains(stagePoint) {
    return insideConvex(this.toNet(stagePoint), this.points);
  }

  // Moves the corner to the stop on its track nearest a wanted net point. Every stop is alike,
  // so nothing pulls it toward its place; it glides onto the new stop rather than jumping.
  // Returns whether it moved.
  moveHandle(want) {
    return this.toStop(Math.round(dot(sub(want, this.along.base), this.along.dir) / STOP));
  }

  // One stop on (or back) along the track: the arrow keys.
  stepHandle(steps) {
    return this.toStop(this.stopAt + steps);
  }

  toStop(k) {
    const stop = Math.max(this.track.min, Math.min(this.track.max, k));
    if (stop === this.stopAt) return false;
    this.drawn = this.cornerDrawn();
    this.stopAt = stop;
    this.points[this.movable] = this.stop(stop);
    this.touched = true;
    return true;
  }

  // Where the moving corner is drawn: gliding onto its stop, or on it.
  cornerDrawn() {
    return this.drawn ? { ...this.drawn } : { ...this.points[this.movable] };
  }

  setHandle(p) {
    this.points[this.movable] = { x: p.x, y: p.y };
    this.drawn = null;
  }

  solve(at) {
    this.setHandle(at);
    this.locked = true;
    this.flash = 1;
  }

  // --- measurements ------------------------------------------------------------
  sideOf(name, points = this.points) {
    const [i, j] = side(name);
    return sub(points[j], points[i]);
  }

  metres(name) {
    return length(this.sideOf(name)) / this.scale;
  }

  angle(letter) {
    const i = corner(letter);
    return angleAt(this.points[(i + 3) % 4], this.points[i], this.points[(i + 1) % 4]);
  }

  // Where the diagonals cross and the four half-diagonals in metres.
  halves() {
    const [a, b, c, d] = this.points;
    const o = intersection(a, c, b, d) || midpoint(a, c);
    return { o, AO: distance(a, o) / this.scale, OC: distance(o, c) / this.scale, BO: distance(b, o) / this.scale, OD: distance(o, d) / this.scale };
  }

  // --- what the labels show: tenths of a metre and whole degrees ---------------------
  metresShown(name) {
    return tenths(this.metres(name));
  }

  degreesShown(letter) {
    return Math.round(this.angle(letter));
  }

  halvesShown() {
    const h = this.halves();
    return { AO: tenths(h.AO), OC: tenths(h.OC), BO: tenths(h.BO), OD: tenths(h.OD) };
  }

  pairParallel(sides) {
    return parallel(this.sideOf(sides[0]), this.sideOf(sides[1]), EXACT.parallel);
  }

  // Whether the frame has the level's property. The track's stops make it exact: the one stop
  // that is the corner's place has it, every other stop misses by at least a step the labels
  // show (tests/geometry.py checks every stop), so the numbers on the net match exactly when
  // Drop Net will say the frame is right. `snap` is where it locks: that same place.
  check() {
    const L = this.level;
    if (!isValidQuad(this.points)) return { ok: false };
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    let ok;
    switch (L.type) {
      case 'free': ok = true; break; // (the warm-up: nothing to set)
      case 'parallel': ok = this.pairParallel(L.sides); break;
      case 'length': ok = near(this.metres(L.side), L.metres[L.reference], EXACT.metres); break;
      case 'sides': ok = near(this.metres('CD'), L.metres.AB, EXACT.metres) && near(this.metres('BC'), this.metres('AD'), EXACT.metres); break;
      case 'angle': ok = near(this.angle(L.vertex), L.degrees, EXACT.degrees); break;
      case 'supplementary': ok = near(L.degrees + this.angle(L.vertex), 180, EXACT.degrees); break;
      case 'diagonals': { const h = this.halves(); ok = near(h.AO, h.OC, EXACT.metres) && near(h.BO, h.OD, EXACT.metres); break; }
      default: ok = near(this.metres('AB'), this.metres('CD'), EXACT.metres) && near(this.metres('BC'), this.metres('AD'), EXACT.metres);
    }
    return { ok, snap: this.target };
  }

  // What lights up after a correct check, step by step.
  glowFor(level) {
    const both = [{ sides: ['AB', 'CD'] }, { sides: ['BC', 'AD'] }];
    switch (level.type) {
      case 'free': return [];
      case 'parallel': return level.both ? both : [{ sides: level.sides }];
      case 'length': return [{ sides: [level.reference, level.side] }];
      case 'sides': return both;
      case 'angle': case 'supplementary': return [{ angles: [level.reference, level.vertex] }];
      case 'diagonals': return [{ halves: 'AC' }, { halves: 'BD' }];
      default: return [...both, { angles: ['A', 'C'] }, { diagonals: true }];
    }
  }

  showGlow(steps, each = 0.8) {
    this.glow = { steps, each, t: 0 };
  }

  // A wrong net, as it is: the parts the level compares (they pulse red at Check, each step twice: drawMiss) and
  // whether the part the child sets is over what it should be - the longer, wider or bigger side of its place - which
  // picks the level's hint (levels.js `hints`: [under, over]). Read from the frame itself, so the hint is always true.
  missFor(level) {
    const m = (name) => this.metres(name), twice = (steps) => steps.flatMap((s) => [s, s]);
    switch (level.type) {
      case 'parallel': { // the other pair (already parallel): the side the corner pulls, against its opposite
        const pair = level.sides[0] === 'AB' ? ['BC', 'AD'] : ['AB', 'CD'], set = pair.find((n) => n.includes(level.corner));
        const opposite = pair.find((n) => n !== set);
        return { steps: twice([{ sides: pair }]), over: m(set) > m(opposite) };
      }
      case 'length': return { steps: twice([{ sides: [level.reference, level.side] }]), over: m(level.side) > level.metres[level.reference] };
      case 'sides': return { steps: [{ sides: ['AB', 'CD'] }, { sides: ['BC', 'AD'] }], over: m('CD') > level.metres.AB };
      case 'angle': return { steps: twice([{ angles: [level.reference, level.vertex] }]), over: this.angle(level.vertex) > level.degrees };
      case 'supplementary': return { steps: twice([{ angles: [level.reference, level.vertex] }]), over: this.angle(level.vertex) > 180 - level.degrees };
      case 'diagonals': { const h = this.halves(); return { steps: [{ halves: 'AC' }, { halves: 'BD' }], over: h.OC > h.AO }; }
      default: return { steps: twice([{ sides: ['AB', 'CD'] }]), over: m('CD') > m('AB') };
    }
  }

  showMiss(steps, each = 0.6) {
    this.miss = { steps, each, t: 0 };
  }

  update(dt) {
    this.time += dt;
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt / 0.45);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.7);
    if (this.thrash > 0 && !this.thrashHold) this.thrash = Math.max(0, this.thrash - dt / 0.5); // (dies away once the fish is off)
    if (this.hintPulse > 0) this.hintPulse = Math.max(0, this.hintPulse - dt);
    if (this.glow && (this.glow.t += dt) >= this.glow.steps.length * this.glow.each) this.glow = null;
    if (this.miss && (this.miss.t += dt) >= this.miss.steps.length * this.miss.each) this.miss = null;
    if (this.burst && (this.burst.t += dt) > 0.7) this.burst = null;
    // the moving corner glides onto its stop in a few frames: a quick click, not a jump
    if (this.drawn) {
      const p = this.points[this.movable];
      this.drawn = this.reduced ? null : lerp(this.drawn, p, Math.min(1, dt * 30));
      if (this.drawn && distance(this.drawn, p) < 0.3) this.drawn = null;
    }
  }

  // --- drawing --------------------------------------------------------------------
  draw(ctx, { waterline, pulley }) {
    if (!this.visible) return;
    this.readyLabels = null;
    this.letterCorners = null;
    const r = this.ring();
    const reach = Math.max(...this.points.map((p) => length(p))) + 80 + this.sagDepth() * this.pouch;
    const top = Math.min(pulley.hub.y - 30, r.y - reach);
    const bottom = r.y + reach;
    if (bottom < waterline) {
      this.drawAll(ctx, r, pulley, false);
    } else if (top > waterline) {
      this.drawAll(ctx, r, pulley, true);
    } else {
      // across the surface: the dry part above the waterline, the wet part below it
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top - 10, PopoGame.STAGE_W, waterline - top + 10);
      ctx.clip();
      this.drawAll(ctx, r, pulley, false);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, waterline, PopoGame.STAGE_W, bottom - waterline + 10);
      ctx.clip();
      this.drawAll(ctx, r, pulley, true);
      ctx.restore();
    }
  }

  // The words on the net - its measures and its corner letters - drawn once, after the scene (Game.draw: after the
  // raft, its water and the splashes), so they are never split at the surface, dimmed under it or covered: they're what
  // the child reads.
  drawWords(ctx) {
    if (!this.visible || (!this.readyLabels && !this.letterCorners)) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    for (const l of this.readyLabels || []) this.text(ctx, l.string, l.x, l.y, l.px, l.colour, l.live, { letter: l.letter });
    if (this.letterCorners) this.drawLabels(ctx, this.letterCorners);
    ctx.restore();
  }

  drawAll(ctx, ring, pulley, wet) {
    const frame = this.framed();
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => this.toStage(this.meshPoint(u, v, frame)));
    const showing = !this.furl && (!this.locked || this.glow || this.miss);
    ctx.save();
    ctx.globalAlpha = this.alpha * (wet ? 0.9 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (wet) ctx.filter = 'saturate(0.6) brightness(0.85)';
    // the lifting rope comes round the boom's end pulley and drops into the ring's socket; the
    // sling that carries the whole frame comes up from the top corners behind the ring and is
    // lashed to its bottom bar with two turns, which hide the legs' ends. The machine's painted
    // rope, tiled.
    drawPulleyWrap(ctx, pulley.hub, pulley.exit, this.ropePhase);
    this.ropeTop = pulley.exit; // (the labels keep off the lifting rope: labelLines)
    drawRope(ctx, pulley.exit, { x: ring.x, y: ring.y + 6 }, ROPE_WIDTH, this.ropePhase);
    // the sling's legs come down to the top corners; closing into a bag, the mouth rises into
    // the ring and they shorten away to nothing
    const knot = { x: ring.x, y: ring.y + KNOT };
    drawRope(ctx, knot, corners[0], 5);
    drawRope(ctx, knot, corners[1], 5);
    ctx.filter = 'none';

    this.drawBagVolume(ctx, frame, wet);
    this.drawGenerated(ctx, wet, frame);
    // the ring over the mesh, so a closed bag's gathered mouth goes up into it and hangs from
    // its bar (an open net hangs well below it)
    if (wet) ctx.filter = 'saturate(0.6) brightness(0.85)';
    drawRing(ctx, ring.x, ring.y);
    // the turns stay on the bar, so their ends look tucked round behind it
    ctx.save();
    ctx.beginPath();
    ctx.rect(ring.x - 12, ring.y + RING_BAR.top, 24, RING_BAR.bottom - RING_BAR.top);
    ctx.clip();
    for (const dx of [-3, 3]) {
      drawRope(ctx, { x: ring.x + dx - 1.5, y: ring.y + RING_BAR.top - 2 }, { x: ring.x + dx + 1.5, y: ring.y + RING_BAR.bottom + 2 }, 4.5);
    }
    ctx.restore();
    ctx.filter = 'none';
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha *= this.flash * 0.7;
      ctx.lineWidth = 26;
      ctx.strokeStyle = '#fff1b0';
      this.framePath(ctx, corners);
      ctx.stroke();
      ctx.restore();
    }
    if (showing) this.drawMeasurements(ctx, corners);
    if (this.glow) this.drawGlow(ctx, corners);
    if (this.ghost) this.drawGhost(ctx, corners);
    if (this.miss) this.drawMiss(ctx, corners);
    if (!this.locked && !this.furl) this.drawArrows(ctx, corners[this.movable]); // (over the marks, under the knob)
    if (this.outline) this.drawOutline(ctx, corners);
    if (this.furl < 1) {
      // the eyelets fold away into the bundle as the net winds up
      ctx.save();
      ctx.globalAlpha *= (1 - this.furl) * (1 - this.pouch);
      this.drawCorners(ctx, corners, wet);
      ctx.restore();
    }
    if (showing) this.letterCorners = corners; // (drawn once both passes are done: draw)
    ctx.restore();
  }


  // Transparent depth over the catch, beneath the front mesh. Curved folds and a
  // bound neck give the bag volume without an opaque sticker hiding the fish.
  drawBagVolume(ctx, frame, wet) {
    if (this.pouch <= 0) return;
    ctx.save();
    ctx.globalAlpha *= this.pouch * (1 - this.furl);
    const point = (u, v) => this.toStage(this.meshPoint(u, v, frame));
    // from below the folded-away floats down
    const below = (k) => NECK + (1 - NECK) * k;
    ctx.beginPath();
    for (let i = 0; i <= 32; i += 1) {
      const q = point(0, below(i / 32));
      if (!i) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    for (let i = 32; i >= 0; i -= 1) {
      const q = point(1, below(i / 32));
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    // Keep the tear visibly open through every layer.
    if (this.tear) {
      this.tearHole().outline.forEach((q, i) => {
        const p = this.toStage(q);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      });
      ctx.closePath();
    }
    ctx.clip('evenodd');
    const left = point(0, 0.5), right = point(1, 0.5);
    const shade = ctx.createLinearGradient(left.x, left.y, right.x, right.y);
    shade.addColorStop(0, 'rgba(36, 48, 32, .32)');
    shade.addColorStop(0.3, 'rgba(233, 211, 144, .04)');
    shade.addColorStop(0.58, 'rgba(255, 238, 176, .10)');
    shade.addColorStop(1, 'rgba(30, 49, 36, .38)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, PopoGame.STAGE_W, PopoGame.STAGE_H);
    for (const u of [0.12, 0.27, 0.73, 0.88]) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i += 1) {
        const q = point(u, below(i / 24));
        if (!i) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = wet ? 'rgba(35, 58, 49, .18)' : 'rgba(78, 57, 26, .18)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 226, 158, .30)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // An outline is drawn round the frame from A, takes `trace` seconds to go round, stays `hold` seconds (breathing
  // once) and fades over `fade`: only the net's own outline, never a label (the hook: the net that stays open, and its
  // shape as Swiftee names it).
  traceOutline(trace = 1, hold = 1, fade = 0.5) {
    this.outline = { at: this.time, trace: this.reduced ? 0.01 : trace, hold, fade };
  }

  drawOutline(ctx, c) {
    const o = this.outline, t = this.time - o.at;
    if (t > o.trace + o.hold + o.fade) { this.outline = null; return; }
    const k = Math.min(1, t / o.trace);
    const a = t < o.trace + o.hold ? 1 : 1 - (t - o.trace - o.hold) / o.fade;
    const breathe = t > o.trace && t < o.trace + o.hold && !this.reduced ? Math.sin(((t - o.trace) / o.hold) * Math.PI) : 0;
    ctx.save();
    ctx.beginPath();
    const marked = this.markedSides && Object.keys(this.markedSides).length ? this.markedSides : null;
    if (marked) {
      // a net carrying parallel marks: every side lights at once, a marked side the way its marks point (A->B, B->C,
      // C->D and A->D, as drawTicks draws them), the others clockwise round the frame - the light and the marks go together
      ['AB', 'BC', 'CD', 'DA'].forEach((name, i) => {
        let a = c[i], b = c[(i + 1) % 4];
        if (name === 'DA' && marked.DA) [a, b] = [b, a]; // (A->D)
        const e = lerp(a, b, k);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(e.x, e.y);
      });
    } else {
      // an unmarked net (the hook's): one light round the frame from A, clockwise
      const lens = c.map((q, i) => distance(q, c[(i + 1) % 4]));
      let left = lens.reduce((sum, l) => sum + l, 0) * k;
      ctx.moveTo(c[0].x, c[0].y);
      for (let i = 0; i < 4 && left > 0; i += 1) {
        const p = lerp(c[i], c[(i + 1) % 4], Math.min(1, left / lens[i]));
        ctx.lineTo(p.x, p.y);
        left -= lens[i];
      }
      if (k >= 1) ctx.closePath();
    }
    // (the lesson's blue on a white edge, as the outline that carries the net into the lesson is drawn: it reads on the
    // golden rope, sky and water alike)
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.75 + 0.2 * breathe) * a})`;
    ctx.lineWidth = 13 + 3 * breathe;
    ctx.stroke();
    ctx.strokeStyle = `rgba(30, 123, 255, ${a})`;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }

  // The ways the knob can still slide, shown as a game shows a swipe: a trail of two chevrons tight against it on
  // each open side, in its own yellow with a dark rim, lighting up one after the other away from the knob so they
  // run the way it can go (the track itself isn't drawn; a closed end has no trail).
  drawArrows(ctx, knob) {
    const from = this.toStage(this.stop(this.track.min));
    const to = this.toStage(this.stop(this.track.max));
    const k = this.textScale;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const dir = normalize(sub(to, from));
    const perp = { x: -dir.y, y: dir.x };
    for (const [sign, open] of [[1, this.stopAt < this.track.max], [-1, this.stopAt > this.track.min]]) {
      if (!open) continue;
      for (let n = 0; n < 2; n += 1) {
        const wave = this.reduced ? 0.7 : (Math.sin(this.time * 5 - n * 1.3) + 1) / 2; // (runs outward)
        const size = (1 - n * 0.18) * k, d = ARROW_REACH * k + n * 15 * k + (this.reduced ? 0 : wave * 2.5);
        const tip = add(knob, times(dir, sign * (d + 5 * size)));
        const back = add(knob, times(dir, sign * (d - 4 * size)));
        const a = add(back, times(perp, 9 * size)), b = sub(back, times(perp, 9 * size));
        ctx.globalAlpha = 0.45 + 0.55 * wave;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 8 * size;
        ctx.strokeStyle = '#4a2c0f';
        ctx.stroke();
        ctx.lineWidth = 4 * size;
        ctx.strokeStyle = '#ffd84a';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Where the two slide arrows sit beside the knob at `knob` (a stage point), each null at its
  // end of the track; their tap targets go there (Game.placeHandle). They reach out with the labels on a small screen
  // (textScale), so the two 48 px targets never overlap each other or the knob's middle (where a tap is the knob's own,
  // not a step).
  arrowPoints(knob) {
    if (this.locked || this.furl) return { back: null, on: null };
    const dir = normalize(sub(this.toStage(this.stop(this.track.max)), this.toStage(this.stop(this.track.min))));
    const at = (sign) => add(knob, times(dir, sign * (ARROW_REACH + 7) * this.textScale));
    return { back: this.stopAt > this.track.min ? at(-1) : null, on: this.stopAt < this.track.max ? at(1) : null };
  }

  // The generated net texture (assets/generated/net.png) warped onto the frame: the rope
  // frame of the picture lands on the corners and the floats and weights outside it come
  // along; closed into a bag, the mesh follows meshPoint. Drawn in net coordinates and cached
  // per shape, so bobbing, swinging and lowering never rebuild it; only a drag or the bag
  // closing does.
  // A shape that is changing (a drag, the bag closing) is drawn at one texture pixel per stage
  // pixel, quick to rebuild every frame; once it has held still for two frames it is redrawn at
  // the screen's full sharpness (sharpRes, set by Game.resize). The open net is a flat warp and
  // needs few rows of triangles; the bag's curves get more.
  drawGenerated(ctx, wet, frame) {
    const key = JSON.stringify(frame) + this.pouch;
    const surfaceKey = `${key}|${this.tangle.toFixed(4)}`;
    const changed = this.textureKey !== surfaceKey;
    if (changed) {
      this.stillFrames = 0;
    } else if (this.textureRes < this.sharpRes && (this.stillFrames = (this.stillFrames || 0) + 1) >= 2) {
      this.textureKey = null;
    }
    if (this.textureKey !== surfaceKey) {
      const res = changed ? 1 : this.sharpRes; // (quick while it moves - redrawing the warp fine every frame of a drag made the drag lag - and its full sharpness the moment it is still)
      this.textureRes = res;
      this.textureKey = surfaceKey;
      const rows = this.pouch || this.tangle ? 24 : 6;
      const img = PopoGame.assets.netPolished;
      const map = (u, v) => this.meshPoint(u, v, frame);
      // registration is on the rope centreline; the outer floats and weights come along
      const source = { x: 63, y: 110, w: 1645, h: 630 };
      const u0 = -source.x / source.w;
      const u1 = (img.width - source.x) / source.w;
      const v0 = -source.y / source.h;
      const v1 = (img.height - source.y) / source.h;
      const bounds = [];
      for (let y = 0; y <= rows; y += 1) for (let x = 0; x <= 12; x += 1) bounds.push(map(u0 + (u1 - u0) * x / 12, v0 + (v1 - v0) * y / rows));
      const left = Math.floor(Math.min(...bounds.map((q) => q.x))) - 3;
      const top = Math.floor(Math.min(...bounds.map((q) => q.y))) - 3;
      const width = Math.ceil(Math.max(...bounds.map((q) => q.x)) - left) + 3;
      const height = Math.ceil(Math.max(...bounds.map((q) => q.y)) - top) + 3;
      const canvas = this.textureCanvas || (this.textureCanvas = document.createElement('canvas'));
      canvas.width = Math.ceil(width * res);
      canvas.height = Math.ceil(height * res);
      const g = canvas.getContext('2d');
      g.scale(res, res);
      g.translate(-left, -top);
      const triangle = (a, b, c) => {
        const q = [a, b, c].map(([u, v]) => map(u, v));
        const src = [a, b, c].map(([u, v]) => ({ x: source.x + u * source.w, y: source.y + v * source.h }));
        const [s0, s1, s2] = src;
        const [d0, d1, d2] = q;
        const ax = s1.x - s0.x;
        const ay = s1.y - s0.y;
        const bx = s2.x - s0.x;
        const by = s2.y - s0.y;
        const det = ax * by - ay * bx;
        const A = ((d1.x - d0.x) * by - (d2.x - d0.x) * ay) / det;
        const B = ((d1.y - d0.y) * by - (d2.y - d0.y) * ay) / det;
        const C = ((d2.x - d0.x) * ax - (d1.x - d0.x) * bx) / det;
        const D = ((d2.y - d0.y) * ax - (d1.y - d0.y) * bx) / det;
        const mid = { x: (d0.x + d1.x + d2.x) / 3, y: (d0.y + d1.y + d2.y) / 3 };
        g.save();
        g.beginPath();
        q.forEach((point, i) => {
          // each triangle grows a hair past its edges so no seams show between them
          const dx = point.x - mid.x;
          const dy = point.y - mid.y;
          const k = 0.35 / (Math.hypot(dx, dy) || 1);
          if (i) g.lineTo(point.x + dx * k, point.y + dy * k); else g.moveTo(point.x + dx * k, point.y + dy * k);
        });
        g.closePath();
        g.clip();
        g.transform(A, B, C, D, d0.x - A * s0.x - C * s0.y, d0.y - B * s0.x - D * s0.y);
        // only the part of the picture under this triangle (with a pixel to spare), not the whole picture clipped: the
        // same mesh, much less to draw each time the shape changes (a drag, the bag closing, a tangle)
        const sx0 = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - 2), sy0 = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - 2);
        const sx1 = Math.min(img.width, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + 2), sy1 = Math.min(img.height, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + 2);
        if (sx1 > sx0 && sy1 > sy0) g.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
        g.restore();
      };
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const u = u0 + (u1 - u0) * x / 12;
          const v = v0 + (v1 - v0) * y / rows;
          const r = u0 + (u1 - u0) * (x + 1) / 12;
          const b = v0 + (v1 - v0) * (y + 1) / rows;
          triangle([u, v], [r, v], [r, b]);
          triangle([u, v], [r, b], [u, b]);
        }
      }
      this.textureBounds = { left, top, width, height };
    }
    const r = this.ring();
    const b = this.textureBounds;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(this.swing);
    if (this.furl) {
      // gathered as in gathered(): narrowed about the ring, shortened toward the knot
      ctx.translate(0, KNOT);
      ctx.scale(1 - GATHER.x * this.furl, 1 - GATHER.y * this.furl);
      ctx.translate(0, -KNOT);
    }
    if (wet) ctx.filter = 'saturate(.7) brightness(.88)';
    if (!this.tear) {
      this.paintMesh(ctx, frame, b);
      ctx.restore();
      return;
    }
    // torn: the mesh is drawn everywhere but the hole (the box and the hole's outline, filled
    // even-odd), and broken strands hang into it
    const hole = this.tearHole();
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.left, b.top, b.width, b.height);
    hole.outline.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.clip('evenodd');
    this.paintMesh(ctx, frame, b);
    ctx.restore();
    // frayed ends all round the edge, drooping, each dark-edged so it reads over sea and sky
    ctx.lineCap = 'round';
    ctx.beginPath();
    hole.outline.forEach((q, i) => {
      const end = lerp(q, hole.centre, i % 2 ? 0.16 : 0.3);
      ctx.moveTo(q.x, q.y);
      ctx.quadraticCurveTo((q.x + end.x) / 2, (q.y + end.y) / 2 + 5, end.x, end.y + 10);
    });
    ctx.lineWidth = 4.6;
    ctx.strokeStyle = '#5a3a14';
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#e0b060';
    ctx.stroke();
    if (this.burst) {
      // bits flung out as it tears, falling and fading
      const t = this.burst.t;
      ctx.globalAlpha *= 1 - t / 0.7;
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU + i;
        const v = 160 + (i % 4) * 35;
        const x = hole.centre.x + Math.cos(a) * v * t;
        const y = hole.centre.y + Math.sin(a) * v * t + 520 * t * t;
        const spin = a + t * 9;
        ctx.moveTo(x - Math.cos(spin) * 7, y - Math.sin(spin) * 7);
        ctx.lineTo(x + Math.cos(spin) * 7, y + Math.sin(spin) * 7);
      }
      ctx.lineWidth = 4.6;
      ctx.strokeStyle = '#5a3a14';
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#e0b060';
      ctx.stroke();
    }
    ctx.restore();
  }

  // The warped texture, in net coordinates. Closing into a bag, the floats along the top rope
  // would be squeezed into the gathered mouth and fan out above it like spikes, and the weights
  // along the bottom would hang from the toe in a tassel, so both fold away as it closes: the
  // bag's body is drawn whole and the bands above and below it fade out.
  paintMesh(ctx, frame, b) {
    const image = () => ctx.drawImage(this.textureCanvas, b.left, b.top, b.width, b.height);
    if (!this.pouch) { image(); return; }
    // the bag's body lies between its mouth (below the floats) and its toe (above the weights)
    const edge = (v) => {
      const line = [];
      for (let i = 0; i <= 12; i += 1) line.push(this.meshPoint(i / 12, v, frame));
      return line;
    };
    const neck = edge(NECK);
    const toe = edge(TOE);
    const right = b.left + b.width;
    const body = () => {
      ctx.moveTo(b.left, neck[0].y);
      neck.forEach((q) => ctx.lineTo(q.x, q.y));
      ctx.lineTo(right, neck[neck.length - 1].y);
      ctx.lineTo(right, toe[toe.length - 1].y);
      for (let i = toe.length - 1; i >= 0; i -= 1) ctx.lineTo(toe[i].x, toe[i].y);
      ctx.lineTo(b.left, toe[0].y);
      ctx.closePath();
    };
    ctx.save();
    ctx.beginPath();
    body();
    ctx.clip();
    image();
    ctx.restore();
    if (this.pouch >= 1) return;
    // the floats above and the weights below fade as the bag closes
    ctx.save();
    ctx.globalAlpha *= (1 - this.pouch) ** 2;
    ctx.beginPath();
    ctx.rect(b.left, b.top, b.width, b.height);
    body();
    ctx.clip('evenodd');
    image();
    ctx.restore();
  }

  framePath(ctx, c) {
    ctx.beginPath();
    c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  // Only what the level is about is shown: parallel ticks, side lengths, angle arcs or the
  // diagonals with their halves. Reference values stay fixed; the rest update as the corner moves.
  // The labels are gathered first and laid out together (see placeLabels), so none covers another
  // however crowded the net or small the screen.
  drawMeasurements(ctx, c) {
    this.labelQueue = [];
    this.measure(ctx, c);
    const labels = this.labelQueue;
    this.labelQueue = null;
    // (laid out afresh only when something it depends on has changed - the words, the frame's shape, the scene round
    // the net, the view - as seen from corner A, so the raft's bob alone never relays it out: within 4 px on the net
    // and 8 px round it, which the crane's and Popo's boxes have to spare, labelObstacles; otherwise as last time)
    const c0 = c[0], v = this.viewBox;
    const words = ['v2', this.textScale.toFixed(3), this.wordScale.toFixed(3), this.locked, ...labels.map((l) => `${l.string}|${l.px}`), // (v2: the layout's rules - a cache from older ones is not reused)
      v ? [v.x0, v.y0, v.x1, v.y1].map((e) => Math.round(e / 8)).join(',') : ''].join(';');
    const nums = [], tol = [];
    const put = (q, by) => { nums.push(q.x - c0.x, q.y - c0.y); tol.push(by, by); };
    c.forEach((q) => put(q, 4));
    labels.forEach((l) => put(l, 4));
    for (const b of this.sceneBoxes || []) { put({ x: b.x0, y: b.y0 }, 8); put({ x: b.x1, y: b.y1 }, 8); }
    if (this.ropeTop) put(this.ropeTop, 8);
    // (and the last few dozen layouts by their rounded shape, so dragging back over stops already seen costs nothing)
    const last = this.labelCache, recent = this.labelLayouts || (this.labelLayouts = new Map());
    const id = `${words}#${nums.map((n, i) => Math.round(n / tol[i])).join(',')}`;
    const use = (out) => labels.forEach((l, i) => { const m = out[i]; l.x = c0.x + m.x; l.y = c0.y + m.y; l.px = m.px; l.pinned = l.pinned || !!m.pinned; });
    if (last && last.words === words && last.nums.length === nums.length && nums.every((n, i) => Math.abs(n - last.nums[i]) <= tol[i])) {
      use(last.out);
    } else if (recent.has(id)) {
      use(recent.get(id));
      this.labelCache = { words, nums, out: recent.get(id) };
    } else {
      this.placeLabels(labels, this.labelObstacles(c), this.labelLines(c));
      const out = labels.map((l) => ({ x: l.x - c0.x, y: l.y - c0.y, px: l.px, pinned: !!l.held }));
      this.labelCache = { words, nums, out };
      recent.set(id, out);
      if (recent.size > 48) recent.delete(recent.keys().next().value);
    }
    this.readyLabels = labels; // (drawn once both passes are done: draw)
  }

  // The lines drawn on and over the net that no label may sit across: the frame's four sides and the sling's two legs
  // up to the ring (`edge`: a label on the net, an angle's or a half's, leaves them inward, any other outward, so a
  // side's length never ends up inside the frame or the sling), the diagonals when they're up and the lifting rope.
  labelLines(c) {
    const r = this.ring(), knot = { x: r.x, y: r.y + KNOT };
    const k = this.wordScale;
    const lines = [[c[0], c[1], 12], [c[1], c[2], 4], [c[2], c[3], 4], [c[3], c[0], 4]]
      .map(([a, b, pad]) => ({ a, b, pad: pad * k, edge: true })); // (the top rope's floats stand out from it)
    // (the sling's legs are not kept off: AB's length sits between them, centred over the rope, under the ring)
    lines.push({ a: this.ropeTop || { x: r.x, y: r.y - 600 }, b: r, pad: 3 * k });
    if (this.level && this.level.type === 'diagonals') lines.push({ a: c[0], b: c[2], pad: 4 * k }, { a: c[1], b: c[3], pad: 4 * k });
    lines.centre = midpoint(midpoint(c[0], c[1]), midpoint(c[2], c[3]));
    lines.frame = c;
    return lines;
  }

  // What the labels must keep clear of, as boxes on the stage (x0, y0, x1, y1) with the way a label may be pushed off
  // ('x' slides it along, 'y' moves it up or down, else either): the lifting ring and its shackle (a label slides off it
  // sideways, along its side), the weights hanging under the bottom rope, the corner letters, the knob with its two
  // slide arrows, and the crane and Popo beside the net.
  labelObstacles(c) {
    const k = this.textScale, r = this.ring(), out = [];
    out.push({ x0: r.x - 18, y0: r.y - 10, x1: r.x + 18, y1: r.y + RING_KNOT + 10, axis: 'x' });
    const h = distance(midpoint(c[0], c[1]), midpoint(c[3], c[2])), hang = Math.max(22, h * 0.13);
    const [d, cc] = [c[3], c[2]], steps = 8;
    for (let i = 0; i < steps; i += 1) {
      const p = lerp(d, cc, (i + 0.5) / steps), half = distance(d, cc) / steps / 2 + 2;
      out.push({ x0: p.x - half, y0: p.y - 4, x1: p.x + half, y1: p.y + hang, axis: 'y' });
    }
    const w = this.wordScale;
    this.letterPoints(c).forEach((p) => out.push({ x0: p.x - 13 * w, y0: p.y - 15 * w, x1: p.x + 13 * w, y1: p.y + 15 * w }));
    if (!this.locked && !this.furl) { // the knob, and its two pairs of arrows out along the track
      const q = c[this.movable], dir = normalize(sub(this.toStage(this.stop(this.track.max)), this.toStage(this.stop(this.track.min))));
      out.push({ x0: q.x - 26 * k, y0: q.y - 26 * k, x1: q.x + 26 * k, y1: q.y + 26 * k });
      for (const sign of [1, -1]) {
        const m = add(q, times(dir, sign * 53 * k));
        out.push({ x0: m.x - 20 * k, y0: m.y - 20 * k, x1: m.x + 20 * k, y1: m.y + 20 * k });
      }
    }
    if (this.level && this.level.type === 'diagonals') { // (the dot where the diagonals cross)
      const o = intersection(c[0], c[2], c[1], c[3]) || midpoint(c[0], c[2]);
      out.push({ x0: o.x - 12, y0: o.y - 12, x1: o.x + 12, y1: o.y + 12 });
    }
    // the parallel marks at the middles of the marked sides
    // (each chevron's own points, as drawTicks draws them, and a little air)
    for (const [name, n] of Object.entries(this.markedSides || {})) {
      const [i, j] = side(name), [a, b] = (i + 1) % 4 === j ? [i, j] : [j, i], m = midpoint(c[i], c[j]), u = normalize(sub(c[b], c[a])), pts = [];
      for (let q = 0; q < n; q += 1) {
        const o = (q - (n - 1) / 2) * 13 * k, px = m.x + u.x * o, py = m.y + u.y * o;
        pts.push({ x: px - u.x * 9 * k - u.y * 9 * k, y: py - u.y * 9 * k + u.x * 9 * k }, { x: px + u.x * 6 * k, y: py + u.y * 6 * k }, { x: px - u.x * 9 * k + u.y * 9 * k, y: py - u.y * 9 * k - u.x * 9 * k });
      }
      const pad = 3 * k;
      out.push({ x0: Math.min(...pts.map((q) => q.x)) - pad, y0: Math.min(...pts.map((q) => q.y)) - pad, x1: Math.max(...pts.map((q) => q.x)) + pad, y1: Math.max(...pts.map((q) => q.y)) + pad });
    }
    // the crane and Popo beside the net (the game's: Game.draw), so no label lands on the copper or on him
    for (const b of this.sceneBoxes || []) out.push({ x0: b.x0 - 10, y0: b.y0 - 10, x1: b.x1 + 10, y1: b.y1 + 10, scene: true }); // (the crane and Popo: a side they cover has its length just inside, placeLabels)
    return out;
  }

  // Nudges overlapping labels apart, each pair along the way they overlap least, a few rounds; and slides any label
  // that sits across one of the net's lines off it, square to the line, on the side its middle is (so a side's length
  // stays outside the frame and a half's beside its diagonal).
  placeLabels(labels, obstacles = [], lines = []) {
    const k = this.wordScale;
    const half = (l) => labelHalf(l.string, l.px, k);
    const boxAt = (x, y, hl, pad = 0) => ({ x0: x - hl.w - pad, y0: y - hl.h - pad, x1: x + hl.w + pad, y1: y + hl.h + pad });
    const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0;
    for (const l of labels) l.want = { x: l.x, y: l.y };
    // off a line: square to it, just clear of it (with its margin)
    const offLines = (l) => {
      let moved = false;
      if (l.pinned) return false;
      const hl = half(l);
      for (const { a, b, pad, edge } of lines) {
        if (!crosses(boxAt(l.x, l.y, hl, pad), a, b)) continue;
        const u = normalize(sub(b, a));
        if (!Number.isFinite(u.x)) continue;
        const n = { x: -u.y, y: u.x };
        const d = dot(sub(l, a), n);
        let way = d >= 0 ? 1 : -1;
        if (edge) {
          const inward = dot(sub(lines.centre, a), n) >= 0 ? 1 : -1;
          way = l.inside ? inward : -inward;
        }
        const need = reach(hl, n) + pad + 2 * k - way * d;
        if (need <= 0) continue;
        l.x += n.x * way * need;
        l.y += n.y * way * need;
        moved = true;
      }
      return moved;
    };
    // every side's length at the middle of its side, outside it, one gap off - the same rule on every side of every
    // net, so the four read as one set; only the lifting ring over AB slides AB's along AB, just enough to clear it;
    // held there, so the pushes below leave it. Returns whether any moved.
    const snapLengths = () => {
      let any = false;
      for (const l of labels) {
        if (l.inside || l.letter || !l.near || !l.along || !lines.frame) continue;
        const { a, b } = l.near, u = normalize(sub(b, a)); if (!Number.isFinite(u.x)) continue;
        let n = { x: -u.y, y: u.x }; if (dot(n, sub(lines.centre, a)) > 0) n = times(n, -1); // (outward)
        const hl = half(l), off = reach(hl, n) + 12 * k;
        const spots = [0.5, 0.44, 0.56, 0.38, 0.62].map((t) => add(lerp(a, b, t), times(n, off)));
        const ringBox = obstacles.find((o) => o.axis === 'x'); // (the lifting ring and its shackle, over AB)
        const clearRing = (p) => !ringBox || !overlap(boxAt(p.x, p.y, hl), ringBox);
        const spot = spots.find(clearRing) || spots[0];
        if (Math.abs(l.x - spot.x) > 1 || Math.abs(l.y - spot.y) > 1) { l.x = spot.x; l.y = spot.y; any = true; }
        l.pinned = true; l.held = true;
      }
      return any;
    };
    for (let round = 0; round < 40; round += 1) {
      let moved = false;
      // every side's length at its side's middle first (held there), then the rest: off whatever they must keep clear
      // of (only the label moves), apart from each other, and last off the lines
      if (snapLengths()) moved = true;
      for (const l of labels) {
        if (l.pinned) continue;
        const hl = half(l);
        for (const o of obstacles) {
          const ox = Math.min(l.x + hl.w, o.x1) - Math.max(l.x - hl.w, o.x0);
          const oy = Math.min(l.y + hl.h, o.y1) - Math.max(l.y - hl.h, o.y0);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
          if (o.axis === 'x' || (o.axis !== 'y' && ox < oy)) l.x += (ox + 1) * (l.x >= cx ? 1 : -1);
          else l.y += (oy + 1) * (l.y >= cy ? 1 : -1);
        }
      }
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const a = labels[i];
          const b = labels[j];
          const ha = half(a);
          const hb = half(b);
          const ox = ha.w + hb.w - Math.abs(a.x - b.x);
          const oy = ha.h + hb.h - Math.abs(a.y - b.y);
          if (ox <= 0 || oy <= 0 || (a.pinned && b.pinned)) continue;
          moved = true;
          // (a pinned label holds still: the other makes all the way)
          const sa = a.pinned ? 0 : b.pinned ? 2 : 1, sb = b.pinned ? 0 : a.pinned ? 2 : 1;
          if (oy < ox) {
            const d = (oy / 2 + 1) * (b.y >= a.y ? 1 : -1);
            a.y -= d * sa;
            b.y += d * sb;
          } else {
            const d = (ox / 2 + 1) * (b.x >= a.x ? 1 : -1);
            a.x -= d * sa;
            b.x += d * sb;
          }
        }
      }
      for (const l of labels) if (offLines(l)) moved = true;
      // ...and inside what the view shows (below the HUD's top row; through the zoom on the net)
      const v = this.viewBox;
      if (v) {
        for (const l of labels) {
          if (l.pinned) continue;
          const hl = half(l), x = Math.max(v.x0 + hl.w, Math.min(v.x1 - hl.w, l.x)), y = Math.max(v.y0 + hl.h, Math.min(v.y1 - hl.h, l.y));
          if (x !== l.x || y !== l.y) { l.x = x; l.y = y; moved = true; }
        }
      }
      if (!moved) break;
    }
    // A label the nudging couldn't free (a crowded net, a small screen): the nearest free spot round where it wanted
    // to be - on the net if it belongs there (failing that, just off it), and failing that a size smaller. The blocked
    // ones are placed nearest-first, each against the labels already settled, so one that has room close by gets it.
    const frame = lines.frame;
    const view = this.viewBox;
    // (a length pushed inside the frame by the nudging counts as blocked: its spot is searched outside, along its side)
    for (const l of labels) if (frame && !l.pinned && !l.inside && !l.letter && insideConvex({ x: l.x, y: l.y }, frame)) l.forced = true;
    // (how far a spot's box is from the part its label names: the gap from the middle less the box's own reach; to its
    // body, not its ends, so a label by O - where all four halves meet - is near none of them; and never across another
    // line, so a half's label shares its triangle - or the open water - with its own half)
    const across = (p, q, a, b) => {
      const d1 = cross(sub(b, a), sub(p, a)), d2 = cross(sub(b, a), sub(q, a));
      const d3 = cross(sub(q, p), sub(a, p)), d4 = cross(sub(q, p), sub(b, p));
      return d1 * d2 < 0 && d3 * d4 < 0;
    };
    const farFrom = (l, x, y, hl) => {
      const { a, b } = l.near, ab = sub(b, a), len2 = dot(ab, ab);
      const t = len2 ? Math.max(0.15, Math.min(0.85, dot(sub({ x, y }, a), ab) / len2)) : 0;
      const q = add(a, times(ab, t)), d = distance({ x, y }, q), here = { x, y };
      if (len2) {
        for (const line of lines) {
          const along = sub(line.b, line.a);
          if (Math.abs(cross(along, ab)) < 1e-6 * Math.sqrt(dot(along, along) * len2)) continue; // (its own line)
          if (across(here, q, line.a, line.b)) return Infinity;
        }
      }
      return d - (d ? reach(hl, normalize(sub(q, here))) : 0);
    };
    let strict = 1; // (how close it must be to its part: 1 its own gap; 2.5 a looser one, crowded; -1 by its `last`
    // spot - a half's corner - and close to it; 0 anywhere with no line between it and its part; -2 anywhere at all)
    // (the cheap tests first: the view, nearness, the side of the frame; then the boxes; the lines last)
    const isFree = (l, x, y, hl, inside, others) => {
      if (view && (x - hl.w < view.x0 || x + hl.w > view.x1 || y - hl.h < view.y0 || y + hl.h > view.y1)) return false;
      if (strict > 0 && l.near && farFrom(l, x, y, hl) > l.near.gap * strict) return false;
      if (strict === -1 && (!l.last || distance({ x, y }, l.last) > 40 * k)) return false;
      if (strict === 0 && l.near && farFrom(l, x, y, hl) === Infinity) return false;
      if (frame && insideConvex({ x, y }, frame) !== inside) return false;
      const box = boxAt(x, y, hl);
      for (const o of obstacles) if (overlap(box, o)) return false;
      for (const m of others) if (m !== l && overlap(box, boxAt(m.x, m.y, half(m)))) return false;
      for (const { a, b, pad } of lines) if (crosses(boxAt(x, y, hl, pad), a, b)) return false;
      return true;
    };
    // the cheapest spot: how far it moves, plus a little for a size smaller and more for the other side of the frame
    // (a side's length just inside its side beats one far off; an angle's value just outside its corner beats none)
    // (searched round where it wanted to be, and round its alternative - a side's length just inside its side, a
    // half's beside the other side of it, an angle's value just outside its corner - which costs a little more)
    const nearest = (l, others) => {
      if (strict === -1 && !l.last) return null;
      const own = strict === -1 ? l.last : { x: l.want.x, y: l.want.y, inside: l.inside }, alt = strict === -1 ? null : l.alt;
      if (strict === -1) { // (by its corner: as it is, or a size or two smaller, inside or out)
        const tries = [[own, 1, 0], [own, 0.88, 30 * k], [own, 0.78, 60 * k], [{ ...own, inside: true }, 0.88, 80 * k]];
        let best = null;
        for (const [from, shrink, penalty] of tries) {
          if (best && penalty >= best.cost) continue;
          const hl = labelHalf(l.string, l.px * shrink, k);
          for (let r = 0; r <= 40 * k && !best; r += 5 * k) {
            const steps = r ? 12 : 1;
            for (let i = 0; i < steps; i += 1) {
              const t = (i / steps) * TAU, x = from.x + Math.cos(t) * r, y = from.y + Math.sin(t) * r;
              if (isFree(l, x, y, hl, from.inside, others)) { best = { x, y, shrink, cost: penalty + r }; break; }
            }
          }
        }
        return best;
      }
      const along = (l.along || []).map((p) => ({ x: p.x, y: p.y, inside: l.inside }));
      const length = !!l.along; // (a side's length: outside its side only - never searched inside the frame)
      const tries = [[own, 1, 0], [own, 0.88, 50 * k]]
        .concat(along.flatMap((p, i) => [[p, 1, 20 * k + 10 * i * k], [p, 0.88, 60 * k + 10 * i * k]]))
        .concat(alt ? [[alt, 1, 30 * k], [alt, 0.88, 80 * k]] : [])
        .concat(length ? [[own, 0.78, 100 * k]] : [[{ ...own, inside: !l.inside }, 1, 90 * k], [own, 0.78, 100 * k], [{ ...own, inside: !l.inside }, 0.88, 130 * k]]);
      let best = null;
      for (const [from, shrink, penalty] of tries) {
        if (best && penalty >= best.cost) continue;
        const hl = labelHalf(l.string, l.px * shrink, k), inside = from.inside;
        let found = false;
        for (let r = 0; r <= 150 * k && !found && (!best || penalty + r < best.cost); r += 7 * k) {
          const steps = r ? 12 : 1;
          for (let i = 0; i < steps; i += 1) {
            const t = (i / steps) * TAU, x = from.x + Math.cos(t) * r, y = from.y + Math.sin(t) * r;
            if (isFree(l, x, y, hl, inside, others)) { best = { x, y, shrink, cost: penalty + r }; found = true; break; }
          }
        }
      }
      return best;
    };
    // (a label that yields - O, which only needs to be by the crossing, any side of it - is placed after the others)
    const firm = labels.filter((l) => !l.yields);
    const settled = firm.filter((l) => l.pinned || l.held || (!l.forced && isFree(l, l.x, l.y, half(l), l.inside, firm))); // (held: outside its side, over the scene if it must - never searched inside)
    let blocked = firm.filter((l) => !settled.includes(l));
    // (each one's best spot is searched once - near its part, a little further from it on a crowded net, or failing
    // that anywhere - and again only if a label settling since has taken it)
    const search = (l) => {
      let sp = null;
      for (const level of [1, 2.5, -1, 0, -2]) { strict = level; sp = nearest(l, settled); if (sp) break; }
      strict = 1;
      return sp;
    };
    const spots = new Map(blocked.map((l) => [l, search(l)]));
    while (blocked.length) {
      let pick = null;
      for (const l of blocked) {
        const spot = spots.get(l);
        if (!pick || (spot && (!pick.spot || spot.cost < pick.spot.cost))) pick = { l, spot };
      }
      const { l, spot } = pick;
      if (spot && !(l.along && lines.frame && insideConvex({ x: spot.x, y: spot.y }, lines.frame))) { // (a length: never a spot inside the frame)
        l.x = spot.x;
        l.y = spot.y;
        l.px *= spot.shrink;
      }
      settled.push(l);
      blocked = blocked.filter((m) => m !== l);
      const taken = boxAt(l.x, l.y, half(l));
      for (const m of blocked) {
        const sp = spots.get(m);
        if (!sp || overlap(boxAt(sp.x, sp.y, labelHalf(m.string, m.px * sp.shrink, k)), taken)) spots.set(m, search(m));
      }
    }
    for (const l of labels.filter((m) => m.yields)) {
      if (!isFree(l, l.x, l.y, half(l), l.inside, settled)) {
        const spot = search(l);
        if (spot) { l.x = spot.x; l.y = spot.y; l.px *= spot.shrink; }
      }
      settled.push(l);
    }
  }

  measure(ctx, c) {
    const L = this.level;
    if (!L) return;
    const m = (name) => `${cm(this.metresShown(name))} ${T('unitCm')}`; // (7 cm, 5.5 cm: as the lesson writes lengths; the unit in the player's language)
    const deg = (letter) => `${this.degreesShown(letter)}°`;
    // Only what the task is about is on the net - the value given and the one the child sets - so nothing clutters
    // it: the net is checked by pressing Check, not by reading it
    // the parallel marks come from the net itself, on every net: a pair of opposite sides carries its marks (one
    // chevron on AB and CD, two on BC and AD) while it is parallel - within about two degrees, or once the net is right
    // - so a net shows exactly what is true of it, and a pair the child makes parallel gets its marks the moment it
    // is; they fade in and out (parA), never pop
    const dirOf = (n) => { const [i, j] = side(n); return normalize(sub(c[j], c[i])); };
    const isPar = (a, b) => { const u = dirOf(a), v = dirOf(b); return Math.abs(u.x * v.y - u.y * v.x) < 0.035; };
    // (a pair the net comes down with - net 2's AB parallel to CD - is marked from the start, as the net's given; the
    // pair the child has to make is marked only once Check has locked the net right - never while they drag, which
    // would give the answer away. givenPar: the pairs parallel as the level's net came down, Net.setLevel)
    const given = this.givenPar || { AB: false, BC: false };
    const par = L.type === 'free' ? { AB: false, BC: false } : { AB: given.AB ? isPar('AB', 'CD') : this.locked && isPar('AB', 'CD'), BC: given.BC ? isPar('BC', 'AD') : this.locked && isPar('BC', 'AD') };
    const dtm = Math.max(0, Math.min(0.1, this.time - (this.parT == null ? this.time : this.parT))); this.parT = this.time;
    this.parA = this.parA || { AB: par.AB ? 1 : 0, BC: par.BC ? 1 : 0 };
    for (const k of ['AB', 'BC']) this.parA[k] += ((par[k] ? 1 : 0) - this.parA[k]) * Math.min(1, dtm * 6);
    this.markedSides = par.AB || par.BC ? Object.assign({}, par.AB ? { AB: 1, CD: 1 } : {}, par.BC ? { BC: 2, DA: 2 } : {}) : null;
    const marks = () => {
      if (this.parA.AB > 0.02) { ctx.save(); ctx.globalAlpha *= Math.min(1, this.parA.AB); this.drawTicks(ctx, c, ['AB', 'CD'], false, 1); ctx.restore(); }
      if (this.parA.BC > 0.02) { ctx.save(); ctx.globalAlpha *= Math.min(1, this.parA.BC); this.drawTicks(ctx, c, ['BC', 'DA'], false, 2); ctx.restore(); }
    };
    marks();;
    switch (L.type) {
      case 'free': break; // (the warm-up: Popo's plain net)
      case 'parallel': {
        // the parallel marks say which pair of sides; the other pair (already parallel: the corner slides along one of
        // them) carries its lengths as the corner moves - the side the corner pulls live, its opposite fixed - and
        // they read the same exactly when the marked pair is parallel too (one pair parallel and equal makes a
        // parallelogram), so the child sees what the drag is doing; whether it is right is still Check's
        const other = L.sides[0] === 'AB' ? ['BC', 'AD'] : ['AB', 'CD'];
        for (const name of other) this.drawLength(ctx, c, name, m(name), name.includes(L.corner));
        break;
      }
      case 'length':
        this.drawLength(ctx, c, L.reference, `${L.metres[L.reference]} ${T('unitCm')}`);
        this.drawLength(ctx, c, L.side, m(L.side), true);
        break;
      case 'sides': { // the two sides given, and the two the child sets (their opposites)
        const given = Object.keys(L.metres);
        for (const name of ['AB', 'BC', 'CD', 'AD']) this.drawLength(ctx, c, name, given.includes(name) ? `${L.metres[name]} ${T('unitCm')}` : m(name), !given.includes(name));
        break;
      }
      case 'angle':
        this.drawAngle(ctx, c, L.reference, `${L.degrees}°`);
        this.drawAngle(ctx, c, L.vertex, deg(L.vertex), true);
        break;
      case 'supplementary':
        this.drawAngle(ctx, c, L.reference, `${L.degrees}°`);
        this.drawAngle(ctx, c, L.vertex, deg(L.vertex), true);
        break;
      case 'diagonals':
        this.drawDiagonals(ctx, c, true);
        break;
      default: {
        // the whole parallelogram: every side's length (the check is that opposite sides match)
        const mine = ['AB', 'BC', 'CD', 'AD'].filter((name) => name.includes(L.corner));
        for (const name of ['AB', 'BC', 'CD', 'AD']) this.drawLength(ctx, c, name, m(name), mine.includes(name));
      }
    }
  }

  // A side's label sits just outside its midpoint (as the lesson's lengths do), clear of the mesh; on a side the
  // moving corner pulls, it sits a little toward the fixed end, clear of the knob.
  // (square off the side, out of the frame, as far as the label's own size needs: a long label beside a steep side
  // stands off further than one along a level side. Where something takes that spot - the sling above AB always does,
  // the crane often does beside AD - it sits just inside the side at the same place instead: alt, and never further
  // from its side than `near` allows)
  drawLength(ctx, c, name, value, live = false) {
    const [i, j] = side(name);
    const mid = lerp(c[i], c[j], this.clearOfKnob(i, j));
    const centre = midpoint(midpoint(c[0], c[1]), midpoint(c[2], c[3]));
    const u = normalize(sub(c[j], c[i]));
    let n = { x: -u.y, y: u.x };
    if (dot(n, sub(mid, centre)) < 0) n = times(n, -1);
    const string = `${name} = ${value}`, px = 24, k = this.wordScale; // (one size, set or given: nothing jumps when the net is right)
    const off = 12 * k + reach(labelHalf(string, px, k), n), at = add(mid, times(n, off));
    // (always outside its side: where the middle is taken - the ring over AB, the crane beside AD - it slides along the
    // side, still outside: along)
    this.text(ctx, string, at.x, at.y, px, live ? '#ffd84a' : '#fff', live,
      { along: [0.3, 0.7, 0.2, 0.8].map((t) => add(lerp(c[i], c[j], t), times(n, off))), near: { a: c[i], b: c[j], gap: 24 * k } });
  }

  // Parallel marks as the lesson draws them: orange chevrons on a white halo at the middle of each side of the pair
  // (one on one pair, two on the other), bright green once the pair is found (lit).
  drawTicks(ctx, c, sides, lit, count) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const k = this.textScale;
    // (every mark points the way its side's name is said, as the lesson marks them: A->B, B->C, C->D and A->D - AD,
    // never DA - so AD's and BC's point the same way)
    for (const name of sides) {
      const [i, j] = side(name);
      const [p, q] = [i, j].sort((x, y) => x - y);
      const u = normalize(sub(c[q], c[p]));
      const mid = midpoint(c[i], c[j]);
      for (let pass = 0; pass < 2; pass += 1) {
        ctx.lineWidth = (pass ? 3.4 : 7.5) * k;
        ctx.strokeStyle = pass ? (lit ? GLOW : CHEV) : 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        for (let n = 0; n < count; n += 1) {
          const o = (n - (count - 1) / 2) * 13 * k;
          const px = mid.x + u.x * o;
          const py = mid.y + u.y * o;
          ctx.moveTo(px - u.x * 9 * k - u.y * 9 * k, py - u.y * 9 * k + u.x * 9 * k);
          ctx.lineTo(px + u.x * 6 * k, py + u.y * 6 * k);
          ctx.lineTo(px - u.x * 9 * k + u.y * 9 * k, py - u.y * 9 * k - u.x * 9 * k);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Where along side i-j its label sits: the middle, or toward the fixed end when the moving
  // corner is one end of it.
  clearOfKnob(i, j) { return 0.5; } // (a length sits at the middle of its side, always: it never slides as the corner moves)

  // An angle as the lesson draws it: a wedge filled in the corner's own colour, rimmed in white, and its degrees just
  // beyond it along the bisector, in that colour (gold while the child sets it).
  // An angle's wedge: its corner, where its arc starts and how far it sweeps (the interior angle, never the reflex one).
  wedge(c, letter) {
    const i = corner(letter), v = c[i];
    const a1 = Math.atan2(c[(i + 3) % 4].y - v.y, c[(i + 3) % 4].x - v.x);
    const a2 = Math.atan2(c[(i + 1) % 4].y - v.y, c[(i + 1) % 4].x - v.x);
    return { v, a1, sweep: Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)), radius: 44 * this.textScale };
  }

  drawAngle(ctx, c, letter, value, live = false, fill = null) {
    const { v, a1, sweep, radius } = this.wedge(c, letter);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    ctx.arc(v.x, v.y, radius, a1, a1 + sweep, sweep < 0);
    ctx.closePath();
    ctx.fillStyle = fill || ANG[letter];
    ctx.globalAlpha *= 0.92;
    ctx.fill();
    ctx.globalAlpha /= 0.92;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    ctx.restore();
    // the value just past the arc, on its bisector, as far out as its own size needs
    const mid = a1 + sweep / 2, dir = { x: Math.cos(mid), y: Math.sin(mid) }, px = live ? 28 : 24;
    const w = this.wordScale, out = radius + 10 * w + reach(labelHalf(value, px, w), dir);
    this.text(ctx, value, v.x + dir.x * out, v.y + dir.y * out, px, live ? '#ffd84a' : ANG_TXT[letter], live,
      { inside: true, near: { a: v, b: v, gap: radius + 34 * w }, alt: { x: v.x - dir.x * (10 * w + reach(labelHalf(value, px, w), dir)), y: v.y - dir.y * (10 * w + reach(labelHalf(value, px, w), dir)), inside: false } });
  }

  // The diagonals as thin ropes, the point O where they cross, and the four halves measured.
  drawDiagonals(ctx, c, labels) {
    const [a, b, cc, d] = c;
    const o = intersection(a, cc, b, d) || midpoint(a, cc);
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#4a2c0f';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(cc.x, cc.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#e2b85c';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, 9, 0, TAU);
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#4a2c0f';
    ctx.stroke();
    ctx.restore();
    const k = this.wordScale;
    // O sits right by the crossing, in the widest of the four angles the diagonals make there (the roomiest), just
    // clear of both diagonals and the dot, and stays put there while the halves' labels find their places
    const hO = labelHalf('O', 22, k), rays = [a, b, cc, d].map((q) => normalize(sub(q, o))), obstacles = this.labelObstacles(c);
    // (it keeps the angle it is in until another is clearly roomier, so it never hops between two as the raft bobs)
    const wedges = [];
    for (let i = 0; i < 4; i += 1) {
      const u1 = rays[i], u2 = rays[(i + 1) % 4], bis = normalize(add(u1, u2));
      if (!Number.isFinite(bis.x)) continue;
      const sin = Math.abs(u1.x * bis.y - u1.y * bis.x);
      const clear = (u) => (reach(hO, { x: -u.y, y: u.x }) + 5 * k) / Math.max(sin, 0.05);
      let t = Math.max(clear(u1), clear(u2), 12 + reach(hO, bis) + 3 * k);
      const stop = t + 60 * k;
      const blocked = (q) => obstacles.some((b) => Math.min(q.x + hO.w, b.x1) > Math.max(q.x - hO.w, b.x0) && Math.min(q.y + hO.h, b.y1) > Math.max(q.y - hO.h, b.y0));
      while (t < stop && blocked(add(o, times(bis, t)))) t += 2 * k;
      if (t < stop && insideConvex(add(o, times(bis, t)), c)) wedges.push({ i, t, at: add(o, times(bis, t)) });
    }
    wedges.sort((p, q) => p.t - q.t);
    let best = wedges[0];
    const kept = wedges.find((w) => w.i === this.oWedge);
    if (kept && best && kept.t <= best.t * 1.25) best = kept;
    if (best) this.oWedge = best.i;
    const next = wedges.find((w) => w !== best);
    const atO = best ? best.at : { x: o.x, y: o.y + 24 * k };
    // (it starts in that angle, the next roomiest its alternative, and keeps right by the crossing: a half's label that
    // needs the room there - in a thin triangle - may have it, and O moves round to another angle)
    this.text(ctx, 'O', atO.x, atO.y, 22, '#123b63', false,
      { inside: true, letter: true, yields: true, near: { a: o, b: o, gap: 16 * k }, alt: next ? { ...next.at, inside: true } : undefined });
    if (!labels) return;
    const h = this.halvesShown();
    // each half's label sits beside its middle (toward O on the moving corner's half, clear of the knob), each in a
    // triangle of its own of the four the diagonals cut the net into: AO in the top one, BO the right, OC the bottom
    // and OD the left, so no two crowd one triangle
    const put = (from, to, name, value, sign, along = 0.5) => {
      const mid = lerp(from, to, along);
      const u = normalize(sub(to, from)), n = { x: -u.y * sign, y: u.x * sign };
      const string = `${name} ${cm(value)} ${T('unitCm')}`, off = 8 * k + reach(labelHalf(string, 20, k), n);
      // (the half's other side, in the next triangle, if its own has no room: alt)
      const end = from === o ? to : from, out = normalize(sub(end, o)), last = add(end, times(out, 34 * k + reach(labelHalf(string, 20, k), out)));
      this.text(ctx, string, mid.x + n.x * off, mid.y + n.y * off, 20, '#ffd84a', true,
        { inside: true, alt: { x: mid.x - n.x * off, y: mid.y - n.y * off, inside: true }, near: { a: from, b: to, gap: 26 * k }, last: { ...last, inside: false } });
    };
    const toward = (end) => (end === this.movable && !this.locked ? 0.38 : 0.5);
    put(a, o, 'AO', h.AO, -1, 1 - toward(0));
    put(o, cc, 'OC', h.OC, 1, toward(2));
    put(b, o, 'BO', h.BO, -1, 1 - toward(1));
    put(o, d, 'OD', h.OD, 1, toward(3));
  }

  // The property highlight: sides, angles or diagonal halves light up, one step at a time.
  // A hint's ghost: a faint knob, a little way along the corner's track (no dashed sides drawn to it - as the lesson's
  // hint) - so the child sees the move while the real corner stays where it is
  drawGhost(ctx, c) {
    const g = this.ghost, k = this.textScale;
    ctx.save();
    ctx.globalAlpha *= 0.8 * (g.alpha == null ? 1 : g.alpha);
    ctx.beginPath();
    ctx.arc(g.x, g.y, 16 * k, 0, TAU);
    ctx.fillStyle = 'rgba(255, 210, 63, 0.5)';
    ctx.fill();
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }

  drawGlow(ctx, c) {
    this.drawLit(ctx, c, this.glow, GLOW);
  }

  // A wrong net's parts that don't match, pulsing red the same way.
  drawMiss(ctx, c) {
    this.drawLit(ctx, c, this.miss, MISS);
  }

  drawLit(ctx, c, g, colour) {
    const index = Math.min(g.steps.length - 1, Math.floor(g.t / g.each));
    const local = (g.t - index * g.each) / g.each;
    const step = g.steps[index];
    ctx.save();
    ctx.globalAlpha *= Math.sin(local * Math.PI) * 0.9;
    if (step.sides) {
      ctx.lineWidth = 22;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      for (const name of step.sides) {
        const [i, j] = side(name);
        ctx.moveTo(c[i].x, c[i].y);
        ctx.lineTo(c[j].x, c[j].y);
      }
      ctx.stroke();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    if (step.angles) {
      for (const letter of step.angles) {
        this.drawAngle(ctx, c, letter, `${this.degreesShown(letter)}°`, false, colour);
        // ...ringed in the same colour, so it reads over any wedge's own
        const { v, a1, sweep, radius } = this.wedge(c, letter);
        ctx.beginPath();
        ctx.arc(v.x, v.y, radius + 7, a1, a1 + sweep, sweep < 0);
        ctx.lineWidth = 9;
        ctx.strokeStyle = colour;
        ctx.stroke();
      }
    }
    if (step.halves || step.diagonals) {
      const [a, b, cc, d] = c;
      const o = intersection(a, cc, b, d) || midpoint(a, cc);
      ctx.lineWidth = 14;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      if (step.halves !== 'BD') { ctx.moveTo(a.x, a.y); ctx.lineTo(cc.x, cc.y); }
      if (step.halves !== 'AC') { ctx.moveTo(b.x, b.y); ctx.lineTo(d.x, d.y); }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x, o.y, 16, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      if (step.halves) this.drawDiagonals(ctx, c, true);
    }
    ctx.restore();
  }

  // Fixed corners are brass eyelets, plain to see but still; the one that moves is a big
  // bright knob.
  drawCorners(ctx, c, wet) {
    c.forEach((point, i) => {
      const handle = i === this.movable && !this.locked;
      const p = handle && this.wobble ? { x: point.x + Math.sin(this.time * 45) * 3 * this.wobble, y: point.y } : point;
      if (handle) {
        this.drawHandle(ctx, p);
        return;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, TAU);
      ctx.fillStyle = wet ? '#b9a470' : '#f4c76b';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#4a2c0f';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, TAU);
      ctx.fillStyle = '#4a2c0f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, Math.PI * 1.1, Math.PI * 1.6);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
    });
  }

  // The one corner that moves: a big knob that pulses, a dot swelling and settling in a soft glow (no rings). It
  // looks the same wherever it is, so it never gives away its place.
  drawHandle(ctx, p) {
    const pulse = this.reduced ? 0.5 : (Math.sin(this.time * 3.2) + 1) / 2;
    const r = 17 + pulse * 6;
    const halo = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r + 18);
    halo.addColorStop(0, `rgba(255, 214, 90, ${0.45 + pulse * 0.2})`);
    halo.addColorStop(1, 'rgba(255, 214, 90, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 18, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#4a2c0f';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.3, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  }

  // The corner letters, as the lesson writes them: bold navy on a white halo, just outside each corner (the top ones
  // out toward the sky, the bottom ones below their weights; the knob's across its track, off the arrows' way).
  // Where each corner letter sits (stage points): just outside its corner, the top ones out toward the sky, the bottom
  // ones below their weights, the knob's across its track, off the arrows' way.
  letterPoints(c) {
    const centre = midpoint(midpoint(c[0], c[1]), midpoint(c[2], c[3]));
    const k = this.wordScale;
    return c.map((p, i) => {
      const out = normalize(sub(p, centre));
      let dir = normalize({ x: out.x * 0.45, y: i >= 2 ? 1 : -1 }), gap = 30 * k;
      if (i === this.movable && !this.locked && this.along) { // across the track, away from the net
        const t = this.along.dir, side = { x: -t.y, y: t.x };
        dir = side.x * out.x + side.y * out.y >= 0 ? side : { x: -side.x, y: -side.y };
        gap = 50 * Math.max(k, this.textScale); // (clear of the knob, which keeps its own size)
      }
      return add(p, times(dir, gap));
    });
  }

  drawLabels(ctx, c) {
    const k = this.wordScale;
    const points = this.letterPoints(c);
    ctx.save();
    ctx.font = FONT(26 * k);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    c.forEach((p, i) => {
      const at = points[i];
      ctx.lineWidth = 6 * k;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeText(CORNERS[i], at.x, at.y + k);
      ctx.fillStyle = '#123b63';
      ctx.fillText(CORNERS[i], at.x, at.y + k);
    });
    ctx.restore();
  }

  // Readable on any background: white (or coloured) text with a dark edge. Live values swell
  // a little while a hint is on.
  // opts.inside: a label that belongs on the net (an angle's value, a diagonal's half, O), kept inside its frame where
  // there's room; opts.pinned: one that stays just where it is put (O by the crossing), the others making way;
  // opts.letter: a point's name (O), drawn as the corner letters are; opts.near: { a, b, gap } - the part it names (a
  // side, a half, a corner), which it keeps within `gap` of; opts.last: where it goes when no spot near that part is
  // free (a half's: just outside the net by its own corner). Readable on any background: white (or coloured) text
  // with a dark edge, no panel behind it; live values swell a little while a hint is on.
  text(ctx, string, x, y, px, colour, live = false, opts = {}) {
    if (this.labelQueue) {
      this.labelQueue.push({ string, x, y, px, colour, live, inside: !!opts.inside, pinned: !!opts.pinned, alt: opts.alt, along: opts.along, letter: !!opts.letter, near: opts.near, last: opts.last, yields: !!opts.yields });
      return;
    }
    const swell = (live && this.hintPulse > 0 && !this.reduced ? 1 + 0.15 * Math.abs(Math.sin(this.time * 8)) : 1) * this.wordScale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(swell, swell);
    ctx.font = FONT(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (opts.letter) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeText(string, 0, 1);
      ctx.fillStyle = '#123b63';
      ctx.fillText(string, 0, 1);
    } else {
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.strokeText(string, 0, 0);
      ctx.fillStyle = colour;
      ctx.fillText(string, 0, 0);
    }
    ctx.restore();
  }
}

Object.assign(PopoGame, { Net });
})(window.PopoGame = window.PopoGame || {});
