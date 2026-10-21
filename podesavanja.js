/*
 * Podešavanja za cijelu aplikaciju: tema (svijetla/tamna) i pismo
 * (latinica/ćirilica). Učitava se u <head>, da tema bude postavljena prije
 * prvog iscrtavanja. Tekstovi aplikacije pisani su latinicom; za ćirilicu se
 * preslovljava sve što je na ekranu, kao i sve što app.js kasnije upiše.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'rakija.tema.v1';
  var SCRIPT_KEY = 'rakija.pismo.v1';
  var THEME_COLORS = { light: '#FBF6EF', dark: '#17110C' };

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* radi i bez čuvanja */ }
  }

  function markToggle(id, attr, value) {
    var group = document.getElementById(id);
    if (!group) return;
    group.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute(attr) === value));
    });
  }

  /* ---------- Tema ---------- */

  // Dok se ne izabere, tema prati podešavanje telefona.
  var themeChoice = load(THEME_KEY);
  if (themeChoice !== 'light' && themeChoice !== 'dark') themeChoice = null;
  var systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function theme() {
    return themeChoice || (systemDark && systemDark.matches ? 'dark' : 'light');
  }

  function applyTheme() {
    var t = theme();
    root.setAttribute('data-theme', t);
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute('content', THEME_COLORS[t]);
    });
    // Android aplikacija (APK) po ovome boji statusnu traku.
    if (window.RakiJAAndroid) window.RakiJAAndroid.setDarkTheme(t === 'dark');
    markToggle('themeToggle', 'data-theme-choice', t);
  }

  if (systemDark) {
    var onSystemChange = function () { if (!themeChoice) applyTheme(); };
    if (systemDark.addEventListener) systemDark.addEventListener('change', onSystemChange);
    else if (systemDark.addListener) systemDark.addListener(onSystemChange);
  }
  applyTheme();

  /* ---------- Pismo ---------- */

  var LETTERS = {
    a: 'а', b: 'б', c: 'ц', 'č': 'ч', 'ć': 'ћ', d: 'д', 'dž': 'џ', 'đ': 'ђ', e: 'е', f: 'ф',
    g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к', l: 'л', lj: 'љ', m: 'м', n: 'н', nj: 'њ', o: 'о',
    p: 'п', r: 'р', s: 'с', 'š': 'ш', t: 'т', u: 'у', v: 'в', z: 'з', 'ž': 'ж'
  };
  var LETTER_RE = /lj|nj|dž|[a-zčćđšž]/gi;
  // Oznake jedinica, skraćenice i adrese ostaju latinicom i u ćiriličnom tekstu.
  var KEEP_RE = /(https?:\/\/\S+|°Oe|°C|%\s?vol|CO₂|\bOIML\b|\bAPK\b|\bml\b|\bL\b)/;

  function toCyrillic(s) {
    return s.split(KEEP_RE).map(function (part, i) {
      if (i % 2) return part; // neparni dijelovi su ono što je KEEP_RE izdvojio
      return part.replace(LETTER_RE, function (m) {
        var c = LETTERS[m.toLowerCase()];
        if (!c) return m; // q, w, x, y nemaju par
        return m.charAt(0) === m.charAt(0).toLowerCase() ? c : c.toUpperCase();
      });
    }).join('');
  }

  var script = load(SCRIPT_KEY) === 'cyr' ? 'cyr' : 'lat';
  var ATTRS = ['placeholder', 'aria-label', 'title'];
  // [data-raw] je tekst koji ostaje kako je upisan (npr. oznaka kace).
  var SKIP = '[data-raw], script, style';
  // Preslovljeni čvor -> latinični original, za povratak na latinicu.
  var saved = new WeakMap();
  var observer = null;
  var latinTitle;

  // Ćirilica: tijelo je skriveno dok se ne preslovi, da ne bljesne latinica;
  // lang odmah, da se font za ćirilicu počne učitavati.
  if (script === 'cyr') {
    root.classList.add('cyr-pending');
    root.lang = 'sr-Cyrl';
  }

  function skipped(el) { return !el || el.closest(SKIP) !== null; }

  // fn za čvor i sve elemente i tekstove u njemu, osim dijelova koji se preskaču.
  function eachNode(node, fn) {
    if (node.nodeType === 3) { if (!skipped(node.parentElement)) fn(node); return; }
    if (node.nodeType !== 1 || skipped(node)) return;
    fn(node);
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    for (var n = walker.nextNode(); n; n = walker.nextNode()) fn(n);
  }

  function toCyrillicNode(node) {
    if (node.nodeType === 3) {
      var s = saved.get(node);
      if (s && s.cyr === node.nodeValue) return; // već preslovljen
      var lat = node.nodeValue, cyr = toCyrillic(lat);
      if (cyr === lat) { saved.delete(node); return; }
      saved.set(node, { lat: lat, cyr: cyr });
      node.nodeValue = cyr;
      return;
    }
    if (saved.has(node)) return;
    var attrs = null;
    ATTRS.forEach(function (a) {
      var v = node.getAttribute(a);
      if (!v) return;
      attrs = attrs || {};
      attrs[a] = v;
      node.setAttribute(a, toCyrillic(v));
    });
    if (attrs) saved.set(node, attrs);
  }

  function toLatinNode(node) {
    var s = saved.get(node);
    if (!s) return;
    saved.delete(node);
    if (node.nodeType === 3) {
      if (node.nodeValue === s.cyr) node.nodeValue = s.lat;
      return;
    }
    Object.keys(s).forEach(function (a) { node.setAttribute(a, s[a]); });
  }

  // Sve što app.js upiše (rezultati, istorija, poruke) preslovi se prije iscrtavanja.
  function onMutations(records) {
    records.forEach(function (r) {
      if (r.type === 'characterData') eachNode(r.target, toCyrillicNode);
      else r.addedNodes.forEach(function (n) { eachNode(n, toCyrillicNode); });
    });
  }

  function applyScript() {
    root.lang = script === 'cyr' ? 'sr-Cyrl' : 'sr-Latn';
    markToggle('scriptToggle', 'data-script', script);
    if (latinTitle === undefined) latinTitle = document.title;
    if (script === 'cyr') {
      eachNode(document.body, toCyrillicNode);
      document.title = toCyrillic(latinTitle);
      if (!observer) {
        observer = new MutationObserver(onMutations);
        observer.observe(document.body, { childList: true, characterData: true, subtree: true });
      }
    } else {
      if (observer) { observer.disconnect(); observer = null; }
      eachNode(document.body, toLatinNode);
      document.title = latinTitle;
    }
  }

  function init() {
    try {
      document.getElementById('themeToggle').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-theme-choice]');
        if (!b) return;
        themeChoice = b.getAttribute('data-theme-choice');
        save(THEME_KEY, themeChoice);
        applyTheme();
      });
      document.getElementById('scriptToggle').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-script]');
        if (!b || b.getAttribute('data-script') === script) return;
        script = b.getAttribute('data-script');
        save(SCRIPT_KEY, script);
        applyScript();
      });
      markToggle('themeToggle', 'data-theme-choice', theme());
      applyScript();
    } finally {
      root.classList.remove('cyr-pending');
    }
  }

  // DOMContentLoaded dolazi poslije app.js, pa je tada sav početni tekst na ekranu.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Pismo = {
    // Za tekst koji ne ide kroz stranicu (npr. confirm).
    text: function (s) { return script === 'cyr' ? toCyrillic(s) : s; }
  };
})();
