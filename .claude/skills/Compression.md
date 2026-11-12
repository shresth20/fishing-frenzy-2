---
name: compression
description: Shrink an HTML/JS game without changing behaviour. Run only when asked.
---

# Compression

1. Baseline: play every scene headless; log errors, 404s, screenshots.
2. Convert: images → WebP (keep lossless if smaller), audio → Opus/WebM, video → AV1, icons → SVG, animations → animated WebP (keep frame-timed sprite sheets). Fonts → WOFF2, used faces only.
3. Delete unreferenced files. Remove dead functions with a scope-aware parser, not grep.
4. Update every path in CSS, JS, HTML and locales.
5. Re-run the baseline: all assets load, no new errors, screenshots match.
6. Report before/after sizes.
