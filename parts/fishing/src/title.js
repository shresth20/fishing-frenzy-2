(function (PopoGame) {
'use strict';
const { assets, ease, Effects, state, PHASE } = PopoGame;

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const span = (x, a, b) => clamp((x - a) / (b - a));

// The banner, played out on the lake itself. Popo zooms in from the left on his raft
// (sequences' banner); as he settles the logo (the painted "Fishing Frenzy 2", asset/
// fishing-frenzy-2-logo.png, built by tools/build-assets.py) pops into the sky with a sparkle and
// a fanfare, and bobs there (a tap wobbles it). Last, the Play button bobs up out of the water.
const LOGO = { x: 1205, y: 290, scale: 0.53 };
const PLAY = { x: 836, y: 772, r: 104 };

const POP = 0.45;      // the logo popping in
const PLAY_RISE = 0.6;
const LEAVE = 0.9;     // the title clearing away after Play

class TitleScreen {
  constructor(game) {
    this.game = game;
    this.fx = new Effects(); // sparkles in front of everything
    this.begun = false;
    this.clear();
  }

  clear() {
    this.t = 0;
    this.logoAt = null;
    this.playAt = null;
    this.leaveAt = null;
    this.hidden = false;
    this.jolts = [];          // the logo's wobbles: when
    this.button = { hover: 0, hoverTarget: 0, press: 0, burst: 0 };
    this.armPlay(false);
  }

  get reduced() { return this.game.fx.reduced; }

  // On screen: the title, and its logo and button clearing away after Play.
  get visible() {
    if (this.hidden) return false;
    return state.phase === PHASE.TITLE || (this.leaveAt !== null && this.t - this.leaveAt < LEAVE);
  }

  // The first frames: the lake, and the banner played out on it straight away. Browsers only let
  // a page make sound after a tap, so its music and sounds come in with the first tap anywhere
  // (the context is resumed then, see main.js); until then they're skipped, not saved up.
  begin() {
    if (this.begun) return;
    this.begun = true;
    this.armPlay(false); // until its button is up (loading enables it)
    this.game.reset();
    this.go();
  }

  go() {
    const { audio } = this.game;
    this.game.popo.travelShift = -620; // out of sight, to the left, until he rows in
    audio.init();
    audio.resume();
    audio.startMusic();
    PopoGame.banner(this.game);
  }

  // The dev panel's Title button: the banner again from the start.
  replay() {
    this.clear();
    this.begun = true;
    this.game.reset();
    this.game.ui.showStart();
    this.go();
  }

  // The dev panel's jumps leave the title at once.
  dismiss() {
    this.hidden = true;
    this.armPlay(false);
  }

  armPlay(on) {
    this.armed = on;
    const el = this.game.ui && this.game.ui.el.play;
    if (el) el.disabled = !on;
  }

  // The logo pops in (the banner calls this as Popo settles): a sparkle round it and a fanfare.
  showLogo() {
    if (this.logoAt !== null) return;
    this.logoAt = this.reduced ? this.t - POP : this.t;
    this.fx.sparkle(LOGO.x - 220, LOGO.y - 60, 12);
    this.fx.sparkle(LOGO.x + 220, LOGO.y - 40, 12);
    this.fx.sparkle(LOGO.x, LOGO.y + 80, 10);
    this.game.audio.play('poof');
    this.game.audio.play('fanfare');
  }

  showPlay() {
    this.playAt = this.t;
  }

  // The logo's middle and size this moment: popping in, a bob, and a squash when tapped.
  logoPose() {
    const t = this.t;
    const a = t - this.logoAt;
    let s = this.reduced ? 1 : ease.outBack(span(a, 0, POP));
    let sx = 1;
    let sy = 1;
    for (const at of this.jolts) {
      const d = t - at;
      if (d < 0 || d > 1) continue;
      const k = 0.05 * Math.exp(-6 * d) * Math.cos(18 * d);
      sx += k;
      sy -= k;
    }
    let y = LOGO.y + (this.reduced ? 0 : Math.sin(t * 1.3) * 4 * span(a, POP, POP + 0.8));
    let rot = 0;
    if (this.leaveAt !== null) {
      const u = span(t - this.leaveAt, 0.05, 0.45);
      s *= u < 0.3 ? 1 + 0.12 * (u / 0.3) : 1.12 * (1 - (u - 0.3) / 0.7) ** 2;
      y -= 60 * u;
      rot = -0.12 * u;
    }
    return { x: LOGO.x, y, s: s * LOGO.scale, sx, sy, rot };
  }

  // Play: the button bursts and the logo pops away.
  leave() {
    if (this.leaveAt !== null) return;
    this.leaveAt = this.t;
    this.armPlay(false);
    const b = this.button;
    b.burst = 0.001;
    b.press = 1;
    const fx = this.game.fx;
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU;
      fx.puff(PLAY.x + Math.cos(a) * PLAY.r, PLAY.y + Math.sin(a) * PLAY.r * 0.8, Math.cos(a), 2, true);
    }
    fx.sparkle(PLAY.x, PLAY.y - PLAY.r * 0.4, 14);
    this.game.audio.play('cheer');
    this.game.audio.play('whoosh');
  }

  // --- life ------------------------------------------------------------------------------
  update(dt) {
    if (!this.visible) return;
    const prev = this.t;
    this.t += dt;
    const t = this.t;
    const crossed = (at) => at !== null && prev < at && t >= at;
    this.fx.update(dt);
    const b = this.button;
    b.hover += (b.hoverTarget - b.hover) * Math.min(1, dt * 10);
    b.press = Math.max(0, b.press - dt * 4);
    if (b.burst > 0) b.burst += dt;
    const game = this.game;
    const { audio } = game;
    if (this.playAt !== null) {
      if (crossed(this.playAt + 0.35)) {
        for (let i = 0; i < 8; i += 1) {
          const ang = (i / 8) * TAU;
          game.fx.puff(PLAY.x + Math.cos(ang) * PLAY.r, PLAY.y + Math.sin(ang) * PLAY.r * 0.8, Math.cos(ang), 1, true);
        }
        audio.play('bloop');
      }
      if (crossed(this.playAt + 0.5) && this.leaveAt === null) {
        this.fx.sparkle(PLAY.x, PLAY.y - PLAY.r * 0.6, 10);
        this.armPlay(true);
      }
    }
  }

  // --- taps ------------------------------------------------------------------------------
  // The logo wobbles; the sky twinkles. Taps in the water are the game's own (fish come to look).
  // Returns whether the tap was the title's.
  tap(point) {
    const { audio } = this.game;
    audio.init();
    audio.resume();
    if (this.leaveAt !== null) return true;
    if (this.logoAt !== null && assets.logo) {
      const p = this.logoPose();
      const w = assets.logo.width * p.s;
      const h = assets.logo.height * p.s;
      if (Math.abs(point.x - p.x) < w / 2 && Math.abs(point.y - p.y) < h / 2) {
        if (!this.jolts.length || this.t - this.jolts[this.jolts.length - 1] > 0.4) {
          this.jolts.push(this.t);
          audio.play('wobble');
        }
        return true;
      }
    }
    if (point.y >= this.game.waterline) return false;
    this.fx.sparkle(point.x, point.y, 8);
    audio.play('word');
    return true;
  }

  hover(on) {
    if (this.leaveAt !== null) return;
    this.button.hoverTarget = on ? 1 : 0;
    if (on && this.armed) this.game.audio.play('bloop');
  }

  press() {
    this.button.press = 1;
  }

  // --- drawing ---------------------------------------------------------------------------
  draw(ctx) {
    this.drawPlayButton(ctx);
    if (this.logoAt !== null) this.drawLogo(ctx);
    this.fx.drawFront(ctx);
  }

  drawLogo(ctx) {
    const img = assets.logo;
    if (!img) return;
    const p = this.logoPose();
    if (p.s <= 0.01) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(p.s * p.sx, p.s * p.sy);
    ctx.drawImage(this.shine(img), -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  // Every few seconds a band of light sweeps across the logo (drawn into a copy of it, so the
  // light stays on the logo).
  shine(img) {
    const t = this.t - (this.logoAt ?? 0);
    const k = ((t - 1.2) % 4.5) / 1.1;
    if (this.reduced || t < 1.2 || k > 1) return img;
    if (!this.shineCanvas) {
      this.shineCanvas = document.createElement('canvas');
      this.shineCanvas.width = img.width;
      this.shineCanvas.height = img.height;
    }
    const c = this.shineCanvas;
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const x = -200 + k * (img.width + 400);
    const band = g.createLinearGradient(x - 90, 0, x + 90, img.height * 0.4);
    band.addColorStop(0, 'rgba(255, 255, 255, 0)');
    band.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    band.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = band;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // The play button bobs up out of the depths and floats in the water: a gentle bob and sway, a
  // breathing warm glow, a shine sweeping across now and then, a grow on hover and a squash when
  // pressed. Its invisible hit area (#btn-play) follows it.
  drawPlayButton(ctx) {
    const img = assets.play;
    const ui = this.game.ui;
    if (!img || this.playAt === null) { ui.placePlay(PLAY.x, PLAY.y, 0); return; }
    const b = this.button;
    const t = this.t;
    const rise = this.reduced ? 1 : span(t - this.playAt, 0, PLAY_RISE);
    const gone = this.leaveAt === null ? 0 : span(t - this.leaveAt, 0.25, 0.6);
    if (gone >= 1) { ui.placePlay(PLAY.x, PLAY.y, 0); return; }
    const { x, r } = PLAY;
    const still = this.reduced;
    const bob = still ? 0 : Math.sin(t * 1.6) * 7;
    const sway = still ? 0 : Math.sin(t * 1.1) * 0.035;
    const breathe = still ? 1 : 1 + Math.sin(t * 2.4) * 0.025;
    const squash = 1 - b.press * 0.12;
    const pop = b.burst > 0 ? 1 + Math.sin(Math.min(1, b.burst / 0.35) * Math.PI) * 0.18 : 1;
    const s = breathe * (1 + b.hover * 0.07) * pop * (1 - gone);
    const cy = PLAY.y + bob + (1 - ease.outBack(rise)) * 300;
    ui.placePlay(x, cy, r * s);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, cy, r * 0.6, x, cy, r * 1.9);
    glow.addColorStop(0, `rgba(255, 210, 110, ${(0.42 + 0.16 * Math.sin(t * 2.4) + b.hover * 0.15) * rise * (1 - gone)})`);
    glow.addColorStop(1, 'rgba(255, 210, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, cy);
    ctx.rotate(sway);
    ctx.scale(s * (1 + b.press * 0.06), s * squash);
    const w = img.width * (r * 2 / img.height);
    ctx.drawImage(img, -w / 2, -r, w, r * 2);
    const sweep = (t % 3.4) / 1.1;
    if (sweep < 1 && !still) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.93, 0, TAU);
      ctx.clip();
      const sx = -r * 1.6 + sweep * r * 3.2;
      const band = ctx.createLinearGradient(sx - r * 0.35, -r, sx + r * 0.35, r);
      band.addColorStop(0, 'rgba(255, 255, 255, 0)');
      band.addColorStop(0.5, 'rgba(255, 255, 255, 0.38)');
      band.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = band;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();
  }
}

Object.assign(PopoGame, { TitleScreen });
})(window.PopoGame = window.PopoGame || {});
