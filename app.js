(function () {
  'use strict';

  /* ---------- Podaci iz uputstva proizvođača indikatora vrenja ---------- */

  // Indikator je baždaren na 20 °C; ±0,2 °Oe za svaki 1 °C odstupanja.
  var REF_TEMP = 20;
  var OE_PER_DEGREE = 0.2;
  var SCALE_MAX = 40; // skala indikatora 0–40 °Oe
  var TABLE_FROM = 10;
  var TABLE_TO = 30;

  // Vrenje je završeno kada je vrijednost u ovim intervalima (°Oe).
  var FRUITS = [
    { id: 'sljiva', name: 'Šljiva', za: 'šljivu', min: 16, max: 20 },
    { id: 'jabuka', name: 'Jabuka', za: 'jabuku', min: 4, max: 12 },
    { id: 'kruska', name: 'Kruška', za: 'krušku', min: 6, max: 16 },
    { id: 'viljamovka', name: 'Viljamovka', za: 'viljamovku', min: 10, max: 16 },
    { id: 'tresnja', name: 'Trešnja', za: 'trešnju', min: 12, max: 20 },
    { id: 'malina', name: 'Malina', za: 'malinu', min: 4, max: 8 },
    { id: 'ostalo', name: 'Ostalo', za: 'ostalo voće', min: null, max: null }
  ];
  // Za ostalo voće sajt navodi iskustvenu vrijednost oko 8 °Oe.
  var GENERIC_END = 8;
  // Razlika manja od ovoga između dva mjerenja = "bez promjene".
  var STABLE_DELTA = 0.5;

  var STORE_KEY = 'rakija.mjerenja.v1';
  var PREFS_KEY = 'rakija.prefs.v1';

  /* ---------- Pomoćne funkcije ---------- */

  function $(id) { return document.getElementById(id); }

  function correction(temp) { return OE_PER_DEGREE * (temp - REF_TEMP); }

  function round1(n) { return Math.round(n * 10) / 10; }

  // 12.5 -> "12,5"; -1 -> "−1,0"
  function fmt(n) {
    var r = round1(n);
    if (r === 0) r = 0; // bez "-0"
    return r.toFixed(1).replace('.', ',').replace('-', '−');
  }

  function fmtSigned(n) {
    var r = round1(n);
    if (r === 0) return '±0,0';
    return (r > 0 ? '+' : '−') + fmt(Math.abs(r));
  }

  // Vrijednost za polje za unos: bez suvišnog ",0".
  function fmtInput(n) {
    return String(round1(n)).replace('.', ',').replace('-', '−');
  }

  // Prihvata "14,5", "14.5", "−2"; prazno = null, besmislica = NaN.
  function parseNum(s) {
    s = String(s).trim().replace(',', '.').replace('−', '-');
    if (s === '') return null;
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
    return Number(s);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '. ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fruitById(id) {
    for (var i = 0; i < FRUITS.length; i++) if (FRUITS[i].id === id) return FRUITS[i];
    return FRUITS[0];
  }

  function rangeText(f) {
    // ⁠ (word joiner) drži "4–12" u istom redu.
    return nb(f.min === null ? '≈ ' + GENERIC_END + ' °Oe' : f.min + '⁠–⁠' + f.max + ' °Oe');
  }

  function load(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  // "16 °Oe" ne smije da se prelomi u dva reda.
  function nb(s) { return s.replace(/ °/g, ' °'); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Procjena vrenja ---------- */

  function assess(value, fruit) {
    if (fruit.min === null) {
      return value <= GENERIC_END
        ? { cls: 'ok', title: 'Vjerovatno završeno',
            text: 'Iskustveno se vrenje smatra završenim oko ' + GENERIC_END + ' °Oe. Potvrdi da se vrijednost ne mijenja 2–3 dana.' }
        : { cls: 'warn', title: 'Vjerovatno još traje',
            text: 'Iskustveno se vrenje završava oko ' + GENERIC_END + ' °Oe, ali zavisi od voća. Najsigurnije je kad se vrijednost ne mijenja nekoliko dana.' };
    }
    var where = 'za ' + fruit.za + ' (' + rangeText(fruit) + ')';
    if (value > fruit.max) {
      return { cls: 'warn', title: 'Vrenje još traje',
        text: fmt(value - fruit.max) + ' °Oe iznad gornje granice ' + where + '. Izmjeri ponovo za 2–3 dana.' };
    }
    if (value >= fruit.min) {
      return { cls: 'ok', title: 'Vrenje je završeno',
        text: 'Vrijednost je u intervalu ' + where + '. Potvrdi da se ne mijenja 2–3 dana i da nema mjehurića.' };
    }
    return { cls: 'ok', title: 'Vrenje je završeno',
      text: 'Vrijednost je ispod intervala ' + where + ' — šećer je prevrio.' };
  }

  /* ---------- Stanje ---------- */

  var prefs = load(PREFS_KEY, {});
  var state = {
    fruit: fruitById(prefs.fruit || 'sljiva').id,
    entries: load(STORE_KEY, [])
  };
  if (!Array.isArray(state.entries)) state.entries = [];

  var el = {
    reading: $('reading'), temp: $('temp'), label: $('label'),
    inputHint: $('inputHint'), fruits: $('fruits'),
    resultEmpty: $('resultEmpty'), resultBody: $('resultBody'),
    corrected: $('corrected'), corrText: $('corrText'),
    scaleBand: $('scaleBand'), scaleMark: $('scaleMark'),
    status: $('status'), statusTitle: $('statusTitle'), statusText: $('statusText'),
    saveBtn: $('saveBtn'), historyCard: $('historyCard'), history: $('history'),
    corrTable: $('corrTable'), thValue: $('thValue'), toast: $('toast')
  };

  if (typeof prefs.temp === 'number') el.temp.value = fmtInput(prefs.temp);
  if (prefs.label) el.label.value = prefs.label;

  function readInputs() {
    var r = parseNum(el.reading.value);
    var t = parseNum(el.temp.value);
    var errors = [];
    if (r !== null && (isNaN(r) || r < -10 || r > 60)) errors.push('reading');
    if (t === null || isNaN(t) || t < 0 || t > 45) errors.push('temp');
    return { reading: r, temp: t, errors: errors };
  }

  /* ---------- Prikaz ---------- */

  function renderFruits() {
    el.fruits.innerHTML = FRUITS.map(function (f) {
      return '<button type="button" class="chip" role="radio" data-fruit="' + f.id + '" aria-checked="' +
        (f.id === state.fruit) + '"><b>' + f.name + '</b><small>' + rangeText(f) + '</small></button>';
    }).join('');
  }

  function renderTable(reading, temp) {
    var rows = [];
    var cur = temp === null || isNaN(temp) ? null : Math.round(temp);
    var hasReading = reading !== null && !isNaN(reading);
    el.thValue.textContent = hasReading ? 'Za ' + fmtInput(reading) + ' °Oe' : 'Stvarna vrijednost';
    for (var t = TABLE_FROM; t <= TABLE_TO; t++) {
      var c = correction(t);
      var cls = (t === cur ? 'cur' : '') + (t === REF_TEMP ? ' ref' : '');
      rows.push('<tr class="' + cls.trim() + '"><td>' + t + ' °C</td><td>' + fmtSigned(c) + '</td><td>' +
        (hasReading ? fmt(reading + c) + ' °Oe' : '—') + '</td></tr>');
    }
    el.corrTable.innerHTML = nb(rows.join(''));
  }

  function render() {
    var inp = readInputs();
    el.reading.parentNode.parentNode.classList.toggle('invalid', inp.errors.indexOf('reading') >= 0);
    el.temp.parentNode.parentNode.classList.toggle('invalid', inp.errors.indexOf('temp') >= 0);

    var hint = 'Indikator je baždaren na 20 °C.';
    var hintWarn = false;
    if (inp.errors.indexOf('temp') >= 0) {
      hint = 'Upiši temperaturu uzorka (0–45 °C).'; hintWarn = true;
    } else if (inp.errors.indexOf('reading') >= 0) {
      hint = 'Očitana vrijednost nije ispravna.'; hintWarn = true;
    } else if (inp.temp < TABLE_FROM || inp.temp > TABLE_TO) {
      hint = 'Korekcija je najtačnija blizu 20 °C. Ako možeš, dovedi uzorak na sobnu temperaturu.'; hintWarn = true;
    } else if (inp.reading !== null && inp.reading > SCALE_MAX) {
      hint = 'Skala indikatora ide od 0 do 40 °Oe.'; hintWarn = true;
    }
    el.inputHint.textContent = hint;
    el.inputHint.classList.toggle('warn', hintWarn);

    renderTable(inp.errors.indexOf('reading') >= 0 ? null : inp.reading,
                inp.errors.indexOf('temp') >= 0 ? null : inp.temp);

    var ok = inp.reading !== null && inp.errors.length === 0;
    el.resultEmpty.hidden = ok;
    el.resultBody.hidden = !ok;
    if (!ok) {
      el.resultEmpty.textContent = inp.reading === null
        ? 'Upiši očitanu vrijednost sa indikatora.'
        : 'Provjeri unesene vrijednosti.';
      return;
    }

    var c = correction(inp.temp);
    var value = inp.reading + c;
    var fruit = fruitById(state.fruit);

    el.corrected.textContent = fmt(value);
    var diff = round1(inp.temp - REF_TEMP);
    el.corrText.innerHTML = nb(diff === 0
      ? 'Uzorak je na 20 °C — korekcija nije potrebna.'
      : 'Korekcija <b>' + fmtSigned(c) + ' °Oe</b> · ' + fmtInput(inp.temp) + ' °C je ' +
        fmtInput(Math.abs(diff)) + ' °C ' + (diff > 0 ? 'iznad' : 'ispod') + ' 20 °C');

    var pct = function (v) { return Math.max(0, Math.min(100, v / SCALE_MAX * 100)); };
    el.scaleMark.style.left = pct(value) + '%';
    if (fruit.min === null) {
      el.scaleBand.style.left = '0%';
      el.scaleBand.style.width = pct(GENERIC_END) + '%';
    } else {
      el.scaleBand.style.left = pct(fruit.min) + '%';
      el.scaleBand.style.width = (pct(fruit.max) - pct(fruit.min)) + '%';
    }

    var a = assess(value, fruit);
    el.status.className = 'status ' + a.cls;
    el.statusTitle.textContent = a.title;
    el.statusText.textContent = nb(a.text);
  }

  function renderHistory() {
    var list = state.entries.slice().sort(function (a, b) { return b.ts - a.ts; });
    el.historyCard.hidden = list.length === 0;
    el.history.innerHTML = nb(list.map(function (e, i) {
      // Poređenje sa prethodnim mjerenjem iste kace i istog voća.
      var prev = null;
      for (var j = i + 1; j < list.length; j++) {
        if (list[j].fruit === e.fruit && (list[j].label || '') === (e.label || '')) { prev = list[j]; break; }
      }
      var delta = '';
      if (prev) {
        var d = round1(e.value - prev.value);
        delta = Math.abs(d) < STABLE_DELTA
          ? '<span class="h-delta same">bez promjene</span>'
          : '<span class="h-delta ' + (d < 0 ? 'down' : 'up') + '">' + fmtSigned(d) + '</span>';
      }
      var f = fruitById(e.fruit);
      var meta = fmtDate(e.ts) + ' · ' + f.name + (e.label ? ' · ' + esc(e.label) : '');
      var raw = 'očitano ' + fmtInput(e.reading) + ' °Oe na ' + fmtInput(e.temp) + ' °C';
      return '<li><div class="h-main"><div class="h-top"><span class="h-val">' + fmt(e.value) +
        ' °Oe</span>' + delta + '</div><div class="h-meta">' + meta + '</div><div class="h-meta">' + raw +
        '</div></div><button type="button" class="h-del" data-del="' + e.ts +
        '" aria-label="Obriši mjerenje">×</button></li>';
    }).join(''));
  }

  var toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 1800);
  }

  function savePrefs() {
    var t = parseNum(el.temp.value);
    save(PREFS_KEY, {
      fruit: state.fruit,
      temp: t !== null && !isNaN(t) ? t : REF_TEMP,
      label: el.label.value.trim()
    });
  }

  /* ---------- Događaji ---------- */

  [el.reading, el.temp].forEach(function (input) {
    input.addEventListener('input', function () { render(); savePrefs(); });
    input.addEventListener('focus', function () { input.select(); });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (input === el.reading) el.temp.focus(); else input.blur();
    });
  });
  el.label.addEventListener('change', savePrefs);

  document.querySelectorAll('.step').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = $(btn.getAttribute('data-for'));
      var v = parseNum(input.value);
      if (v === null || isNaN(v)) v = input === el.temp ? REF_TEMP : 0;
      else v += Number(btn.getAttribute('data-step'));
      if (input === el.reading) v = Math.max(0, v);
      input.value = fmtInput(v);
      render();
      savePrefs();
    });
  });

  el.fruits.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    state.fruit = chip.getAttribute('data-fruit');
    el.fruits.querySelectorAll('.chip').forEach(function (c) {
      c.setAttribute('aria-checked', String(c === chip));
    });
    render();
    savePrefs();
  });

  el.saveBtn.addEventListener('click', function () {
    var inp = readInputs();
    if (inp.reading === null || inp.errors.length) return;
    // ts služi i kao ID mjerenja, pa mora biti jedinstven.
    var lastTs = state.entries.reduce(function (m, x) { return Math.max(m, x.ts); }, 0);
    state.entries.push({
      ts: Math.max(Date.now(), lastTs + 1),
      fruit: state.fruit,
      label: el.label.value.trim(),
      reading: inp.reading,
      temp: inp.temp,
      value: round1(inp.reading + correction(inp.temp))
    });
    var stored = save(STORE_KEY, state.entries);
    savePrefs();
    renderHistory();
    toast(stored ? 'Mjerenje sačuvano' : 'Sačuvano samo dok je aplikacija otvorena');
  });

  el.history.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-del]');
    if (!btn) return;
    if (!confirm('Obrisati ovo mjerenje?')) return;
    var ts = Number(btn.getAttribute('data-del'));
    state.entries = state.entries.filter(function (x) { return x.ts !== ts; });
    save(STORE_KEY, state.entries);
    renderHistory();
  });

  /* ---------- Navigacija između ekrana ---------- */

  var screens = { home: $('screen-home'), indikator: $('screen-indikator') };

  function route() {
    var name = location.hash.replace('#', '');
    if (!screens[name]) name = 'home';
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      history.pushState({ fromHome: true }, '', '#' + a.getAttribute('data-go'));
      route();
    });
  });

  $('backBtn').addEventListener('click', function () {
    if (history.state && history.state.fromHome) history.back();
    else { history.replaceState(null, '', location.pathname + location.search); route(); }
  });

  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  var topbar = document.querySelector('.topbar');
  window.addEventListener('scroll', function () {
    topbar.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

  /* ---------- Start ---------- */

  renderFruits();
  render();
  renderHistory();
  route();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
