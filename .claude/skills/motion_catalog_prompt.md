# Motion & Effects Catalog — Implementation Prompt

Paste everything below into your agent (CLAUDE.md / .cursorrules / system prompt).

---

You are implementing the motion, animation and sound layer for an **offline maths learning game** (plain HTML/CSS/JS, GSAP bundled locally at `/libs/gsap.min.js`). Follow `animation_skill.md` and `/js/motion.js` — never hard-code timings or easings.

## Audience & tone — read this first

Target: **Grade 7–10 students (ages 12–16).** The game must feel **sharp, modern and confident** — like a good science app, not a kids' cartoon.

Do this:
- Precise, fast, purposeful motion. Ease-out for almost everything.
- Subtle overshoot only (`back.out(1.2)` max). No big bounces, no wobble, no elastic.
- Muted, high-contrast palette (deep navy / slate / off-white) with one or two accent colours. Colour changes are smooth tints, not rainbow flashes.
- Clean geometric shapes, thin strokes (1.5–2px), monospace or geometric sans for numbers.
- Sound: short, soft, low-volume UI clicks and tones. No cartoon boings, cheers or applause.
- Celebrate success with **restraint**: a glow, a checkmark drawing itself, a short chime. No confetti explosions, no dancing mascots.

Never do this: rubber-band bounces, spinning stars, emoji, bright primary colours everywhere, sparkles, "Yay!" copy, slow theatrical reveals.

## Global motion system (in `/js/motion.js`)

```
DURATION:  INSTANT 0.08 | FAST 0.15 | NORMAL 0.25 | SLOW 0.4 | REVEAL 0.6
EASE:      OUT "power3.out" | IN "power2.in" | INOUT "power2.inOut" | POP "back.out(1.2)" | SNAP "expo.out"
STAGGER:   0.05 (UI lists) | 0.08 (concept steps)
```
All durations scale to ~0 when `prefers-reduced-motion` is set. Every helper below lives in `motion.js` and is the **only** way animations are created.

## Catalog — implement each as a named helper

### 1. Buttons & controls
| Effect | Spec | Helper |
|---|---|---|
| Appear | fade 0→1 + translateY 8px→0, `FAST`, `OUT`; stagger `0.05` for groups | `enter(el)` |
| Disappear | fade 1→0 + translateY 0→-6px + scale 1→0.98, `FAST`, `IN`; remove from DOM on complete | `exit(el)` |
| Hover (pointer devices) | background tint shift + translateY -1px, `INSTANT` | CSS transition |
| Press | scale 1→0.97 on pointerdown, back to 1 on pointerup, `INSTANT` | `press(el)` |
| Disabled → enabled | opacity 0.4→1 + subtle border colour shift, `NORMAL` | `enable(el)` |
| Focus ring | 2px accent outline fades in, `INSTANT` | CSS `:focus-visible` |
| Toggle / segmented control | sliding indicator pill moves with `SNAP`, `NORMAL` | `slideIndicator(el, x)` |

### 2. Text & numbers
| Effect | Spec | Helper |
|---|---|---|
| Typewriter print | reveal characters at 25–35ms each with a thin blinking caret; skippable; used only for the key sentence of an explanation, not paragraphs | `typeText(el, text)` |
| Line-by-line reveal | each line fades + translateY 6px→0, stagger `0.08`, `OUT` | `revealLines(container)` |
| Number change | tween the numeric value (`snap: 1` or 2 decimals), `NORMAL`, `OUT`; brief accent tint during change | `countTo(el, value)` |
| Equation step | old term fades out while new term fades in **in the same position**; highlight the changed term for 0.6s | `swapTerm(oldEl, newEl)` |
| Highlight term | soft background sweep left→right behind the text, `NORMAL` | `highlight(el)` |
| Emphasis pulse | scale 1→1.04→1, `NORMAL`, `INOUT`, once only | `pulse(el)` |

### 3. Shapes & diagrams (SVG)
| Effect | Spec | Helper |
|---|---|---|
| Move | translate with `OUT`, `NORMAL`–`SLOW`; leave a faint motion trail for vectors only | `moveTo(el, x, y)` |
| Resize | scale from a stated `transformOrigin` (centre or a vertex), `NORMAL`, `OUT` | `scaleTo(el, sx, sy, origin)` |
| Rotate | rotate around a stated origin with `INOUT`; show the angle arc drawing in sync | `rotateTo(el, deg, origin)` |
| Morph shape | MorphSVG between paths (triangle→square, etc.), `SLOW`, `INOUT` | `morph(el, toPath)` |
| Draw line / path | DrawSVG 0→100% along the stroke, speed ~600px/s capped at `REVEAL`; pen-tip dot leads the line | `drawPath(el)` |
| Undraw | reverse of draw, `FAST` | `undrawPath(el)` |
| Fill area | clip-path or opacity fill sweeping in the direction that explains the concept (e.g. left→right for integration), `SLOW` | `fillArea(el, direction)` |
| Split / group | items translate apart into groups with stagger `0.08`; connecting brackets draw after items settle | `splitInto(items, groups)` |
| Snap to grid | drag freely; on release tween to nearest grid point with `SNAP`, `FAST`, no bounce | `snapTo(el, x, y)` |
| Dashed guide lines | stroke-dashoffset scrolls slowly (2s loop) to show a construction line; stops when confirmed | `guideLine(el)` |
| Point plotting | dot scales 0→1 with `POP`, `FAST`; coordinates label fades in after | `plotPoint(el, label)` |
| Axis / grid appear | axes draw first (`drawPath`), then grid lines fade in staggered from origin outward | `revealGraph(svg)` |

### 4. Appear / disappear (cards, panels, modals)
| Effect | Spec | Helper |
|---|---|---|
| Card enter | fade + translateY 12px→0 + scale 0.98→1, `NORMAL`, `OUT` | `enter(el)` |
| Card exit | fade + scale 1→0.98, `FAST`, `IN` | `exit(el)` |
| Panel slide | translateX from edge, `NORMAL`, `OUT`; backdrop fades to 40% black | `slideIn(el, side)` |
| Modal | backdrop fade `FAST`; dialog scale 0.96→1 + fade, `NORMAL`, `OUT` | `openModal(el)` |
| Cross-fade content | outgoing fades `FAST`, incoming fades `NORMAL` starting at 50% of outgoing | `crossfade(outEl, inEl)` |
| Layout change | use Flip plugin so items glide to new positions, `NORMAL`, `INOUT` | `relayout(container, fn)` |
| Skeleton → content | shimmer stops, content cross-fades in | `resolve(skeleton, content)` |

### 5. Feedback states
| Effect | Spec | Helper |
|---|---|---|
| Correct | border/glow to success colour (teal-green), checkmark path draws in `FAST`, single soft chime | `correct(el)` |
| Incorrect | horizontal shake ±4px, 3 cycles, `NORMAL`; border tints to warning (amber, not red); short low tone | `incorrect(el)` |
| Hint | hint text slides down from beneath the question, `NORMAL`; related diagram part pulses once | `showHint(el, target)` |
| Progress bar | width via `scaleX` from left, `SLOW`, `OUT`; fill colour brightens slightly at 100% | `progress(el, pct)` |
| Streak / score | `countTo` + one `pulse`; no fireworks | `scoreUpdate(el, value)` |
| Lesson complete | checkmark draws, summary lines `revealLines`, subtle radial gradient bloom behind (opacity 0→0.15→0, 1.2s), one chime | `complete(screen)` |
| Loading / thinking | three dots opacity-cycling, or thin progress line; never a spinner cartoon | `loading(el)` |

### 6. Scene & background
| Effect | Spec | Helper |
|---|---|---|
| Scene transition | current scene fades + translateY -8px `FAST`; next scene `enter` `NORMAL`; shared elements (title, progress) stay fixed | `transition(fromScene, toScene)` |
| Background colour change | tween CSS variable `--bg` over `SLOW`, `INOUT`; text colour tweens in parallel to keep contrast | `setTheme(vars)` |
| Topic accent shift | accent colour variable tweens on topic change, `SLOW` | `setAccent(color)` |
| Ambient grid | faint dot/grid pattern drifts 0.5px/s; pauses during interactions | CSS keyframes |
| Focus mode | non-active regions dim to 30% opacity, `NORMAL` | `focus(el)` |
| Parallax (subtle) | background layer moves 5% of foreground on scene change; never on scroll | inside `transition` |

### 7. Interaction (drag, slider, tap)
| Effect | Spec | Helper |
|---|---|---|
| Drag start | element lifts: scale 1.03 + shadow deepens, `INSTANT` | `liftStart(el)` |
| Dragging | follows pointer at 1:1 with **no** tween (zero latency); live-bound values update every frame | pointer events |
| Drag end | `snapTo` valid target with `SNAP`; invalid → return to origin with `OUT`, `NORMAL` | `liftEnd(el, target)` |
| Slider | thumb follows pointer 1:1; value label and linked diagram update live; tick marks light up as passed | `bindSlider(el, fn)` |
| Tap on diagram | ripple ring expands 0→24px and fades, `FAST`; selected part outline brightens | `tapRipple(x, y)` |
| Hover on graph | vertical guide line + coordinate tooltip follow cursor, no tween | pointer events |

### 8. Sound (Web Audio, files in `/assets/sfx/`, all ≤ 1s, normalised to -12dB)
| Event | Sound |
|---|---|
| Button press | soft click, 40ms |
| Toggle / snap | short tick, 60ms |
| Correct | two-note ascending soft chime (C→E), 300ms |
| Incorrect | single muted low tone, 200ms |
| Reveal step | very quiet swish, 150ms (optional; off by default) |
| Lesson complete | three-note chime, 600ms |
| Draw line | faint pencil scratch, looped only while drawing (optional) |

Rules: global mute toggle persisted in localStorage; sounds never overlap the same event within 100ms; no background music.

## Implementation rules
1. Build `motion.js` first with every helper above, each accepting a GSAP `vars` override object as the last argument.
2. Concept explanations are one `gsap.timeline()` composed from these helpers, with a **Skip** control that calls `tl.progress(1)`.
3. Every helper returns the tween/timeline so callers can chain or kill it.
4. Interactive SVGs bind directly to pointer events; only the release is tweened.
5. Only `transform`, `opacity`, `stroke-dashoffset`, `fill`/`stroke` colour and CSS variables are animated. Layout changes go through Flip.
6. Add `will-change` at tween start, remove `onComplete`.
7. Kill all timelines and listeners in each scene's `teardown()`.

## Definition of done for any motion task
State explicitly:
- [ ] Used only `motion.js` helpers / constants
- [ ] Nothing bouncy, sparkly or cartoonish — passes the "would a 15-year-old find this cringe?" test
- [ ] Skip control on concept timelines
- [ ] Reduced-motion and mute respected
- [ ] No CDN / network URLs
- [ ] Teardown implemented

If a request conflicts with this document or `animation_skill.md`, follow them and flag the conflict.
