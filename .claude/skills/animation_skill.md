---
name: animation-skill
description: Rules for every animation and transition in the offline maths learning game (HTML/CSS/JS). Always apply when adding, editing, or reviewing any motion, reveal, or UI feedback.
---

# Animation Skill

## Libraries (offline only)
- Bundle **GSAP** locally (`/libs/gsap.min.js`). No CDN links, ever.
- CSS transitions for buttons/hover. SVG for maths visuals. GSAP timelines for concept explanations.

## Rules
1. Animate only `transform` and `opacity`. Never `width`, `height`, `top`, `left`, `margin`.
2. JS motion uses `requestAnimationFrame` or GSAP, time-based (deltaTime), never `setInterval`.
3. Easing: ease-out for entering, ease-in for leaving, `back.out` / `elastic` for playful pops.
4. Durations: 150–300ms UI feedback, 400–800ms concept reveals.
5. Choreograph concept steps with one GSAP timeline; stagger groups by 0.05–0.15s.
6. Precompute positions before animating; keep heavy logic out of the loop.
7. Add `will-change: transform` only during animation, then remove it.
8. Every concept animation has a **Skip** button and honours `prefers-reduced-motion`.
9. Kill/clean up timelines when a scene unmounts.
10. Test on a low-end Android device; target 60fps.
