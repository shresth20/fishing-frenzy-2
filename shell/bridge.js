// =====================================================================
// JOURNEY BRIDGE - loaded first by every part (parts/*/index.html), so the part can run inside the
// journey's shell (index.html at the root), which plays the parts in order (shell/journey.js).
//
//   Journey.embedded        true inside the shell
//   Journey.ready()         the part has loaded and can begin at once
//   Journey.progress(k)     how much of it has loaded (0 to 1), for the shell's loading bar
//   Journey.failed(msg)     it could not load
//   Journey.play()          the fishing game's banner is the journey's front page: its Play was tapped (call it inside
//                           the tap: it unlocks the shell's sound), so the lesson begins
//   Journey.finish(detail)  the part is over (call it inside the tap that ends it, where there is one)
//   Journey.onBegin(fn)     the shell starts the part (the player has already tapped Play); fn(opts)
//   Journey.onDispose(fn)   the shell is about to remove the part: stop every sound and loop
//   Journey.onCommand(fn)   the shell's word while the part is loaded: fn(name, args)
//   Journey.devScreens(l)   with ?dev=1: the part's screens, [{ label, run }], for the journey's one jump panel
//   Journey.camera(view)    the lesson's camera ({ zoom, pan }), passed on to the game whose lake it plays over
//
// Sound: the Play tap unlocks one AudioContext and one <audio> in the shell's own document, and the parts play through
// those (audioContext, audioOut, voiceElement), so the lesson needs no tap of its own before it can be heard. Opened
// from disk (file://) the shell's document can't be reached; a part then uses its own and the flow runs on messages.
// Opened on its own, a part goes to the journey, which then starts with it (?start=<part>); with ?solo it stays on its
// own page, outside the journey.
// =====================================================================
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var me = document.currentScript;
  var part = (me && me.getAttribute('data-part')) || params.get('part') || '';
  var inFrame = window.parent !== window;
  var host = null;
  try { if (inFrame && window.parent.FishingFrenzy) host = window.parent.FishingFrenzy; } catch (e) { host = null; }
  var embedded = inFrame && (!!host || params.has('embed'));

  // ?solo: the part on its own page, outside the journey (for testing it alone)
  if (!embedded && params.has('solo')) { window.Journey = { embedded: false }; return; }
  if (!embedded) {
    var shell = new URL('../../index.html', location.href);
    shell.searchParams.set('start', part);
    ['dev', 'debug'].forEach(function (k) { if (params.has(k)) shell.searchParams.set(k, params.get(k) || '1'); });
    ['lan', 'lang'].forEach(function (k) { if (params.get(k)) shell.searchParams.set(k, params.get(k)); }); // (the player's language)
    window.Journey = { embedded: false, leaving: true }; // the part's own start-up checks this and stays idle
    location.replace(shell.href);
    return;
  }

  var handlers = { begin: [], dispose: [], command: [] };
  var begun = false;
  var beginOpts = null;
  var disposed = false;
  function run(kind, opts) {
    var list = handlers[kind].splice(0);
    for (var i = 0; i < list.length; i++) {
      try { list[i](opts); } catch (err) { console.error(err); }
    }
  }
  function send(type, detail) {
    if (host && host.fromPart) { host.fromPart(part, type, detail, window); return; }
    window.parent.postMessage({ journey: true, part: part, type: type, detail: detail }, '*');
  }
  function begin(opts) { if (begun || disposed) return; begun = true; beginOpts = opts || {}; run('begin', beginOpts); }
  var devList = [];
  function command(o) {
    if (disposed) return;
    if (o && o.name === 'devJump') { var jump = devList[o.args]; if (jump) { try { jump.run(); } catch (err) { console.error(err); } } return; }
    for (var i = 0; i < handlers.command.length; i++) {
      try { handlers.command[i](o && o.name, o && o.args); } catch (err) { console.error(err); }
    }
  }
  function dispose() { if (disposed) return; disposed = true; handlers.begin = []; run('dispose'); }
  // the shell's messages, for when its document can't be reached (file://)
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.journey !== true || e.source !== window.parent) return;
    if (m.type === 'begin') begin(m.opts);
    else if (m.type === 'dispose') dispose();
    else if (m.type === 'command') command(m.opts);
  });
  var audio = function () { return host && host.audio ? host.audio : null; };

  window.Journey = {
    embedded: true,
    part: part,
    params: params,
    get begun() { return begun; },
    ready: function () { send('ready'); },
    progress: function (k) { send('progress', k); },
    failed: function (msg) { send('failed', String(msg || '')); },
    play: function () { var a = audio(); if (a) a.unlock(); send('play'); },
    finish: function (detail) { send('finish', detail || {}); },
    camera: function (view) { send('camera', view); },
    devScreens: function (list) {
      devList = list || [];
      if (host && host.devScreens) { host.devScreens(part, devList, window); return; }
      send('devScreens', devList.map(function (s) { return s.label; }));
    },
    onBegin: function (fn) { if (begun) fn(beginOpts); else handlers.begin.push(fn); },
    onDispose: function (fn) { handlers.dispose.push(fn); },
    onCommand: function (fn) { handlers.command.push(fn); },
    // called by the shell
    _begin: begin,
    _dispose: dispose,
    _command: command,
    // the shell's unlocked sound (null if there is none: then the part uses its own)
    audioContext: function () { var a = audio(); return a ? a.context() : null; },
    audioOut: function () { var a = audio(); return a ? a.output(part) : null; },
    voiceElement: function () { var a = audio(); return a ? a.voiceElement() : null; }
  };
})();
