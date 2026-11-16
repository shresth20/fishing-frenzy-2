// =====================================================================
// CONFIG — tuning values for the board, snapping, pacing and limits.
// =====================================================================
const CONFIG = {
  pxPerCm: 60,                       // board scale: 1 cm = 60 board px
  // shape palette (Fishing Frenzy's lesson colours: bright blue sides, an ice-white fill, teal legs once the parallel pair
  // is found, vivid angles). line = every side and corner ring; slate = the trapezium's legs once its parallel pair is
  // found; pair2 = the second parallel pair (AD, BC) once both pairs are marked: Fishing Frenzy's leg teal, so the two
  // pairs read apart; hl / hlRing = the gold of a
  // named corner's ring; ink = dark navy for marks on the lines and card text; panel = the cards' face. vA..vD = each
  // corner's own colour (its angle's wedge, its half of a diagonal: Fishing Frenzy's orange, green, violet and amber);
  // once opposite angles / halves are shown equal, A and C
  // share vA and B and D share vB. Applied on load as CSS variables (--pg-line, --pg-fill, --pg-vA ...) for css/game.css.
  palette: { pair2: '#00B8A9', line: '#1E7BFF', slate: '#00B8A9', fill: '#E4FBFF', dot: '#1E7BFF', hl: '#FFD43B', hlRing: '#FFB800', ink: '#123B63', panel: '#FFF8EC',
    vA: '#ff7a00', vB: '#00c853', vC: '#9d4dff', vD: '#ffab00' },
  // opening shape: the storyboard's symmetric trapezium (pages 1-8): CD 6 cm, both legs 3 cm, base angles 70°, centred in
  // the panel. Dragging B until BC ∥ AD makes the parallelogram of the storyboard: AB = CD = 6 cm, AD = BC = 3 cm,
  // ∠A = ∠C = 110°, ∠B = ∠D = 70°
  start: { D: 40, C: 400, baseY: 322, height: 180 * Math.sin(70 * Math.PI / 180), legAD: 3, legBC: 3 },
  // dragging B keeps the shape readable: the top side at least minTop long, B within maxLegRun of C and left of maxTopX
  limits: { minTop: 90, maxLegRun: 243, maxTopX: 496 },
  // side markings, Fishing Frenzy's lesson's own (board px, scaled with the shape, as there): parallel chevrons - half
  // depth, half height (11 deep, 22 tall), spacing between two (back to back); equal-length ticks - half length (24 long),
  // spacing between two; gap = how far each kind sits from the midpoint when a side has both; labelGap = a length
  // label's gap from its side (bases also clear their arrows: +12, as there), markGap = the extra room past a side's marks
  marks: { arrowDepth: 5.5, arrowWing: 11, arrowStep: 14, tickHalf: 12, tickStep: 10, gap: 28, labelGap: 10, markGap: 14,
    tempMs: 1800, pairGap: 450, tempShift: 56 }, // (arrows called out for a moment: how long they stay, the second pair's lag, how far back along a side showing its length)
  // dropdown answers: one option's height, the menu's narrowest width, the lowest it may reach (stage px), close and
  // wrong-answer display times (ms)
  dropdown: { itemH: 52, minItemW: 64, gap: 8, left: 112, right: 1168, maxBottom: 692, closeMs: 180, wrongMs: 1000 }, // the choices' row: where the tiles were, under the boxes, inside the card (stage px)
  // B this close to its place (board px) snaps into the parallelogram - held or let go - and held there this long is
  // taken as placed (so a finger that never lifts cleanly still finishes the task)
  snap: { parallelPx: 40, holdMs: 600 },
  reveal: { afterTips: 2, glideMs: 1100 }, // a drag missed after this many tips shows the answer (dragB: st.showAnswer)
  connect: { reach: 40 }, // drawing a diagonal: how near a corner the pointer must be for the line to go to it (board px)
  // recorded sound effects (others are synthesised): 'good' = every correct action (with the confetti), 'bad' = every wrong one
  sounds: { good: 'assets/audio/correct.webm', bad: 'assets/audio/incorrect.webm' },
  soundVolume: 0.9,
  // a part named in the voice-over grows (CSS .emph, ~0.3 s in / 0.3 s out) and holds this long before easing back
  emph: { holdMs: 1000 },
  // screen 1 build: the pen starts with the voice and takes ofLine of the spoken line (minMs..maxMs), so the outline
  // closes as Swiftee finishes and the fill fades in on her last word; delayMs + 2.5 s = start anyway if no voice
  // begins; rushMs = how fast it closes if the voice ends early; settleMs = the outline's glow
  // (the side numbers' and the assembly's own timings live with their GSAP timelines in js/motion.js)
  build: { pxPerMs: 0.36, delayMs: 450, settleMs: 1300, ofLine: 0.85, minMs: 1600, maxMs: 3600, rushMs: 450 },
  // flow: a finished screen moves on advanceMs after its last line (voice-over) ends (explanation screens by themselves; a
  // question or task waits for the learner, then moves on after its feedback). A question's answers, or a task's corner,
  // come in as Swiftee says the question's last word (at the latest answersMaxMs after the screen starts, should her
  // voice stall). In the journey, the lesson's last screen hands over to the fishing on its Next.
  // restMs: after every animation (a side's light, marks coming in, sides carried on, a slide, a sequence) the screen is
  // still this long before anything new starts - its next line, the next animation, the next screen - so each can be
  // taken in (engine busyFor)
  flow: { advanceMs: 1300, answersMaxMs: 15000, restMs: 800 }, // (2600 / 1500 left a screen standing ~2.7 s after its voice - it read as stuck; now ~1.7 s)
  plateMaxW: 1200,                   // the instruction plate's widest (stage px): a longer line is set smaller (engine plateFit)
  // the supplementary-angle demo: the copied angle slides from its own corner onto the shared side (CSS .supp)
  supp: { stepMs: 6500 }, // (each pair's demo, its tag built with it, and a rest)
  // the card (game-engine sceneFit / belowH / optRow): every screen stacks the shape and what sits under it, centred on it
  card: {
    scale: 2,                        // the shape's largest size (board px -> stage px): each screen draws it as big as fits
    top: 108, topChips: 194, bottom: 690, plateBottom: 94, // the stack's room: under the question plate (20-94) - its letters as far under it as its answers are under them - (or under tags above the shape) to the sand
    maxW: 1160, introCx: 860, introW: 680, measureCx: 790, measureW: 940, // widths; screen 1 (as Fishing Frenzy's) and the measuring walks sit right of Swiftee, clear of her bubble
    padX: 40, padTop: 44, padBottom: 46, lenPadX: 30, lenPadY: 20, // room round the shape for its letters (28 out from the corners, 21 tall: 41) and outside labels (board px)
    // answers under the shape (stage px): Fishing Frenzy's answer pills on its card (74 px drawn 1.18x: 87), two-column
    // rows, answer boxes and their tiles
    optGap: 14, optH: 87, optGapX: 12, fillH: 66, tileH: 64,
    chipGap: 8, chipLane: 70, rowsH: 132, chipTopQ: 70, // name tags: gap, one row, two rows (chipGap + rowsH = the lane every screen keeps under the shape, sceneFit), tags above the shape (row top: tags from y 100)
    optW: 620, pillPad: 40, pillPadLong: 28, pillMin: 150, rowMax: 1040 }, // answer pills (see optRow): each fits its text, short ones set bigger
  board: { x: 640, y: 104 },         // the board's top-left on the stage
  // screen 14's measuring walk: her size on the shape, her spot on the sand (feet) and size there, her walking pace,
  // ms per cm along a side, the pause on each corner, the wait before she sets off and after she is home again
  walker: { size: 150, homeX: 183, homeY: 631, homeSize: 259, strollPxPerMs: 0.42, msPerCm: 380, pauseMs: 550, startMs: 850, homeMs: 850,
    tips: [[488, 272], [484, 281], [494, 273], [489, 270], [486, 278], [483, 279], [491, 281], [489, 281]] }, // tape exit per walk frame (@2x cell px)
  // screen 24's protractor walk (js/angle-walker.js, as in Fishing Frenzy's lesson): scale = stage px per drawing px
  // (so the protractor covers the angle); homeK = her size at her spot against her size on the shape; carryPx =
  // protractor offset from the corner between corners; hop = how far her path bows out round a side; bob = px of bob
  // every stepPx; tiltMax = most a drawing may turn (deg); leadMs = wait after her line; firstMs = shortest walk to or
  // from her spot; the rest are move timings
  angleWalk: { scale: 1.6, homeK: 1.52, carryPx: 28, hop: 60, stepPx: 45, bob: 5, tiltMax: 33, leadMs: 900,
    firstMs: 950, moveMs: 600, placeMs: 400, alignMs: 420, measureMs: 300, holdMs: 900, liftMs: 350, fadeMs: 250 },
  hand: { idleMs: 3000, showMs: 4400, maxShows: 3, // hint hand: wait with no touch (as the game's), time on screen, showings per step
    onceDelayMs: 500, onceMs: 2300 },                 // handOnce screens: a single demo gesture this long after the line ends
  stars: [[8, 3], [5, 2], [0, 1]],   // [checkpoint challenges right on the first try >=, stars] (9 challenges)
  // Swiftee's expressions (states in js/swiftee-manifest.js). A narration line's own m wins; these cover reactions and
  // the pose held between lines.
  swiftee: {
    base: 'swiftee-assets/',
    talk: 'talking',       // default while a line is spoken
    idle: 'blinking',      // between lines and while the learner works on a task
    waiting: 'thinking',   // a check question is open: thinking time
    praise: 'happy',       // a task is completed
    correct: 'celebrating',// a check is answered correctly
    wrong: 'confused',     // a wrong answer or tap: encouraging, never punishing
    done: 'happy',         // the lesson-complete screen, after the closing line
    reactMs: 1600,         // how long the line's expression shows after speaking (lip-sync talks during the voice)
    minHoldMs: 900
  }
};
// An angle's size on screen (its wedge's radius, stage px) for an angle of deg degrees, as in Fishing Frenzy's lesson:
// every angle shows the same amount of colour - a narrow angle reaches a little further along its sides and a wide one a
// little less (90° = 38 px), so a 70° angle never looks smaller than a 110° one, whatever the shape's size
CONFIG.angleR = (deg) => 38 * Math.min(1.25, Math.max(0.85, Math.sqrt(90 / Math.max(1, deg))));
