(function (PopoGame) {
'use strict';
if (window.Journey && window.Journey.leaving) return; // opened on its own: on the way to the journey (index.html at the root)
const journey = window.Journey && window.Journey.embedded ? window.Journey : null;
const { loadCoreAssets, AudioEngine, Game, Stage, state, PHASE, UI } = PopoGame;

const stage = new Stage(document.getElementById('stage'), document.getElementById('world'));
const ui = new UI();
const audio = new AudioEngine();
const game = new Game({ stage, ui, audio });

ui.on('play', () => game.pressPlay());
ui.on('playHover', (on) => game.onPlayHover(on));
ui.on('playPress', () => game.onPlayPress());
ui.on('dragStart', (point) => game.onDragStart(point));
ui.on('dragMove', (point) => game.onDragMove(point));
ui.on('dragEnd', () => game.onDragEnd());
ui.on('nudge', (dx, dy) => game.onNudge(dx, dy));
ui.on('step', (steps) => game.onStep(steps));
ui.on('drop', () => game.onDrop());
ui.on('action', () => game.onAction()); // the nets' Check / Catch / Try again
ui.on('again', () => { audio.play('ui'); game.playAgain(); });
document.getElementById('stage').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .hud, .overlay')) return;
  if (game.skipDialogue()) return;
  game.onWaterTap(stage.toStage(e.clientX, e.clientY));
});
ui.on('pause', () => { audio.play('ui'); game.togglePause(); });
ui.on('resume', () => { audio.play('ui'); game.togglePause(); });
ui.on('restart', () => { audio.play('ui'); game.restart(); });
ui.on('sound', () => { game.toggleSound(); audio.play('ui'); });

try {
  if (localStorage.getItem('popo-muted') === '1') {
    state.muted = true;
    audio.setMuted(true);
    ui.setSound(true);
  }
} catch (e) { /* storage may be unavailable */ }

window.addEventListener('pagehide', (event) => { if (!event.persisted) game.dispose(); });
window.addEventListener('resize', () => game.resize());
window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 150));
// Browsers (Brave and Safari especially) can suspend audio when the tab loses focus or the
// device sleeps; the next tap or key press brings it back.
const wakeAudio = () => { if (!state.paused && !document.hidden) audio.resume(); };
for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, wakeAudio, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend();
  else if (!state.paused) audio.resume();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.phase !== PHASE.TITLE) game.togglePause();
});
game.resize();

const params = new URLSearchParams(location.search);
if (params.has('debug') || params.get('dev') === '1') {
  window.popoDebug = { state, game };
}

// In the journey (index.html at the root; shell/bridge.js) this banner is the front page. Its Play tells the shell
// (Game.handOver), and the shell's word takes the game on: story (on as Play goes; args.lesson: the lesson follows the
// hook, sequences.js hook; args.afterLesson: ?start=lesson's lesson is over), quiet (the lesson is dissolving
// in over it: its sound fades), backdrop (the lesson plays over the lake: silent, buttons away, still drawing),
// camera (the lesson's camera over the lake), hide (covered), resume (the lesson is over: the giant wave brings Popo back, and on
// with the nets), title (the banner again, after Play Again), wake (a ?dev=1 jump: drawing again).
if (journey) {
  journey.onCommand((name, args) => {
    if (name === 'quiet') audio.fadeOut();
    else if (name === 'hide') game.hide();
    else if (name === 'backdrop') game.backdrop();
    else if (name === 'camera') game.setCamera(args || {});
    else if (name === 'story') game.story(args);
    else if (name === 'resume') game.goOn();
    else if (name === 'title') game.backToTitle();
    else if (name === 'wake') game.wake();
  });
  journey.onDispose(() => { game.dispose(); audio.hold(true); });
}

ui.setLoading(T('loading'));
Promise.all([loadCoreAssets(journey ? (k) => journey.progress(k) : undefined), audio.prepareVoices(PopoGame.VOICE_DATA)])
  .then(() => {
    ui.setLoading('');
    audio.fetchLaterVoices(); // the clips kept as files (the hook's, the lesson's): fetched behind the banner, ready by Play
    game.popo.rowTint(); // decode the paddling frames now, not on the first stroke
    game.showIdleScene();
    if (journey) journey.ready();
  })
  .catch((err) => {
    ui.setLoading(T('loadArtFailed', { error: err.message }));
    if (journey) journey.failed(err.message);
  });
})(window.PopoGame = window.PopoGame || {});
