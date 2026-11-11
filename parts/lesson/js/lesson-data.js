// =====================================================================
// LESSON — every screen of the Parallelogram storyboard (PDF pages 1–52), in play order.
// `pdf` on each step is the storyboard page it implements (feedback pages are the finished state of their question).
//
//   lines: narration (t = on-screen text, \n = line break in the bubble, s = optional spoken text;
//          keep: 1 + s = voice only, the bubble keeps the previous line;
//          glow = sides drawn bolder while the line is spoken, e.g. ['AB', 'CD']; glowAt: 'word' = wait for that word;
//          pulse: 1 + pulseAt = the shape zooms once on that word; growAt = the shape comes forward on that word;
//          cues = board moments on a spoken word: [{ at: 'word', glow: [sides] | null, hi: card text, chip, pulse, ms }];
//          a cue's tags: [{ t, k }] = the name tag of each of its pairs (match, matchAng, halfSlide), built as that pair's
//          slide lands; merge: { from: [tags], into: tag } = those tags fly into a new one; a line's tagsWithSupp: its
//          chips come one with each 180° demo (f.supp);
//          a cue's mark: [sides] = those sides' parallel arrows wait for the cue and pop on as its glow's light passes them;
//          meet: [two sides] = carried on until they meet (until: 'word' = they meet as that word is said); meetPulse = they beat;
//          chips = cards shown with the line; m = Swiftee's expression (default talking; reactions in CONFIG.swiftee)
//          holdM: 1 = Swiftee keeps the m pose while she speaks (e.g. waves hello) instead of the talking loop
//   skin:  'intro' = the opening look (storyboard pages 1-8): white bubble, light-blue shape with a thin blue outline
//   task:  dragB  = drag B until BC ∥ AD (the trapezium becomes a parallelogram; snaps when close); showAnswer = the
//          line said when a drag is missed after CONFIG.reveal.afterTips tips (B then moved into place: a glideB cue),
//          answerAfter = the lines once it is there (instead of after)
//          measure (+auto) = Swiftee walks every side with her tape measure
//          measureAngles (+auto) = Swiftee measures every angle with a protractor (js/angle-walker.js)
//          tapEq  = tap the corner whose angle equals ∠ref (want = the right corner, wrong = tip for a wrong tap)
//          handOnce: 1 = one demo gesture of the hand once the instruction ends
//          connect = draw both diagonals: drag (or tap, tap) from a corner to the opposite corner
//   enterCues: [{ at0: ms, ...a word cue }] = board moments as the screen opens, before its line (voiceDelay)
//   own: 1 = Swiftee's own thought ("There is something interesting..."): she stays and says it in her bubble, the
//          shape beside her, as on the measuring screens (not the narration plate)
//   opts:  answer buttons (ok = right; fb = tip for a wrong one; soloOk: 1 = once right, only the right answer stays,
//          centred; okGlow: [[sides], ...] = side pairs pulse in turn after it; calmOk: 1 = no confetti; okCues = word cues on
//          the feedback line; an option's emph = the parts that grow as it is picked right). multi: 1 = select every right answer
//          (req: false = right but not needed to finish). grid: 1 = the four-shape picture grid
//   fill:  answer boxes: blanks [{ id, pre, post, ans }], tiles [...] (the choices: a tap on a box opens them in a row
//          under it). match: 1 = segment tiles dragged (or tapped) into the boxes, each once, checked as pairs (pairs)
//   cp:    checkpoint challenge (scored: right on the first try), cpTitle = its name (in the ?dev=1 panel)
//   fig:   the checkpoint's own drawing on the board: P (corners), sides / angles / halves labels ('?' = unknown),
//          diag = draw the diagonals
//   f:     board display flags: noLetters, par (arrows on AB, CD), par2 (arrows on AD, BC), sideLen / legLen (lengths),
//          lenSeq (lengths appear pair by pair: AB + CD, then AD + BC), ticks (equal-side marks), arcs (angle arcs),
//          pairCol (equal angles share a colour), supp (supplementary demo pairs, in turn),
//          diag, O, split (diagonal halves in four colours), halfPairs (equal halves share a colour), hticks, halves (cards)
//   flow:  explanation screens move on by themselves (CONFIG.flow.advanceMs after the voice); questions wait for the
//          learner; autoNext (ms) = move on this soon after the last line (recall sequence)
// =====================================================================
const PG = { par: 1, par2: 1 };                       // both pairs of sides marked parallel
const LENS = { sideLen: 1, legLen: 1 };               // all four side lengths (measured from the shape)
const DIAG = { diag: 1, O: 1 };                       // the two diagonals and their meeting point O
const PRACTICE = { practice: 1 }; // (its tags, if it makes any, under the shape like every screen's: over its answers while they show)
// checkpoint figures (board coordinates; the board's top-left is stage 651,104)
const deg = Math.PI / 180;
const tilt = (a) => ({ A: { x: 90, y: 112 }, B: { x: 390, y: 112 },
  C: { x: 390 + 170 * Math.cos(a * deg), y: 112 + 170 * Math.sin(a * deg) }, D: { x: 90 + 170 * Math.cos(a * deg), y: 112 + 170 * Math.sin(a * deg) } });
const FIG_SIDES = { A: { x: 150, y: 112 }, B: { x: 440, y: 112 }, C: { x: 380, y: 282 }, D: { x: 90, y: 282 } };
// checkpoint 3b: AO = 5 cm and BO = 3 cm, so AC is drawn the longer diagonal (halves about 208 : 124, as 5 : 3)
const FIG_HALVES = { A: { x: 70, y: 112 }, B: { x: 350, y: 112 }, C: { x: 450, y: 282 }, D: { x: 170, y: 282 } };
const CP = { cp: 1 };

const LESSON = {
  steps: [
    // ---------- Part 1 · quadrilateral -> trapezium -> parallelogram (pages 1-11) ----------
    // the outline draws itself while Swiftee says the line and closes on her last word; the plain shape, as on page 1
    // (she waves hello as she speaks)
    { pdf: 1, id: 'intro', build: 1, skin: 'intro', lines: [{ m: 'waving', holdM: 1, t: I18n.plain('lsIntro') }], f: { noLetters: 1 } },
    { pdf: 2, id: 'quadSides', sideNums: 1, skin: 'intro', lines: [{ m: 'happy', t: I18n.plain('lsQuadSides') }], f: { noLetters: 1 } },
    // screens 3-4: the shape screen 1 drew stays (never rebuilt); it comes forward once on "special" (growAt), and the
    // name caption is a word cue, as on screen 10 - "Trapezium" pops in exactly as Swiftee says it and the outline glows
    // once. Screen 4 never lights up AB/CD on "parallel": screen 5 asks which pair is parallel.
    // (no tracing: the shape comes forward on "special" and its name comes in on "trapezium")
    { pdf: 3, id: 'special', skin: 'intro', onlyCues: 1, lines: [{ m: 'happy', t: I18n.plain('lsSpecial'), growAt: 'special',
      cues: [{ at: 'trapezium', chip: { t: I18n.plain('wordTrapezium'), k: 'name' } }] }], f: { noLetters: 1 } },
    // (its one parallel pair lights once, on "pair" - not the other two sides, which are not parallel)
    { pdf: 4, id: 'onePair', skin: 'intro', onlyCues: 1, enterChips: [{ t: I18n.plain('wordTrapezium'), k: 'name' }],
      lines: [{ t: I18n.plain('lsOnePair'), cues: [{ at: 'pair', light: ['AB', 'CD'], ms: 2200 }] }], f: { noLetters: 1 } },
    // (the question names no pair: on "pair" one pair of opposite sides lights, on "sides" the other - the two the
    // answers name - and "parallel" shows nothing, which would be the answer)
    Object.assign({ pdf: '5-6', id: 'askPar', skin: 'intro', noTrace: 1, // (the question is asked calmly: nothing on the shape lights or moves)
      lines: [{ m: 'curious', t: I18n.plain('lsAskPar') }],
      // right answer: AD ∥ BC folds away and AB ∥ CD settles alone in the centre, green (storyboard page 6)
      // right: AB is traced as it is said, its parallel marks popping on as the light passes them, then CD; wrong: AD, then BC, light as
      // they are said; on "lean" the card zooms out just enough, and they are carried on until they meet as "meet" is said
      ok: I18n.plain('lsAskParOk'), soloOk: 1, okF: { par: 1 },
      okCues: [{ at: 'ab', glow: ['AB'], mark: ['AB'] }, { at: 'cd', glow: ['AB', 'CD'], mark: ['CD'], ms: 1800 }],
      opts: [
        { id: 'AB', t: 'AB ∥ CD', ok: true },
        { id: 'AD', t: 'AD ∥ BC', fb: I18n.plain('lsAskParFbAD'),
          fbCues: [{ at: 'ad', glow: ['DA'] }, { at: 'bc', glow: ['DA', 'BC'] }, { at: 'lean', meet: ['DA', 'BC'], until: 'meet' }, { at: 'longer', meetPulse: 1 }] }
      ] }, PRACTICE),
    { pdf: 7, id: 'whatIf', skin: 'intro', lines: [{ m: 'thinking', t: I18n.plain('lsWhatIf'), glow: ['DA', 'BC'] }], f: { par: 1 } },
    // one demo hand once the instruction ends, then the learner drags B; BC ∥ AD snaps it into a parallelogram, and BC
    // then AD are traced as they are said, their parallel marks popping on with the light
    { pdf: 8, id: 'dragPar', skin: 'intro', onlyCues: 1, lines: [{ m: 'curious', t: I18n.plain('lsDragPar'),
      cues: [{ at: 'B', emph: ['vB'] }, { at: 'parallel', light: ['BC', 'DA'], ms: 1500 }] }],
      task: 'dragB', handOnce: 1,
      after: [{ m: 'happy', t: I18n.plain('lsDragParAfter'), cues: [{ at: 'bc', glow: ['BC'], mark: ['BC'] }, { at: 'ad', glow: ['BC', 'DA'], mark: ['DA'], ms: 1800 }] }],
      // missed after two tips: the answer shown - AD lights, its copy slides across to C (the way BC must lean) and B
      // glides along AB until BC lies on it; then BC and AD are traced, their marks popping on
      showAnswer: { m: 'thinking', t: I18n.plain('lsDragParShowAnswer'), cues: [{ at: 'watch', glow: ['DA'] }, { at: 'lean', glideB: 1 }] },
      answerAfter: [{ m: 'happy', t: I18n.plain('lsDragParAnswerAfter'), cues: [{ at: 'bc', glow: ['BC'], mark: ['BC'] }, { at: 'ad', glow: ['BC', 'DA'], mark: ['DA'], ms: 1800 }] }], f: { par: 1 } },
    // both pairs shown, not spelt out: on "both" AB and CD are traced, their arrows beating as the light passes, and
    // their tag is built from them; on "sides" AD and BC, with theirs; on "parallel" the whole outline
    { pdf: 9, id: 'bothPar', chipTop: 428, onlyCues: 1, lines: [{ m: 'surprised', t: I18n.plain('lsBothPar'), cues: [
      { at: 'both', glow: ['AB', 'CD'], beat: ['AB', 'CD'], chip: { t: 'AB ∥ CD', k: 'white', pop: 1 } },
      { at: 'sides', glow: ['DA', 'BC'], beat: ['DA', 'BC'], chip: { t: 'AD ∥ BC', k: 'white', pop: 1 }, ms: 1700 }] }], f: PG },
    // screen 9 (storyboard page 10): the cards come in under the shape with the voice, one row - "We": AB ∥ CD lifts;
    // "this": AD ∥ BC; "Parallelogram": the name lands beside them and the whole outline glows once
    { pdf: 10, id: 'defPg', chipTop: 428,
      // the two pair tags built on screen 8 stay; on "parallelogram" they merge into the name (no tracing)
      lines: [{ t: I18n.plain('lsDefPg'), cues: [
        { at: 'parallelogram', merge: { from: ['AB ∥ CD', 'AD ∥ BC'], into: { t: I18n.plain('wordParallelogram'), k: 'name' } } }] }], f: PG },
    // screen 10 (storyboard page 11): screen 9's shape stays as it is (no rebuild) and the two pair cards come in; as
    // Swiftee says it, AB + CD glow with their card, then AD + BC with theirs; on "parallelogram" the name card (there
    // since screen 9, in the same row) lifts
    { pdf: 11, id: 'defFull', chipTop: 428,
      // (the name made on screen 10 stays; the definition is said with its sides lighting pair by pair)
      enterChips: [{ t: I18n.plain('wordParallelogram'), k: 'name' }],
      lines: [{ t: I18n.plain('lsDefFull'), cues: [
        { at: 'pairs', glow: ['AB', 'CD'] },
        { at: 'sides', glow: ['DA', 'BC'] },
        { at: 'called', glow: null, hi: null },
        { at: 'parallelogram', hi: I18n.plain('wordParallelogram'), ms: 1400 }] }],
      f: PG },

    // ---------- Part 2 · opposite side lengths (pages 12-20) ----------
    // (the sides light on "lengths" / "equal": the question is about them, and nothing else is on the board yet)
    { pdf: 12, id: 'lengthsQ', lines: [{ m: 'thinking', t: I18n.plain('lsLengthsQ') }], f: PG }, // (no tracing)
    // (the narrator asks - on the plate, Swiftee not on the card; she comes with her own line on the next screen: "Let's
    // find out!")
    { pdf: 13, id: 'equalQ', lines: [{ narr: 1, t: I18n.plain('lsEqualQ') }], f: PG },
    { pdf: 14, id: 'measure', lines: [{ m: 'curious', t: I18n.plain('lsFindOut') }], task: 'measure', auto: 1, f: PG },
    // the lengths come in pair by pair: AB and CD (6 cm) together, then AD and BC (3 cm)
    { pdf: 15, id: 'interesting', lines: [{ narr: 1, t: I18n.plain('lsInteresting') }],
      lenSeq: [[700, ['AB', 'CD']], [2300, ['DA', 'BC']]], f: Object.assign({ lenSeq: 1 }, PG, LENS) },
    Object.assign({ pdf: '16-17', id: 'askSides', lines: [{ m: 'curious', t: I18n.plain('lsAskSides') }],
      // right answer: the other option folds away, this one settles green in the centre; as the line says it, AB + CD
      // and AD + BC light in turn on "opposite", their lengths in turn on "equal" (conceptCues); the correct sound, no
      // confetti (storyboard page 17)
      ok: I18n.plain('lsAskSidesOk'), soloOk: 1, calmOk: 1, okF: { ticks: 1 },
      okCues: [{ at: 'Opposite', lightSeq: [['AB', 'CD'], ['DA', 'BC']], gap: 1000, hold: 1100 }], // (each pair of opposite sides once, as their ticks show they are equal)
      opts: [
        { id: 'all', t: I18n.plain('lsAskSidesOptAll'), fb: I18n.plain('lsAskSidesFbAll') },
        { id: 'opp', t: I18n.plain('lsAskSidesOptOpp'), ok: true }
      ], f: LENS }, PRACTICE),
    // (no sides sliding: as it is said, the names of each pair of opposite sides fly from their sides and merge into
    // its tag - AB and CD into AB = CD, then AD and BC into AD = BC)
    { pdf: 18, id: 'oppEq', onlyCues: 1, lines: [{ cues: [{ at: 'opposite', chip: { t: 'AB = CD', k: 'gold', byName: 1 } }, { at: 'equal', chip: { t: 'AD = BC', k: 'gold', byName: 1 } }], m: 'happy', t: I18n.plain('lsOppEq') }],
      f: Object.assign({ ticks: 1 }, LENS) },
    { pdf: 20, id: 'sidesSum', onlyCues: 1, lines: [{ m: 'happy', t: I18n.plain('lsSidesSum'), cues: [
      // (one after another from "parallel": "equal" follows it too closely for a sequence of its own)
      { at: 'parallel', steps: [{ beat: ['AB', 'CD'], chip: { t: 'AB ∥ CD', k: 'gold', pop: 1 } }, { beat: ['DA', 'BC'], chip: { t: 'AD ∥ BC', k: 'gold', pop: 1 } },
        { emph: ['lAB', 'lCD'], chip: { t: 'AB = CD', k: 'gold', pop: 1 } }, { emph: ['lDA', 'lBC'], chip: { t: 'AD = BC', k: 'gold', pop: 1 } }], gap: 800 }] }], // (gold, as screen 16's)
      f: Object.assign({ ticks: 1 }, PG, LENS) },

    // ---------- Checkpoint 1 · Are you ready? (page 21) ----------
    Object.assign({ pdf: 21, id: 'cp1a', grid: 1, multi: 1, cpTitle: 'Checkpoint 1 · Find the Parallelograms',
      lines: [{ m: 'curious', t: I18n.plain('lsCp1a') }],
      // (the tips speak of the shape just tapped - "this shape" - not of its letter)
      ok: I18n.plain('lsCp1aOk'),
      opts: [
        { id: 'A', ok: true },
        { id: 'B', fb: I18n.plain('lsCp1aFbB') },
        { id: 'C', ok: true },
        { id: 'D', fb: I18n.plain('lsCp1aFbD') }
      ] }, CP),
    // (each side traced, whole, as it is named: AB, then the side asked for; right: the opposite pair, on "Opposite")
    Object.assign({ pdf: 21, id: 'cp1b', handOnce: 1, onlyCues: 1, cpTitle: 'Checkpoint 1 · Find the Missing Side',
      lines: [{ m: 'curious', t: I18n.plain('lsCp1b'), cues: [{ at: 'AB = 7 cm.', light: ['AB'], ms: 1400 }, { at: 'CD?', light: ['CD'], ms: 1600 }] }],
      ok: I18n.plain('lsCp1bOk'), okCues: [{ at: 'Opposite', light: ['AB', 'CD'], ms: 1800 }],
      fig: { P: FIG_SIDES, sides: { AB: '7 cm', CD: '? cm' } },
      fill: { blanks: [{ id: 'CD', pre: 'CD =', post: 'cm', ans: '7' }], tiles: ['3.5', '7', '14'],
        fb: { '3.5': I18n.plain('lsCp1bFbHalf'), '14': I18n.plain('lsCp1bFbDouble') } } }, CP),
    // (each given side traced, whole, as it is named - AB, then BC - and the two asked for together, so no light cuts
    // another short; right: CD, then AD, as they are said)
    Object.assign({ pdf: 21, id: 'cp1c', onlyCues: 1, cpTitle: 'Checkpoint 1 · Find the Missing Sides',
      lines: [{ m: 'curious', t: I18n.plain('lsCp1c'), cues: [{ at: 'AB = 8 cm', light: ['AB'], ms: 1300 }, { at: 'BC = 5 cm.', light: ['BC'], ms: 1300 }, { at: 'of', lightSeq: [['CD'], ['DA']], gap: 1050, hold: 1300 }] }], // (CD, then AD - one at a time)
      ok: I18n.plain('lsCp1cOk'), okCues: [{ at: 'CD = 8 cm,', light: ['CD'], ms: 1150 }, { at: 'AD = 5 cm.', light: ['DA'], ms: 1400 }],
      fig: { P: FIG_SIDES, sides: { AB: '8 cm', BC: '5 cm', CD: '?', DA: '?' } },
      fill: { blanks: [{ id: 'CD', pre: 'CD =', post: 'cm', ans: '8' }, { id: 'AD', pre: 'AD =', post: 'cm', ans: '5' }], tiles: ['3', '5', '8', '13'],
        fb: { CD: I18n.plain('lsCp1cFbCD'), AD: I18n.plain('lsCp1cFbAD') } } }, CP), // (each box its own tip)

    // ---------- Part 4 · opposite angles (pages 22-31) ----------
    { pdf: 22, id: 'sidesDone', lines: [{ m: 'happy', t: I18n.plain('lsSidesDone') }] },
    { pdf: 23, id: 'angles', noTrace: 1, lines: [{ narr: 1, t: I18n.plain('lsAngles') }] }, // (the narrator asks: as screen 13)
    // Swiftee carries a protractor round A, B, C, D; each angle and its size come in as she measures it
    { pdf: 24, id: 'measureAng', lines: [{ m: 'curious', t: I18n.plain('lsFindOut') }], task: 'measureAngles', auto: 1 },
    // the four arcs and their sizes draw in one after another
    { pdf: 25, id: 'interestingAng', lines: [{ narr: 1, t: I18n.plain('lsInterestingAng'), cues: [{ at: 'here', emph: ['aA', 'aB', 'aC', 'aD'] }] }], f: { arcs: 'ABCD' } },
    { pdf: 26, id: 'someEq', lines: [{ t: I18n.plain('lsSomeEq') }], f: { arcs: 'ABCD' } },
    // screens 26-27: the angle equal to ∠A is chosen from its name (the shape stays still: nothing on it is tapped, jumps or
    // is traced). Right: the two angles come forward, the others step back, and their names fly from the words just said
    // into the statement (∠A = ∠C), which completes as it lands
    Object.assign({ pdf: '27-28', id: 'tapEqA', onlyCues: 1, lines: [{ m: 'curious', t: I18n.plain('lsTapEqA'), cues: [{ at: '∠A?', asked: 'A' }] }],
      ok: I18n.plain('lsTapEqAOk'), soloOk: 1,
      okCues: [{ at: 'equal', focus: ['A', 'C'], ms: 3400 }, { at: '∠C.', chip: { t: '∠A = ∠C', k: 'gold', byName: 1 } }],
      opts: [
        { id: 'B', t: '∠B', emph: ['aB'], fb: I18n.plain('lsTapEqAFb') },
        { id: 'C', t: '∠C', emph: ['aC'], ok: true },
        { id: 'D', t: '∠D', emph: ['aD'], fb: I18n.plain('lsTapEqAFb') }
      ], f: { arcs: 'ABCD' } }, PRACTICE),
    // (asked with nothing between the shape and the answers - screen 26's tag is no hint here; right: it comes back on
    // "equal", and this one's statement forms beside it on "∠B")
    Object.assign({ pdf: '29-30', id: 'tapEqD', onlyCues: 1, lines: [{ m: 'curious', t: I18n.plain('lsTapEqD'), cues: [{ at: '∠D?', asked: 'D' }] }],
      ok: I18n.plain('lsTapEqDOk'), soloOk: 1,
      okCues: [{ at: 'equal', focus: ['D', 'B'], ms: 3400 }, { at: 'equal', chip: { t: '∠A = ∠C', k: 'gold', pop: 1 } }, { at: '∠B.', chip: { t: '∠D = ∠B', k: 'gold', byName: 1 } }],
      opts: [
        { id: 'A', t: '∠A', emph: ['aA'], fb: I18n.plain('lsTapEqDFb') },
        { id: 'B', t: '∠B', emph: ['aB'], ok: true },
        { id: 'C', t: '∠C', emph: ['aC'], fb: I18n.plain('lsTapEqDFb') }
      ], f: { arcs: 'ABCD', pairA: 1 } }, PRACTICE),
    // (the recap of screens 26-27, laid out as they are (PRACTICE: the tags keep their row, the shape its place): each
    // pair - its two angles and its tag - is pointed out in turn as it is said: ∠A and ∠C, then ∠D and ∠B)
    Object.assign({ pdf: 31, id: 'oppAng', onlyCues: 1, enterChips: [{ t: '∠A = ∠C', k: 'gold', pop: 1 }, { t: '∠D = ∠B', k: 'gold', pop: 1 }], lines: [{ m: 'happy', t: I18n.plain('lsOppAng'),
      cues: [{ at: 'opposite', steps: [{ focus: ['A', 'C'], hi: '∠A = ∠C', ms: 1300 }, { focus: ['D', 'B'], hi: '∠D = ∠B', ms: 1300 }], gap: 1600 }] }], f: { arcs: 'ABCD', pairCol: 1 } }, PRACTICE),

    // ---------- Part 5 · adjacent angles (pages 32-36) ----------
    { pdf: 32, id: 'seeElse', own: 1, lines: [{ m: 'thinking', t: I18n.plain('lsSeeElse'), cues: [{ at: 'something', emph: ['aA', 'aB', 'aC', 'aD'] }] }], f: { arcs: 'ABCD' } },
    { pdf: 33, id: 'lookAD', lines: [{ m: 'curious', t: I18n.plain('lsLookAD') }], f: { arcs: 'AD' } },
    // ∠A slides down to D: with ∠D it fills the straight line through D (110° + 70° = 180°)
    // "add": ∠A and ∠D stay vivid and the others step back; "180°": their sum card lifts
    { pdf: 34, id: 'sumAD', lines: [{ m: 'surprised', t: I18n.plain('lsSumAD'), cues: [{ at: 'add', focus: ['A', 'D'], ms: 2200 }],
      chips: [{ t: '∠A + ∠D = 180°', k: 'white' }], tagsWithSupp: 1 }], f: { arcs: 'ABCD', supp: ['AD'] } }, // (its tag built with the demo: 110° + 70°, = 180°)
    Object.assign({ pdf: 35, id: 'askAdj', multi: 1, lines: [{ m: 'curious', t: I18n.plain('lsAskAdj') }],
      // (each tag built as the voice says it)
      ok: I18n.plain('lsAskAdjOk'), okChips: [{ t: '∠B + ∠C = 180°', k: 'gold sm' }, { t: '∠A + ∠B = 180°', k: 'gold sm' }],
      okCues: [{ at: '∠B + ∠C = 180°', chip: { t: '∠B + ∠C = 180°', k: 'gold sm' } }, { at: '∠A + ∠B = 180°.', chip: { t: '∠A + ∠B = 180°', k: 'gold sm' } }],
      opts: [
        { id: 'BC', t: '∠B & ∠C', ok: true },
        { id: 'BD', t: '∠B & ∠D', fb: I18n.plain('lsAskAdjFbBD') },
        { id: 'AB', t: '∠A & ∠B', ok: true },
        { id: 'AC', t: '∠A & ∠C', fb: I18n.plain('lsAskAdjFbAC') }
      ], f: { arcs: 'ABCD' } }, PRACTICE),
    // (the rule, seen whole: all four angles come forward together on "adjacent", and the four sums pop in together on
    // "180°" (pop: no number-flight build) - one beat, not four demos in a row; each pair's demo was screen 31's)
    { pdf: 36, id: 'adjRule', onlyCues: 1, lines: [{ m: 'happy', t: I18n.plain('lsAdjRule'),
      cues: [{ at: 'adjacent', emph: ['aA', 'aB', 'aC', 'aD'], together: 1 },
        { at: '180°.', chips: [{ t: '∠A + ∠D = 180°', k: 'white md', pop: 1 }, { t: '∠A + ∠B = 180°', k: 'white md', pop: 1 }, { t: '∠B + ∠C = 180°', k: 'white md', pop: 1 }, { t: '∠C + ∠D = 180°', k: 'white md', pop: 1 }] }] }],
      f: { arcs: 'ABCD' } },

    // ---------- Checkpoint 2 · Let's use what we learnt! (page 37) ----------
    Object.assign({ pdf: 37, id: 'cp2a', cpTitle: 'Checkpoint 2 · Find the Opposite Angle',
      lines: [{ m: 'curious', t: I18n.plain('lsCp2a') }],
      ok: I18n.plain('lsCp2aOk'),
      fig: { P: tilt(68), angles: { A: '68°', C: '?' } },
      opts: [
        { id: '68', t: '68°', ok: true },
        { id: '112', t: '112°', fb: I18n.plain('lsCp2aFb') },
        { id: '90', t: '90°', fb: I18n.plain('lsCp2aFb') }
      ] }, CP),
    Object.assign({ pdf: 37, id: 'cp2b', cpTitle: 'Checkpoint 2 · Find the Adjacent Angle',
      lines: [{ m: 'curious', t: I18n.plain('lsCp2b') }],
      ok: I18n.plain('lsCp2bOk'),
      fig: { P: tilt(72), angles: { A: '72°', B: '?' } },
      opts: [
        { id: '72', t: '72°', fb: I18n.plain('lsCp2bFb72') },
        { id: '108', t: '108°', ok: true },
        { id: '180', t: '180°', fb: I18n.plain('lsCp2bFb180') }
      ] }, CP),
    Object.assign({ pdf: 37, id: 'cp2c', cpTitle: 'Checkpoint 2 · Find All the Angles',
      lines: [{ m: 'curious', t: I18n.plain('lsCp2c') }],
      ok: I18n.plain('lsCp2cOk'),
      fig: { P: tilt(65), angles: { A: '65°', B: '?', C: '?', D: '?' } },
      fill: { blanks: [{ id: 'B', pre: '∠B =', post: '°', ans: '115' }, { id: 'C', pre: '∠C =', post: '°', ans: '65' }, { id: 'D', pre: '∠D =', post: '°', ans: '115' }],
        tiles: ['25', '65', '115', '180'],
        // a tip for each wrong value in each box: what that value would mean, and the one fact that box needs
        fb: {
          'B:25': I18n.plain('lsCp2cFbB25'),
          'B:65': I18n.plain('lsCp2cFbB65'),
          'B:180': I18n.plain('lsCp2cFbB180'),
          'C:25': I18n.plain('lsCp2cFbC25'),
          'C:115': I18n.plain('lsCp2cFbC115'),
          'C:180': I18n.plain('lsCp2cFbC180'),
          'D:25': I18n.plain('lsCp2cFbD25'),
          'D:65': I18n.plain('lsCp2cFbD65'),
          'D:180': I18n.plain('lsCp2cFbD180') } } }, CP),

    // ---------- Part 7 · diagonals (pages 38-49) ----------
    { pdf: 38, id: 'explored', lines: [{ m: 'happy', t: I18n.plain('lsExplored') }] },
    { pdf: 39, id: 'diagIntro', noTrace: 1, lines: [{ m: 'curious', t: I18n.plain('lsDiagIntro') }] },
    { pdf: 40, id: 'drawDiag', handOnce: 1, lines: [{ m: 'curious', t: I18n.plain('lsDrawDiag') }], task: 'connect', handOnce: 1,
      wrong: I18n.plain('lsDrawDiagWrong'),
      after: [{ m: 'happy', t: I18n.plain('lsDrawDiagAfter') }] },
    { pdf: 41, id: 'diagNames', lines: [{ t: I18n.plain('lsDiagNames') }], f: { diag: 1 } },
    { pdf: 42, id: 'meetO', lines: [{ t: I18n.plain('lsMeetO'), cues: [{ at: 'O.', showO: 1 }] }], f: { diag: 1, Oat: 1 } }, // (point O comes in as it is named)
    // each diagonal splits into its two halves (four colours)
    // (the diagonals plain, and on "segments" their four parts come in one at a time: OA and OC, then OB and OD)
    { pdf: 43, id: 'segs', onlyCues: 1, lines: [{ t: I18n.plain('lsSegs'),
      cues: [{ at: 'segments', steps: [{ half: 'A' }, { half: 'C' }, { half: 'B' }, { half: 'D' }], gap: 750 }] }], f: Object.assign({ split: 1, splitSeq: 1 }, DIAG) },
    // as screens 13 and 24: Swiftee asks what she will find out, says it, then walks the diagonals with her tape - A to
    // O to C, B to O to D - each half's length coming in as the tape lands on it
    { pdf: 44, id: 'measureSeg', onlyCues: 1, lines: [{ narr: 1, t: I18n.plain('lsMeasureSeg') }, { m: 'curious', t: I18n.plain('lsFindOut') }], task: 'measure', segs: 1, auto: 1, f: Object.assign({ split: 1, halves: 1 }, DIAG) },
    { pdf: 45, id: 'compare', noTrace: 1, lines: [{ m: 'thinking', t: I18n.plain('lsCompare') }], f: Object.assign({ split: 1, halves: 1 }, DIAG) },
    // (the segments are dragged, never tapped, into the boxes; each equation is checked as soon as both its boxes are
    // filled. Right: as the line says it, each equation's boxes merge into its tag - OA = OC on "same", OB = OD on
    // "equal" - the tags the next screen keeps)
    Object.assign({ pdf: '46-47', id: 'matchSeg', noTrace: 1, onlyCues: 1, lines: [{ m: 'curious', t: I18n.plain('lsMatchSeg') }],
      ok: I18n.plain('lsMatchSegOk'), // (its four colours stay: they become two as the next screen opens)
      okCues: [{ at: 'same', boxMerge: 1 }, { at: 'equal', boxMerge: 2 }],
      fill: { match: 1, blanks: [{ id: 'p1a', pair: 1 }, { id: 'p1b', pair: 1 }, { id: 'p2a', pair: 2 }, { id: 'p2b', pair: 2 }], tiles: ['OA', 'OB', 'OC', 'OD'],
        pairs: [['OA', 'OC'], ['OB', 'OD']], fb: { any: I18n.plain('lsMatchSegFb') } },
      f: Object.assign({ split: 1, halves: 1 }, DIAG) }),
    // (in time with its line, once the shape has settled from screen 45: on "diagonal" each diagonal takes one colour,
    // its colour running from its corner through O to the other - AC, then BD; on "equal parts" their lengths become
    // their equal marks - AO's and OC's, then BO's and OD's. Screen 45's two tags stay)
    { pdf: 48, id: 'bisectEq', noTrace: 1, onlyCues: 1, voiceDelay: 800, enterChips: [{ t: 'OA = OC', k: 'gold', pop: 1 }, { t: 'OB = OD', k: 'gold', pop: 1 }],
      lines: [{ cues: [{ at: 'diagonal', steps: [{ paint: 'A' }, { paint: 'B' }], gap: 1150 }, { at: 'equal', steps: [{ toMarks: 'A' }, { toMarks: 'B' }], gap: 850 }], t: I18n.plain('lsBisectEq') }],
      f: Object.assign({ split: 1, halves: 1, hticks: 1, toMarks: 1, pairSeq: 1 }, DIAG) },
    { pdf: 49, id: 'bisect', noTrace: 1, lines: [{ m: 'happy', t: I18n.plain('lsBisect'), pulse: 1, pulseAt: 'bisect',
      cues: [{ at: 'bisect', merge: { from: ['OA = OC', 'OB = OD'], into: { t: I18n.plain('lsDiagonalsBisect'), k: 'name' } } }] }], // (screen 48's two tags merge into it)
      f: Object.assign({ halfPairs: 1, hticks: 1 }, DIAG) },

    // ---------- Checkpoint 3 · Let's use the diagonals! (page 50) ----------
    Object.assign({ pdf: 50, id: 'cp3a', cpTitle: 'Checkpoint 3 · Find the Other Half',
      lines: [{ m: 'curious', t: I18n.plain('lsCp3a') }],
      ok: I18n.plain('lsCp3aOk'),
      fig: { P: FIG_SIDES, diag: 1, halves: { A: '6 cm' } },
      opts: [
        { id: '3', t: '3 cm', fb: I18n.plain('lsCp3aFb3') },
        { id: '6', t: '6 cm', ok: true },
        { id: '12', t: '12 cm', fb: I18n.plain('lsCp3aFb12') }
      ] }, CP),
    Object.assign({ pdf: 50, id: 'cp3b', cpTitle: 'Checkpoint 3 · Find Both Halves',
      lines: [{ m: 'curious', t: I18n.plain('lsCp3b') }],
      ok: I18n.plain('lsCp3bOk'),
      fig: { P: FIG_HALVES, diag: 1, halves: { A: '5 cm', B: '3 cm' } },
      fill: { blanks: [{ id: 'OC', pre: 'OC =', post: 'cm', ans: '5' }, { id: 'OD', pre: 'OD =', post: 'cm', ans: '3' }], tiles: ['3', '5', '6', '10'],
        fb: { OC: I18n.plain('lsCp3bFbOC'), OD: I18n.plain('lsCp3bFbOD') } } }, CP), // (each box its own tip)
    // the two true statements are the whole idea: AO = OC and BO = OD is what "the diagonals bisect each other" means,
    // so it is not a fifth answer to pick - it is what the right answer shows. Each right pick lights its diagonal; once
    // both are found the equal halves take their pair colours and, as Swiftee says "bisect", fold onto each other about O
    Object.assign({ pdf: 50, id: 'cp3c', multi: 1, cpTitle: 'Checkpoint 3 · Choose the Correct Statements',
      lines: [{ m: 'curious', t: I18n.plain('lsCp3c') }],
      ok: I18n.plain('lsCp3cOk'),
      // (the halves' equal ticks would be the answer: they come with it, okF)
      // (in time with the praise, as screen 48's marks come with its words: as "AO = OC" is said (one spoken phrase,
      // 1.9 s) AO is traced, then OC a second later as its name comes, and their equal marks follow; the same for
      // "BO = OD"; "diagonals" brings both diagonals forward by itself. A right pick only turns green: the tracing is
      // the praise's, once, with its words)
      okF: { halfPairs: 1, hticks: 1 }, okCues: [{ at: 'AO = OC,', pairTrace: 'A', gap: 1000 }, { at: 'BO = OD,', pairTrace: 'B', gap: 1000 }],
      // (hticks wait for the praise's tracing: toMarks)
      fig: { P: FIG_SIDES, diag: 1, hticks: 1, toMarks: 1 },
      opts: [
        { id: 'aooc', t: 'AO = OC', ok: true },
        { id: 'bood', t: 'BO = OD', ok: true },
        { id: 'aobo', t: 'AO = BO', fb: I18n.plain('lsCp3cFbAOBO') },
        { id: 'acbd', t: 'AC = BD', fb: I18n.plain('lsCp3cFbACBD') }
      ] }, CP),

    // ---------- Part 9 · recall (pages 51-52): the summary, as Fishing Frenzy's (js/summary.js): one glassy bubble per
    // idea in the middle of the card, Swiftee peeking over it to say its line (the recap clips), the bubbles gathering
    // into albums at the sides, then Next (in the journey, the hand-over to the fishing) ----------
    { pdf: '51-52', id: 'recap', summary: 1, lines: [{ m: 'happy', t: I18n.plain('lsRecap') }] },
    // (the lesson on its own: its results card; in the journey the recap's Next hands over before this screen)
    { id: 'end', end: 1, lines: [{ m: 'celebrating', t: I18n.plain('lsEnd') }] }
  ]
};
