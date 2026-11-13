# Fishing Frenzy 2

Popo's parallelogram net: a browser game for Grade 8 about parallelograms. Popo the polar bear fishes with a net hung
from a winch on his raft. Before he lowers it, the child fixes its shape: three of its corners A, B, C, D are fixed,
and the fourth slides along a track, stop by stop, until the net has the property the level asks for - as the drag
net comes down the view zooms in on it, so the corner is set on a big net, and once it is set Check comes up (a pill,
bottom right). Check sends the net slowly down while the view opens out again: a right net locks with no words - it
flashes, lights its property and its outline runs round it, every corner sparkling - and sits open in the water with Catch for the child; a wrong one first shows what is off
(the parts it compares pulse red, the corner shakes), then crumples into a tangle ("Whoopsie Doopsie!", and the hint:
what is off and which way to go, e.g. "Opposite sides are equal. Make CD longer.") and Try again winds it up, untangles it and brings it down in its starting
shape. Meanwhile three bunches of fish - three kinds, each its own count and size, each swimming its own way in its own
lane, never into each other - roam the sea, so the child presses Catch when the bunch they want swims into the net: it
closes into a bag (a potli) round them as it is hauled up, and the fish hop into the bucket; a net that closed on
nothing comes up empty ("Huh?!") and goes down again. The net carries only the task's own readings (the value given
and the one being set), nothing that clutters it or gives the answer away. It is part 2 of Fishing Frenzy and plays like part 1: a hook first (a
scripted story, nothing to press: Popo's nets tangle until a leaping fish knocks one into a parallelogram, which stays
open and makes the catch; Swiftee names the shape and "Let's find out!" carries the net's outline into the lesson);
after the lesson the wave brings Popo back, Swiftee welcomes him, and eight nets teach the parallelogram's properties
one by one, then the end screen of Fishing Frenzy: a circle closes in on Popo over a warm sunburst and closes on him,
and the catch card comes in. Only two voices are heard: Popo's, and Swiftee's for everything else.

## Run

Plain HTML, CSS and JavaScript (canvas, WebGL for the water, Web Audio; no build step and no
dependencies). The game is a part of the Fishing Frenzy 2 journey: serve the repository's root
over HTTP and open its `index.html` (opened here directly, `index.html` goes there itself, with
`?start=fishing`; `?solo` keeps it on its own page, for testing it alone):

```
python3 -m http.server 8000     # at the repository's root
# then visit http://localhost:8000/
```

Append `?debug` to expose `window.popoDebug = { state, game }`. Append `?dev=1` for screen
jumps: intro, each of the eight levels, put the current net's corner in its place, drop it, row
on, and the final screen. In the journey they are in its one panel (below); on its own page
(`?solo&dev=1`) the game has its own small panel (bottom left, with title too), where number keys
1–9 and 0 press the first ten buttons and the backtick key folds it away.

## In the journey

The repository's `index.html` (`shell/journey.js`) plays this game in a frame filling the window,
with Swiftee's parallelogram lesson (`parts/lesson`) in a second frame. The game loads
`shell/bridge.js` first (`window.Journey`); its hooks are in `src/main.js` and the `In the
journey` part of `src/game.js`:

- **Front page.** This banner is the journey's front page: the shell shows the game's frame at
  once (its "Loading…" covers the wait) and the game says how far it has loaded
  (`Journey.progress`) and when the banner is up (`Journey.ready`); the lesson then loads behind
  it, unseen.
- **Play** (`Game.handOver`): inside the tap, `Journey.play()` unlocks the shell's sound and tells
  it; the banner clears away as ever (Play bursts, the logo pops away), and
  the shell's commands (`main.js`) take it from there:
  - `story` — at once: the game goes on as Play does on its own: the hook (`hook` in
    `src/sequences.js`, its lines `STORY.hook` in `src/levels.js`). `args.lesson`: the lesson follows
    the hook; `args.afterLesson` (`?start=lesson`): the lesson came first, so the wave brings Popo in
    and the nets begin.
  - **The hook** (H1–H10), every beat scripted, nothing pressable, the HUD's buttons away: the net
    comes down in a shape that is no parallelogram (`HOOK_NETS.wrong`); in the water its corners pull
    unevenly, one after another, it twists and its mesh tangles (`tangleNet`) and hangs there a moment,
    tangled, before it comes up: three shapes in a row, each a little quicker but every step slow enough
    to follow. Then a giant fish (four times the school's) leaps in one arc out of the water, its nose meeting the
    third net's corner C just before the top: a moment's stillness as it squashes against the corner, sparks and a
    bump, and the corner slides along the hit onto B + D − A while the net swings and settles and the fish tumbles back
    with a big splash (`fishBumpsCorner`): a
    parallelogram, which stays open in the water while its edge is outlined; a scripted school of
    twelve swims into it, one fish to each place in the net (`schoolSwimsIn`), and Popo hauls up the
    catch. Swiftee swoops in and names the shape as its outline is traced (the `trace` cue), Popo
    asks what it is, and "Let's find out!". Its sound effects duck under each line
    (`AudioEngine.setDuckSfx`). In the journey Swiftee then flies off to the lesson, the HUD steps
    away, the net winds up and the giant wave carries Popo away (`waveAway`); the game tells the shell
    (`Game.lessonTime`: `Journey.finish({ intro: true, warmup: true, fish })`) and the lesson dissolves
    in over the empty lake and opens with its seashell. On the game's own page Swiftee flies off, the
    net winds up and the first parallelogram net follows.
  - `review` / `onward` — the journey's temporary Back / Next bar has been used: a finished screen (the
    hook, a caught net) holds where it ended, what follows it kept (`Game.held`); the bar's Next plays
    it (`goOnward`: the hook's wave and the lesson, a net's next), or, on the hook still playing, hands
    over to the lesson at once.
  - `quiet` — the lesson is dissolving in: every sound fades away with it (`AudioEngine.fadeOut`).
  - `hide` — the lesson covers the game: it stops drawing (its sequences wait with the clock),
    and every sound stops — music, effects, a voice line — and its own AudioContext sleeps;
    nothing (a tap, the tab coming back) wakes it until the game is shown again
    (`AudioEngine.hold`).
  - `resume` — the lesson is over: the game wakes (its music fading back in) while the lesson
    dissolves away (`Game.goOn`); the wave rolls in from the left with Popo on its crest and
    sets him down on his spot (`waveIn`), Swiftee swoops in with "Great job!" (`welcome`), and the eight parallelogram nets follow.
  - `title` — after Play Again: the end screen's circle closes and opens on the banner from its
    start (`closeCurtain(game, { title: true })`), ready for the next Play.
  - `wake` — a dev panel jump: the game draws again (with its music, if it had it) without its
    story.
- **Play Again** at the end calls `Journey.finish({ levels, fish })` inside its tap; the shell
  answers with `title` and loads a fresh lesson behind the banner.
- `?start=fishing` (the journey's) makes the first Play play the hook and all eight nets in a
  row (no lesson); `?start=lesson` brings the lesson first (the game holds where its
  banner cleared away), then the wave brings Popo in, Swiftee welcomes him and all eight nets.
- With `?dev=1` the game's jumps (all but Title: the panel's Front page is the banner) go to the
  journey's one panel through `Journey.devScreens`; the game shows no panel of its own.
- The journey shows one rotate hint for a phone held upright, so the game shows none of its own
  there.
- The game keeps its own AudioContext (its own taps unlock it: the banner is the first page the
  child taps); the lesson plays through the shell's.

## Deploy

The game is deployed as part of the journey: the repository's root is the static site.

## The game

- **Banner** (`src/title.js`, `banner` in `src/sequences.js`), played out on the lake itself:
  Popo zooms in from the left on his raft (honk, screech, boing, poof), a big fish dashes in
  under the water and leaps high where the logo will be, and at the top of its leap the
  painted "Fishing Frenzy 2" logo (`asset/fishing-frenzy-2-logo.png`) pops in with a fanfare;
  the fish drops down behind it, two little fish follow, and from behind the logo they pop
  their heads up over it (or out past the plank's end, looking at Popo), look about and duck
  down. Then the Play button bobs up out of the water. Taps: a peeking fish ducks with a
  giggle, the logo wobbles and every fish pops up to look. The music and sounds play from the
  first tap anywhere (browsers hold sound back until then; effects meanwhile are skipped, not
  saved up). Play pops the logo away, the fish leap back into the lake, and the story begins
  with Popo already in place.
- **The Master Catch.** 75 fish (`GOAL` in `src/levels.js`); the counter shows only the catch so far. The most a run
  can net is about 95, so it takes the biggest bunch each time, caught whole. The End's card shows the run's catch
  against it, counting up as a bar fills to a star: short of it, "Think you can catch more next time?"; reached, the
  star lights, "You reached the goal!", and a stream of bubbles rises from the trophy. Play Again brings new nets (`freshLevels`): the same eight lessons in the same order, but each net its
  own shape, a little wider or taller, leaning more or less, the corner starting elsewhere on its track, the final net
  turned a little differently, and the tour of the waters starting one lake on, so a second game is never the first
  again (in the journey too: the game's frame stays, so it counts the runs).
- **Flow.** Banner → Play → the hook, its schools swimming in as the narrator starts (in the
  journey: then the lesson, the wave bringing Popo back and Swiftee's welcome) → the eight nets. After each catch bright
  bubble confetti bursts out of the bag with a party toot (Fishing Frenzy's cheer, no words),
  the fish hop into the bucket and fly up to the counter (top left), and Popo winds the empty
  net up into its bundle, rows on when the next level is in new waters (levels 1–2, 3–4, 5–6
  and 7–8 are in the four locations), and lets the net down in its new shape as the next
  school swims in. After level 8, Popo's "Wow! What a
  catch!" and the end screen (`theEnd` in `src/sequences.js`, drawn on `#curtain` by
  `Game.drawCurtain`), as in Fishing Frenzy: a circle closes in on Popo and his raft over the
  live scene and glides with them to the middle, everything around it a warm, slowly turning
  sunburst, and closes on him as he laughs. Then the card pops in (`UI.showGoal`, in the HUD's look: a cream face,
  dark outline and lip): a gold trophy in turning light over its top edge, "Great Fishing, Popo!" on a ribbon, "You
  helped Popo catch…", the catch and the goal on two tiles, a jelly bar with a fish riding its tip and a star badge
  at its end, the line, and Play Again the card's width, springing in once the count is done.
  Play Again closes the circle, sets the game up afresh out of sight and opens it again on
  level 1. The page gets a `popo:complete` event (and a `postMessage` when framed).
- **Phases** (`src/state.js`): one phase at a time decides what input is allowed: title,
  intro, puzzleReady, dragging, netLowering, catching, netRaising, netBreaking,
  levelComplete, transitioning, gameComplete. Pause is a flag over the top.
- **Levels** (`src/levels.js`): the warm-up net (`type: 'free'`: the 420 × 200 frame the hook's
  nets hang from; it is not played as a level), then eight nets, each teaching one property with its own check (`type`), every prompt
  an action, short (one line, readable on a phone), the values given on the net itself (in centimetres): 1 drag
  vertex B to make BC parallel to AD, 2 drag C to make AB parallel to CD, 3 drag C to make CD equal to AB (7 cm),
  4 drag D to make the net a parallelogram (opposite sides equal) (AB 8 cm, BC 5 cm), 5 drag C to make ∠C equal to ∠A (68°), 6 drag B to make the net a parallelogram (∠A
  and ∠B add up to 180° (∠A 72°), 7 drag C to make the net a parallelogram (the diagonals bisect each other), 8 drag D to make the net a parallelogram,
  with no property named. Each says exactly what the net's check is, and every net's one right stop is a true
  parallelogram. Each level gives the solved net's width, height and lean (or the
  angle at A), the corner that moves, the side or diagonal its track runs along (`along`; a
  diagonal runs toward the opposite corner) and how many stops from its place it starts, the
  side whose length in centimetres sets the measurement scale, its fish (3, 3, 4, 4, 5, 5, 6, 7, 9;
  the sea holds three times as many, at most 22), the prompt and the two hints a wrong
  net gives (`hints`: [the part set is under, over] what it should be; `Net.missFor` reads which from the frame, so
  the hint is always true there - tests checked every wrong stop of every net, its words and its way). A net that
  gives two lengths (net 4) keeps its shape on Play Again, only its size changing, so both stay true. The final level's school is rare: golden, quicker, trailing glints.
- **Geometry** (`src/geometry.js`, `src/net.js`): plain vector helpers (parallel by the
  normalised cross product, so vertical sides are no trouble; interior angles; the diagonals'
  intersection; area and self-intersection). Corners A, B, C, D in order make a parallelogram
  exactly when A + C = B + D, so the movable corner's place follows from the other three.
  The corner never stretches freely: it slides along its track through that place and clicks
  from stop to stop (20 stage pixels apart, gliding onto each), at most 12 stops each way and
  only while the frame stays simple, roomy and clear of the raft and the water. One stop is
  its exact place, so each level's check is exact: the frame is right at that stop and only
  there, and only there do the numbers on the net match (tenths of a centimetre, whole degrees);
  `tests/geometry.py` checks every stop of every track. Nothing pulls the corner toward its
  place, and nothing completes until the child presses Check. Positions are net
  coordinates measured from the lifting ring, and the whole stage scales to the screen, so
  metres and degrees are the same everywhere and survive a resize.
- **Stage.** The world is a fixed 1672x941 logical space scaled to the viewport. The paintings
  have their waterline 41% down, so they are drawn `SCENE_SHIFT` lower (the water pass carries
  the sky on above them), putting the water at about 60% and leaving the sky to the net.
  A device that can't keep up steps down, one step each time frames run slow for a couple of seconds, for good
  (`Game.watchFrameRate`): the water pass at 60% of its size, then the drawing at no more than 1.5 and then 1 canvas
  pixel per screen pixel (`Stage.dprCap`), then the water at 42%. The water pass works out each effect only where it
  moves anything, and under the lesson the lake is drawn every other frame while the lesson's camera holds still.
- **Teaching the shape.** The net carries only what its level is about, drawn as the lesson draws it, nothing that
  clutters it: on the parallel levels the pair's orange parallel chevrons, and the other pair's lengths as the corner
  moves (AB and CD on net 1, BC and AD on net 2: that pair is parallel already, the corner sliding along one of them,
  so the two read the same at exactly the stop where the marked pair is parallel too - tests checked every stop of
  every net over many runs); on the length levels the side given and the one being set, in
  centimetres, each just outside its side; on the angle levels the angle given and the one being set, as wedges filled
  in the corners' own colours with their degrees; on the diagonals level the diagonals, O and their four halves; on the
  last net the four sides. The corner letters A–D (bold navy on a white halo) are always there, and a trail of two
  yellow chevrons tight against the knob on each open side runs the way it can still slide, as a game shows a swipe
  (a tap on a trail moves it a stop; the track itself isn't drawn; the trails reach out with the readings on a small
  screen, so their tap targets never overlap the knob). The measures are plain text with a dark edge (no panel behind them); O is a letter,
  as A to D are. The labels are laid out together so none covers another
  (`Net.placeLabels`): each starts clear of its own line by its own measured size (a side's length square off its
  side, an angle's value past its arc, a half's beside its diagonal), keeps clear of the lifting ring, the weights,
  the corner letters, the knob and its arrows, the crane, the raft and Popo (`Net.labelObstacles`), never sits across
  a drawn line - the frame's sides, the sling's legs, the lifting rope, the diagonals (`Net.labelLines`) - and stays
  inside what the view shows. The rules are the same on every net: a side's length sits at the middle of its side, just outside (AB, whose outside
  the sling always takes, just inside under its rope; any other just inside where the crane or the view's edge takes
  the outside); an angle's value inside its angle past the arc; each diagonal half's label in its own triangle beside
  the half - or, on a crowded net, just outside by its own corner; O right by the crossing (placed last, so a half
  that needs the room there has it). A label is never further from its part than its gap, nor across another line
  from it; only where nothing near is free does it take a size smaller, then the nearest free spot. The words have a
  size of their own (`Game.wordScale`): they are read through the zoom, so on a phone they grow less than the knob's
  arrows and marks do. The layout is kept until the net's shape, its words
  or the view change (and the last few dozen are remembered, so dragging back over a stop costs nothing), and the words are drawn last, over the whole scene (`Net.drawWords`), never dimmed under the
  water. The zoom keeps the net below the HUD's top row. The answer lies further from the start level by level (5 to 9
  stops). While the view is in on the net the lights go down on the scene behind it, evenly, and the net stays lit, so
  it is plainly the thing to look at.
- **The drag and Check.** As a net comes down the view zooms in on it by itself (`Game.applyFocus`, up to 1.7x, as
  the lesson's camera dives: the scene and the net's corner together, the hint hand through its own transform; the HUD
  stays), so the corner is set on a big net. The zoom (`Game.fitFocus`) fits the net, every stop of its corner, the
  crane and Popo at his wheel, whole (`Popo.box`), so he stays in view beside his net: about 1.45x to 1.7x by net
  and screen; the corner moved, Check comes up as a pill bottom
  right (`UI.setAction`). Check
  (`checkNet` in `src/sequences.js`) tests the frame: a wrong one first shows what is off, while the view is still in on it - the
  parts the level compares pulse red twice (`Net.showMiss`: the sides, or the angles ringed, or the diagonals' halves)
  and the corner shakes; a right one locks with a click and no words (the plate clears),
  flashes, lights its property and traces its outline with every corner sparkling, and either way the net goes slowly down while the view opens out again with it. A wrong net
  crumples into a tangle in the water (`Net.tangle`: its corners pull in and twist, so the mesh itself crumples; the
  fish under it dart away), Popo is baffled ("Whoopsie Doopsie!"), the hint shows and Try again comes up:
  it winds the net up, untangles it while it's bundled, and lets it down in the shape the level started with.
- **The catch.** A right net sits open in the water with Catch (`catchNow`). Three bunches of fish (`bunchesFor` in
  `src/levels.js`: never one of fewer than eight: a shoal of 8 to 16 small fish, a school of 8 to 11 middling ones,
  one of 8 or 9 big ones, each a mix of three or four kinds and of sizes) roam the sea at the depth the net reaches, a little quicker net by net (`Sea`); each
  bunch is packed into a loose, tall cloud (`Sea.pack`: an ellipse the whole band's height, no two fish touching) that
  swims as one, so it reads as a school (as a drawn shoal does) and never as a line. The three swim one way, whichever
  chance says net by net (a school already in the sea turns round together), spread evenly round a loop that reaches
  well past the sea's ends at one pace (`Sea.leads` brings each new one in to the widest free water), so they keep
  their distance, never run into each other, and each swims through the net in turn: the child presses Catch when the
  bunch they want is in it. The net gathers its mouth
  underwater, then rises as a bag with the catch in its belly, clear of the water. A net that closed on nothing comes
  up empty ("Huh?!") and goes down again for another go. A bunch the net didn't touch stays, whole, and swims on into
  the next level (rowing to new waters, it comes along); the rest of a bunch the net took part of swim off out of the
  sea and a whole new bunch comes in behind them, so there are always three whole schools and never a straggling
  few; for the golden final school every fish swims off as the golden fish swim in behind them. No fish ever vanishes or pops into view; a whole new school (the
  first, the golden one) rushes in, fast for a moment, so the sea fills at once.
- **Hints.** An instruction is said once, as its net comes down (as in Fishing Frenzy): left
  alone 3 seconds, a ghost of the corner - its two sides with it, faint and dashed - slides two stops the right way
  (never all the way to its place) with the hand riding on it, while the real corner stays where it is, and the plate
  gives a nudge - never the voice again; it comes again after each further quiet spell, at most three times a net, and
  after the first net the measurements swell with it, so the game teaches rather than solves itself; the corner set,
  the little hand sits on the middle of Check, and on a net left open in the water a while, of Catch. No hint says
  whether the net is right; Check does.
- **The catch so far.** Top left, on the narration plate's navy and gold: a fish and the number
  caught this game, bouncing as each fish lands in the bucket.
- **Voices** (`src/voice-data.js`): Popo's lines are his recordings from Fishing Frenzy; every
  other line (the narrator's, every prompt and hint) is Swiftee's studio voice - Fishing
  Frenzy's own clips, the lesson's (`../lesson/assets/vo/`, loaded by path and played from
  their first word), and the nets' own prompts and hints (`assets/voice/net-*.webm`, recorded in her studio voice). Each net's lines are worded exactly as she recorded them. For the lesson's clips the plate's
  words come at the lesson's own measure of when each word is said (`../lesson/js/vo_lines.js`, `AudioEngine.wordTimes`),
  and every voiced line's words follow the voice's playhead (`AudioEngine.voiceTime`), so they never drift from it.
- **HUD.** Narration follows the Fishing Frenzy games: the instruction (a prompt or hint)
  and the narrator's lines sit on one translucent navy plate with a faint gold rim, white
  text and the key word in gold, fitted to the words. The instruction is always one line (a
  long one shrinks to fit) and comes word by word in time with its voice: each word pops in, a
  stressed one boings, and the plate bounces as each new sentence starts. ∠ is drawn, since
  Fredoka has no angle sign. Popo's own lines are its cream speech bubble with dark ink and an orange key
  word, growing word by word with its line breaks pinned. Sound and pause are its round orange
  icon buttons. The buttons are pills in the lesson's Next look (orange, a cream rim, dark lettering, the icon inline):
  Drop Net (the warm-up's; the hook needs no button) and the nets' one action, both bottom right - Check (orange, its word alone), Catch (sea green), Try again
  (coral). Drop Net, as it was: a sunny face
  with dark-brown outline, label (about 10:1 contrast) and a lip it presses down onto, the net
  icon in a badge; it pops in and a shine sweeps it now and then.
  The pause card's buttons match it, and the end screen's Play Again is the same button.
- **The winch** (`src/winch.js`): the generated arched machine (`assets/generated/winch-arched.png`)
  drawn whole at one scale on the raft's deck, its end pulley out over the water where the
  net hangs. Popo (`assets/generated/popo-operating.png`, four poses of him turning a
  handwheel, registered on the wheel's shaft so it stays on the drum's axle) changes pose
  with the drum as rope pays out or winds in. Every rope the game draws (the lifting rope,
  the sling to the net's top corners) is one twist of the generated rope (`rope.png`) tiled
  along the line, and the net hangs from the generated brass shackle (`rope-connector.png`).
- **The net's look**: the generated net texture (`assets/generated/net.png`, rope frame,
  floats and weights) is warped onto the frame triangle by triangle, cached per shape, so it
  deforms with the puzzle and rides with the raft for free. Wound up, it is drawn gathered
  toward its sling (narrow and short) under the pulley while the drum and Popo's wheel turn;
  closing round a catch, it becomes a potli hanging plumb from the ring: its short neck gathers
  up into the ring's bottom bar (the floats along its top fold away and the sling's legs shorten
  to nothing), round shoulders fill out into the full belly with the fish inside, and
  translucent shading gives it volume (Codex's `drawBagVolume`);
  torn, a ragged hole is cut out of the mesh with frayed, dark-edged strands around it and
  bits flung out as it rips (the frame holds).
- **Fish** (`src/fish.js`): the natural cartoon fish of `asset/fish-natural-*.png`, drawn in
  vertical strips that ripple head to tail so they visibly swim. The school swims in two lanes
  across the water the lowered net reaches, a fish-height or more apart and going opposite
  ways, so no two fish ever overlap or meet head on; in a lane they go about in shoals of three
  or four, nose to tail at their own depths, with open water between, so a net timed for a
  shoal nets the lot and one dropped over open water catches little or nothing. Each fish
  eases its speed to keep its place (the `Sea`), and within a body's length of the fish ahead
  is never faster than it, so none ever touches, stops, turns back or catches up; they loop
  round just out of sight at the ends and float gently. Newcomers wait out of sight at a
  lane's start and swim in shoal by shoal when there's room. The pace rises
  level by level (about 65 to 130 pixels a second). Those under the net when it lands are
  netted and ride up in its bag.

## Layout

- `index.html`, `src/` – the game. Classic scripts sharing the `PopoGame` namespace, loaded in
  dependency order from `index.html`. `game.js` orchestrates (levels, input, hints, drawing),
  `sequences.js` holds the opening, the drop (right or wrong), the catch and raise, a wrong
  net breaking, the net winding up and letting down, the row and the finale,
  `geometry.js` the vector helpers, `net.js` the net, its checks and measurements, `winch.js` the machine, `fish.js` the fish, `popo.js`
  Popo and the raft, `water.js` the WebGL water pass, `effects.js` bubbles, splashes and
  sparkles, `audio.js` the synthesised music and effects plus the recorded voice lines,
  `ui.js` the HUD and the corner's pointer handling, `levels.js` the level and story data.
- `asset/` – the untouched source artwork and voice recordings (not deployed).
- `assets/` – the compressed art the game loads, generated from `asset/`, and
  `assets/generated/` – Popo's poses, the winch, the rope and shackle, the net texture and
  the dialogue panel: generated images used whole (prompts in `tools/generated-art-prompts.txt`;
  the division of work with Codex, which makes them, is in `tools/CODEX-HANDOFF.md`), and
  `assets/generated-web/` – the WebP copies of them the game loads (same pictures and size,
  about a fifth of the download), made by `tools/build-assets.py --generated`.
- `tools/build-assets.py` – rebuilds `assets/` and `src/sprite-data.js` (needs Pillow): the
  backgrounds and their water masks, the raft, the title fish and the natural fish (blue and
  teal ones are left out because they vanish against the water), and the WebP copies of the
  generated art; `--generated` rebuilds only those (run it whenever `assets/generated/` changes).
- `tools/build-voice.py` – records the voice lines into `src/voice-data.js` (below);
  `tools/build-popo-voice.py` adds Popo's Fishing Frenzy clips.
- `tools/build-rowing.py` – Popo's paddling rig (`src/rowing.js`, `src/rowing-data.js`);
  `tools/build-rowing-cycle.py` pre-renders one stroke of it into
  `assets/sprites/popo-row-cycle.webp`, which the game crossfades through while Popo rows
  (the rig's blade path still times the splashes).

## Voice-overs

The narrator and Popo are voiced. Popo speaks as he does in Fishing Frenzy, in his voice from
there: he never gives instructions, he only reacts in a few comic words ("*Great* catch!",
"Whoopsie Doopsie!" when a wrong net tears, "Huh?!" when a right net comes up empty, "*Woah!*"
for the golden school, "*Wow!*" "What a *catch!*" at the end). His clips are his Fishing Frenzy
studio recordings (Gemini's Puck, Indian-English accent, a little deeper), copied by key out of
Fishing Frenzy's voice data by `tools/build-popo-voice.py`, which `tools/build-voice.py` runs
after writing the file. Each clip is keyed by speaker and on-screen text (see
`voiceKey` in `src/audio.js`), so the prompt, hint and story lines in `src/levels.js`
find their recordings (lines with symbols, like ∠A = 70°, carry a spoken form in the script); the words of a line appear as they are spoken, the music ducks under
the voice, and a line without a clip falls back to the synthesised blips. The narrator's
clips were recorded locally with Kokoro-82M:

```
python3 -m venv ~/.cache/popo-voice311   # Python 3.10+
~/.cache/popo-voice311/bin/pip install kokoro soundfile lameenc
~/.cache/popo-voice311/bin/python tools/build-voice.py --engine kokoro   # records missing lines
```

They can also be recorded with Gemini text-to-speech (`GEMINI_API_KEY` in `.env`; see the
script). Edit a line in `LINES` and the game's text together, then run the script again.

The hook's nine new lines (`STORY.hook`; "Let's find out!" is Swiftee's existing clip) are files of their own,
`assets/voice/hook-h1.webm` … `hook-h9.webm`, mapped by key in `src/voice-data.js` and fetched with the lesson's clips
once loading is done (`AudioEngine.fetchLaterVoices`). The game's own clips, files and embedded alike, are WebM Opus
(32 kbps, mono), not the lesson's Ogg: the game decodes its voice with Web Audio (`decodeAudioData`), and WebKit's
(the tests' WebKit, Safari's engine) decodes Opus in WebM but not in Ogg. They were recorded in the "Ai Wala Human" voice studio:
Popo as its Male Child (Energetic) voice pitched down a touch to sit near his Fishing Frenzy clips, the narrator and
Swiftee as its Female Teacher (Standard) voice. Each line is worded exactly as on screen.

Every narrator and Swiftee line - the hook's, the nets' prompts and hints, and her welcome back ("Great job!", "Now,
let's help Popo catch some fish!", `assets/voice/ff-*.webm`) - is recorded the way the lesson's are (its
`docs/VOICEOVER.md`): given to the studio in Devanagari with each word spelled as the lesson's lines spell it, so a word
sounds the same in the game as in the lesson, the take closest to the lesson's voice kept, and matched to the lesson's
loudness (-16.4 LUFS), so no line is louder or quieter than the next.

## Tests

Headless Chromium through Python Playwright (`pip install playwright pillow`):

- `python3 tests/playthrough.py` – plays all eight nets with real pointer drags and the Drop
  Net button: Restart from the pause card hands the corner back, a prompt comes on one line
  word by word, a wrong net dropped as fish swim under it loses its catch and comes back
  mended with a hint, the corner stays on the stop it's dragged to (also through a mid-drag
  resize) with nothing giving the answer away, a right net dropped over no fish comes up empty
  and can go again, Drop Net locks the answer, glowing, a drop timed for fish under the
  net catches some, waters change, pause freezes the game, the end screen closes in with The
  End, and Play Again closes and reopens it on the first net.
- `python3 tests/geometry.py` – every level's property holds exactly at the solved position and
  fails at the start, the start is a simple frame well away from its place, the track runs
  through the place, Check passes at that stop and at no other and the numbers on the net
  agree with it at every stop, the net hangs clear of the water and the school's water is
  inside the lowered net.
- `python3 tests/assets.py` – the WebP copies in `assets/generated-web/` match the generated
  art they were made from.
- `python3 tests/rowing.py` – the paddling frames and a row to the next waters at three sizes.
- `python3 tests/ui_layout.py` – the HUD, the pause card and the end screen stay inside the
  stage at three sizes, and the sound and pause controls work.
- `python3 tests/machine_animation.py` – the operating poses are whole, follow the drum both
  ways, and every level's corner can be dragged to its place clear of the raft.

## Notes on the art

- Popo's operating poses (`assets/generated/popo-operating.png`) were generated from the
  original character (`asset/popo-fishing-clean.png`, kept for reference; `popo.png` is the
  first rod-less take). He breathes from his seat, bounces when pleased and tilts his head
  when a net breaks. While rowing he is the pre-rendered paddling stroke of the original
  art (`asset/popo-paddling-rig-source.png`), scaled to the seated character.
- The raft with its bucket comes from `asset/props-new.png`. The hint hand is `asset/hint-hand.png`.
- `asset/winch-concept.png` was the first machine concept and `assets/generated/winch.png` the
  second; the game uses the arched one, whose boom leaves room for the net.
- Each background gets a water mask: the surface waves move only open water, so the sky,
  mountains, ice shelves and icebergs stay still. The seaweed sway stops at the plant tips.
- The play button is built into `assets/` and embedded as a data URL. The banner's logo is
  the user's painted `asset/fishing-frenzy-2-logo.png`, used whole: `tools/build-assets.py
  --logo` trims and scales it into `assets/sprites/logo.webp` and prints the top of its snow
  (`LOGO_TOP` in `src/title.js`, which the fish peek over).
