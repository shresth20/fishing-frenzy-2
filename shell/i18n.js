// =====================================================================
// I18N - every word the journey shows, by key, in the player's language (locales/locales.json).
// Loaded by every page (index.html, parts/fishing, parts/lesson) right after locales/locales.js, before any other
// script that shows text:
//   <script src="locales/locales.js"></script> <script src="shell/i18n.js"></script>   (../../ from a part)
//
// The language: ?lan=<code> on the page's address (?lang= works too), e.g. index.html?lan=hi; the journey passes it
// on to its parts. A language not in locales.json plays in its defaultLanguage (English).
//
//   T(key, vars)          the text in the player's language; {name} placeholders filled from vars. A key missing in that
//                         language falls back to English; a key missing everywhere shows the key itself (fix the JSON).
//   data-i18n="key"       (HTML) the element's text; data-i18n-aria-label / -title / -alt the attribute; vars as JSON in
//                         data-i18n-vars. Applied as the page is parsed (I18n.applyStatic).
//   I18n.source(key)      the English, as written (the fishing game's lines keep their *stress* marks).
//   I18n.plain(key)       the English without its * marks: what the lesson's data holds.
//   I18n.tr(english)      English the game holds (a line it says, a card, an answer) in the player's language, as
//                         written (* marks kept, for the line renderers); English that is not a key (AB ∥ CD, 6 cm)
//                         comes back as it is, its unit (cm) in the player's language.
//   I18n.label(english)   I18n.tr without the * marks: for buttons, cards and answers.
//
// Why the game keeps its English: each line is found by its English text (its English clip in
// parts/fishing/src/voice-data.js and parts/lesson/js/vo_lines.js, its key with I18n.keyOf) and the lesson's cues fire on
// English words. So the data holds I18n.source / I18n.plain and only the screen shows I18n.tr; in English every one of
// these returns exactly what it was given, so nothing changes there.
//
// In locales.json a *starred* word is a key word: the fishing game's stressed words (they pop bigger), and in the lesson's
// lines the words shown in gold. A translation stars its own key words; \n is a line break in Swiftee's bubble.
//
// Voice-over in the player's language: a language recorded in full has its clips in assets/VO-<LANG>/<key>.ogg at the
// repository's root and its map in assets/VO-<LANG>/vo_<lang>.js (window.VO_LANGS, made by tools/vo_lang_build.js), which
// the parts load. A line's voice key is its text key.
//   I18n.voiced           true when the player's language has its own recordings (Hindi: ?lan=hi); the parts then play
//                         them instead of the English (one voice: a line with no clip in it shows its words silently)
//   I18n.keyOf(english)   the key of a line the game holds in English (stars, line breaks and case aside)
//   I18n.voiceClip(key)   { url, seconds, times (each shown word's start, s), end (of its speech, s) }, or null
//   I18n.voice(key)       the clip's address; I18n.say(key) plays it.
//
// Opened from disk (file://) the browser will not fetch locales.json, so the pages load locales/locales.js, made from
// it. After every edit of locales/locales.json, run at the repository's root:
//   node -e "const f=require('fs');f.writeFileSync('locales/locales.js','// GENERATED from locales/locales.json by the command in shell/i18n.js - do not edit by hand\nwindow.I18N_DATA = '+JSON.stringify(JSON.parse(f.readFileSync('locales/locales.json','utf8')),null,2)+';\n')"
// =====================================================================
(function () {
  'use strict';
  var SOURCE = 'en'; // the language the game's own data, voice-over and cues are in
  var DATA = window.I18N_DATA || null;
  var me = document.currentScript;
  var here = (me && me.src) || location.href;

  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
  var asked = params ? (params.get('lan') || params.get('lang') || '') : '';

  var lang = SOURCE, cur = {}, en = {};
  var exact = new Map(), plainIdx = new Map(), looseIdx = new Map();
  var warned = {};
  function warnOnce(kind, key) {
    if (warned[kind + key]) return;
    warned[kind + key] = 1;
    try { console.warn('[i18n] ' + (kind === 'missing' ? 'no text for key "' + key + '" in locales.json' : '"' + key + '" has no ' + lang + ' text yet: English shown')); } catch (e) { /* no console */ }
  }
  // a line's English as the parts hold it for their voice (keyOf): no stars, one space for each run of spaces and breaks,
  // in lower case (the fishing game's voice keys are), ... for … and ' for ’
  function loose(s) { return String(s).replace(/\*/g, '').replace(/…/g, '...').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase(); }
  // the language asked for, if locales.json has it (hi-IN -> hi), else the default
  function pick(code) {
    if (!DATA) return SOURCE;
    var langs = Object.keys(DATA).filter(function (k) { return DATA[k] && typeof DATA[k] === 'object' && !Array.isArray(DATA[k]) && k !== 'languageLabels'; });
    var want = String(code || '').trim().toLowerCase();
    if (want && langs.indexOf(want) < 0 && langs.indexOf(want.split(/[-_]/)[0]) >= 0) want = want.split(/[-_]/)[0];
    if (want && langs.indexOf(want) >= 0) return want;
    var def = DATA.defaultLanguage && langs.indexOf(DATA.defaultLanguage) >= 0 ? DATA.defaultLanguage : SOURCE;
    if (want) { try { console.info('[i18n] no "' + want + '" in locales.json: playing in ' + def); } catch (e) { /* no console */ } }
    return def;
  }
  function index() {
    lang = pick(asked);
    en = (DATA && DATA[SOURCE]) || {};
    cur = (DATA && DATA[lang]) || en;
    exact = new Map(); plainIdx = new Map(); looseIdx = new Map();
    Object.keys(en).forEach(function (k) { var v = en[k]; if (typeof v === 'string' && v && !exact.has(v)) exact.set(v, k); });
    Object.keys(en).forEach(function (k) { var v = en[k]; if (typeof v === 'string' && v && !looseIdx.has(loose(v))) looseIdx.set(loose(v), k); });
    Object.keys(en).forEach(function (k) {
      var v = en[k];
      if (typeof v !== 'string') return;
      var p = v.replace(/\*/g, '');
      if (p && p !== v && !exact.has(p) && !plainIdx.has(p)) plainIdx.set(p, k);
    });
    try { document.documentElement.lang = lang === 'od' ? 'or' : lang; } catch (e) { /* no document */ }
  }

  // a key's value in one language's table: 'key', or 'key.0' for an item of a list
  function look(table, key) {
    if (!table) return undefined;
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    var dot = key.lastIndexOf('.');
    if (dot > 0) {
      var list = table[key.slice(0, dot)], i = key.slice(dot + 1);
      if (Array.isArray(list) && /^\d+$/.test(i)) return list[+i];
    }
    return undefined;
  }
  function fill(s, vars) {
    if (!vars || typeof s !== 'string') return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; });
  }
  function t(key, vars) {
    key = String(key);
    var s = look(cur, key);
    if (s === undefined && cur !== en) { s = look(en, key); if (s !== undefined) warnOnce('fallback', key); }
    if (s === undefined) { warnOnce('missing', key); return key; }
    return fill(s, vars);
  }
  function source(key, vars) {
    var s = look(en, String(key));
    if (s === undefined) { warnOnce('missing', key); return String(key); }
    return fill(s, vars);
  }
  function plain(key, vars) { var s = source(key, vars); return typeof s === 'string' ? s.replace(/\*/g, '') : s; }
  // the unit inside a measure ("6 cm", "? cm") in the player's language
  function units(text) {
    if (lang === SOURCE || typeof text !== 'string' || text.indexOf('cm') < 0) return text;
    var u = t('unitCm');
    return u === 'cm' ? text : text.replace(/(^|[^A-Za-z])cm(?![A-Za-z])/g, function (m, pre) { return pre + u; });
  }
  function tr(text) {
    if (lang === SOURCE || typeof text !== 'string' || !text) return text;
    var k = exact.get(text) || plainIdx.get(text);
    return k ? t(k) : units(text);
  }
  function label(text) {
    if (lang === SOURCE || typeof text !== 'string') return text;
    var s = tr(text);
    return typeof s === 'string' ? s.replace(/\*/g, '') : s;
  }

  // the page's own words (data-i18n, data-i18n-aria-label, -title, -alt; vars in data-i18n-vars)
  var ATTRS = ['aria-label', 'title', 'alt'];
  function applyStatic(root) {
    if (!DATA || typeof document === 'undefined') return;
    root = root || document;
    var sel = '[data-i18n]' + ATTRS.map(function (a) { return ',[data-i18n-' + a + ']'; }).join('');
    var els = Array.prototype.slice.call(root.querySelectorAll(sel));
    if (root.matches && root.matches(sel)) els.unshift(root);
    els.forEach(function (el) {
      var vars = null;
      var raw = el.getAttribute('data-i18n-vars');
      if (raw) { try { vars = JSON.parse(raw); } catch (e) { vars = null; } }
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = String(t(key, vars)).replace(/\*/g, '');
      ATTRS.forEach(function (a) {
        var k = el.getAttribute('data-i18n-' + a);
        if (k) el.setAttribute(a, String(t(k, vars)).replace(/\*/g, ''));
      });
    });
  }

  // voice-over by key in the player's language (assets/VO-<LANG>/, its map in window.VO_LANGS: see the top)
  function recorded() {
    var all = typeof window !== 'undefined' && window.VO_LANGS;
    var v = lang !== SOURCE && all && all[lang];
    return v && v.clips ? v : null;
  }
  function keyOf(english) { return english == null ? undefined : looseIdx.get(loose(english)); }
  function voice(key) {
    var v = recorded();
    var dir = v ? v.dir : 'assets/VO-' + lang.toUpperCase() + '/', ext = v ? v.ext || 'ogg' : 'ogg';
    return new URL('../' + dir + key + '.' + ext, here).href; // (the repository's root: shell/../)
  }
  function voiceClip(key) {
    var v = recorded(), c = v && key != null && Object.prototype.hasOwnProperty.call(v.clips, key) ? v.clips[key] : null;
    return c ? { key: String(key), url: voice(key), seconds: c[0], times: c[1] || null, end: c[2] || 0 } : null;
  }
  function say(key) {
    try { var a = new Audio(voice(key)); var p = a.play(); if (p && p.catch) p.catch(function () { /* no clip */ }); return a; } catch (e) { return null; }
  }
  // the words are loaded with the page (locales/locales.js); without it, locales.json is fetched first
  function load(cb) {
    var done = function () { if (typeof cb === 'function') cb(); };
    if (DATA || typeof fetch !== 'function') { done(); return; }
    fetch(new URL('../locales/locales.json', here).href).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { DATA = d; index(); } }).catch(function () { /* stays as it is */ }).then(done);
  }

  index();
  window.I18n = {
    get lang() { return lang; },
    get languages() { return DATA && Array.isArray(DATA.supportedLanguages) ? DATA.supportedLanguages.slice() : [SOURCE]; },
    get labels() { return (DATA && DATA.languageLabels) || {}; },
    source: source, plain: plain, tr: tr, label: label, units: units,
    t: t, has: function (key) { return look(cur, String(key)) !== undefined; },
    applyStatic: applyStatic, load: load, voice: voice, say: say,
    get voiced() { return !!recorded(); }, keyOf: keyOf, voiceClip: voiceClip,
  };
  window.T = t;

  // the page's own words: what is parsed by now, and the rest once the page is parsed (before its deferred scripts run)
  applyStatic();
  if (document.readyState === 'loading') {
    var once = function () {
      if (document.readyState === 'loading') return;
      document.removeEventListener('readystatechange', once);
      document.removeEventListener('DOMContentLoaded', once);
      applyStatic();
    };
    document.addEventListener('readystatechange', once);
    document.addEventListener('DOMContentLoaded', once);
  }
})();
