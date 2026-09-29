(function () {
  'use strict';

  var Alkohol = window.Alkohol;
  var REF_TEMP = 20;
  var NBSP = String.fromCharCode(0xa0);
  var WORD_JOINER = String.fromCharCode(0x2060);

  /* ---------- Pomoćne funkcije ---------- */

  function $(id) { return document.getElementById(id); }

  function roundTo(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }
  function round1(n) { return roundTo(n, 1); }

  // 12.5 -> "12,5"; -1 -> "−1,0"
  function fmt(n, decimals) {
    var d = decimals === undefined ? 1 : decimals;
    var r = roundTo(n, d);
    if (r === 0) r = 0; // bez "-0"
    return r.toFixed(d).replace('.', ',').replace('-', '−');
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

  function valid(n) { return n !== null && !isNaN(n); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '. ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // "16 °Oe" / "5 %" ne smije da se prelomi u dva reda.
  function nb(s) { return s.replace(/ (°|%|L\b|gradi|ml\b)/g, NBSP + '$1'); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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

  function markInvalid(input, bad) {
    input.closest('.field').classList.toggle('invalid', !!bad);
  }

  function setHint(elHint, text, warn) {
    elHint.textContent = nb(text);
    elHint.classList.toggle('warn', !!warn);
  }

  function tempText(t, diff) {
    return fmtInput(t) + ' °C je ' + fmtInput(Math.abs(diff)) + ' °C ' + (diff > 0 ? 'iznad' : 'ispod') + ' 20 °C';
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  /* ---------- Polja za unos (svi ekrani) ---------- */

  document.querySelectorAll('.input-wrap input').forEach(function (input) {
    input.addEventListener('focus', function () { input.select(); });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var next = input.getAttribute('data-next');
      if (next) $(next).focus(); else input.blur();
    });
  });

  // Dugmad −/+ mijenjaju vrijednost i javljaju "input" kao da je kucano.
  document.querySelectorAll('.step').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = $(btn.getAttribute('data-for'));
      var v = parseNum(input.value);
      if (!valid(v)) v = Number(input.getAttribute('data-default') || 0);
      else v += Number(btn.getAttribute('data-step'));
      var min = input.getAttribute('data-min');
      if (min !== null) v = Math.max(Number(min), v);
      input.value = fmtInput(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  /* ================================================================
   * 1. INDIKATOR VRENJA KOMINE
   * Uputstvo proizvođača: baždaren na 20 °C, ±0,2 °Oe po 1 °C.
   * ================================================================ */

  var OE_PER_DEGREE = 0.2;
  var OE_SCALE_MAX = 40; // skala indikatora 0–40 °Oe
  var OE_TABLE_FROM = 10;
  var OE_TABLE_TO = 30;

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
  // Za ostalo voće sljivovica.net navodi iskustvenu vrijednost oko 8 °Oe.
  var GENERIC_END = 8;
  // Razlika manja od ovoga između dva mjerenja = "bez promjene".
  var STABLE_DELTA = 0.5;

  var STORE_KEY = 'rakija.mjerenja.v1';
  var PREFS_KEY = 'rakija.prefs.v1';

  function oeCorrection(temp) { return OE_PER_DEGREE * (temp - REF_TEMP); }

  function fruitById(id) {
    for (var i = 0; i < FRUITS.length; i++) if (FRUITS[i].id === id) return FRUITS[i];
    return FRUITS[0];
  }

  function rangeText(f) {
    // Word joiner drži "4–12" u istom redu.
    return nb(f.min === null ? '≈' + NBSP + GENERIC_END + ' °Oe'
      : f.min + WORD_JOINER + '–' + WORD_JOINER + f.max + ' °Oe');
  }

  function assess(value, fruit) {
    if (fruit.min === null) {
      return value <= GENERIC_END
        ? { cls: 'ok', title: 'Vjerovatno završeno',
            text: 'Iskustveno se vrenje smatra završenim oko ' + GENERIC_END + ' °Oe. Potvrdi da se vrijednost ne mijenja 2–3 dana.' }
        : { cls: 'warn', title: 'Vjerovatno još traje',
            text: 'Iskustveno se vrenje završava oko ' + GENERIC_END + ' °Oe, ali zavisi od voća. Najsigurnije je kad se vrijednost ne mijenja nekoliko dana.' };
    }
    var where = 'za ' + fruit.za + NBSP + '(' + rangeText(fruit) + ')';
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

  (function initIndikator() {
    var prefs = load(PREFS_KEY, {});
    var fruitId = fruitById(prefs.fruit || 'sljiva').id;
    var entries = load(STORE_KEY, []);
    if (!Array.isArray(entries)) entries = [];

    var el = {
      reading: $('reading'), temp: $('temp'), label: $('label'),
      hint: $('inputHint'), fruits: $('fruits'),
      empty: $('resultEmpty'), body: $('resultBody'),
      corrected: $('corrected'), corrText: $('corrText'),
      scaleBand: $('scaleBand'), scaleMark: $('scaleMark'),
      status: $('status'), statusTitle: $('statusTitle'), statusText: $('statusText'),
      saveBtn: $('saveBtn'), historyCard: $('historyCard'), history: $('history'),
      table: $('corrTable'), thValue: $('thValue')
    };

    if (typeof prefs.temp === 'number') el.temp.value = fmtInput(prefs.temp);
    if (prefs.label) el.label.value = prefs.label;

    function readInputs() {
      var r = parseNum(el.reading.value);
      var t = parseNum(el.temp.value);
      var errors = [];
      if (r !== null && (isNaN(r) || r < -10 || r > 60)) errors.push('reading');
      if (!valid(t) || t < 0 || t > 45) errors.push('temp');
      return { reading: r, temp: t, errors: errors };
    }

    function renderFruits() {
      el.fruits.innerHTML = FRUITS.map(function (f) {
        return '<button type="button" class="chip" role="radio" data-fruit="' + f.id + '" aria-checked="' +
          (f.id === fruitId) + '"><b>' + f.name + '</b><small>' + rangeText(f) + '</small></button>';
      }).join('');
    }

    function renderTable(reading, temp) {
      var rows = [];
      var cur = valid(temp) ? Math.round(temp) : null;
      var hasReading = valid(reading);
      el.thValue.textContent = hasReading ? nb('Za ' + fmtInput(reading) + ' °Oe') : 'Stvarna vrijednost';
      for (var t = OE_TABLE_FROM; t <= OE_TABLE_TO; t++) {
        var c = oeCorrection(t);
        var cls = (t === cur ? 'cur' : '') + (t === REF_TEMP ? ' ref' : '');
        rows.push('<tr class="' + cls.trim() + '"><td>' + t + ' °C</td><td>' + fmtSigned(c) + '</td><td>' +
          (hasReading ? fmt(reading + c) + ' °Oe' : '—') + '</td></tr>');
      }
      el.table.innerHTML = nb(rows.join(''));
    }

    function render() {
      var inp = readInputs();
      var badReading = inp.errors.indexOf('reading') >= 0;
      var badTemp = inp.errors.indexOf('temp') >= 0;
      markInvalid(el.reading, badReading);
      markInvalid(el.temp, badTemp);

      if (badTemp) setHint(el.hint, 'Upiši temperaturu uzorka (0–45 °C).', true);
      else if (badReading) setHint(el.hint, 'Očitana vrijednost nije ispravna.', true);
      else if (inp.temp < OE_TABLE_FROM || inp.temp > OE_TABLE_TO)
        setHint(el.hint, 'Korekcija je najtačnija blizu 20 °C. Ako možeš, dovedi uzorak na sobnu temperaturu.', true);
      else if (inp.reading !== null && inp.reading > OE_SCALE_MAX)
        setHint(el.hint, 'Skala indikatora ide od 0 do 40 °Oe.', true);
      else setHint(el.hint, 'Indikator je baždaren na 20 °C.', false);

      renderTable(badReading ? null : inp.reading, badTemp ? null : inp.temp);

      var ok = inp.reading !== null && inp.errors.length === 0;
      el.empty.hidden = ok;
      el.body.hidden = !ok;
      if (!ok) {
        el.empty.textContent = inp.reading === null
          ? 'Upiši očitanu vrijednost sa indikatora.'
          : 'Provjeri unesene vrijednosti.';
        return;
      }

      var c = oeCorrection(inp.temp);
      var value = inp.reading + c;
      var fruit = fruitById(fruitId);

      el.corrected.textContent = fmt(value);
      var diff = round1(inp.temp - REF_TEMP);
      el.corrText.innerHTML = nb(diff === 0
        ? 'Uzorak je na 20 °C — korekcija nije potrebna.'
        : 'Korekcija <b>' + fmtSigned(c) + ' °Oe</b> · ' + tempText(inp.temp, diff));

      var pct = function (v) { return Math.max(0, Math.min(100, v / OE_SCALE_MAX * 100)); };
      el.scaleMark.style.left = pct(value) + '%';
      var lo = fruit.min === null ? 0 : fruit.min;
      var hi = fruit.min === null ? GENERIC_END : fruit.max;
      el.scaleBand.style.left = pct(lo) + '%';
      el.scaleBand.style.width = (pct(hi) - pct(lo)) + '%';

      var a = assess(value, fruit);
      el.status.className = 'status ' + a.cls;
      el.statusTitle.textContent = a.title;
      el.statusText.textContent = nb(a.text);
    }

    function renderHistory() {
      var list = entries.slice().sort(function (a, b) { return b.ts - a.ts; });
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

    function savePrefs() {
      var t = parseNum(el.temp.value);
      save(PREFS_KEY, { fruit: fruitId, temp: valid(t) ? t : REF_TEMP, label: el.label.value.trim() });
    }

    [el.reading, el.temp].forEach(function (input) {
      input.addEventListener('input', function () { render(); savePrefs(); });
    });
    el.label.addEventListener('change', savePrefs);

    el.fruits.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      fruitId = chip.getAttribute('data-fruit');
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
      var lastTs = entries.reduce(function (m, x) { return Math.max(m, x.ts); }, 0);
      entries.push({
        ts: Math.max(Date.now(), lastTs + 1),
        fruit: fruitId,
        label: el.label.value.trim(),
        reading: inp.reading,
        temp: inp.temp,
        value: round1(inp.reading + oeCorrection(inp.temp))
      });
      var stored = save(STORE_KEY, entries);
      savePrefs();
      renderHistory();
      toast(stored ? 'Mjerenje sačuvano' : 'Sačuvano samo dok je aplikacija otvorena');
    });

    el.history.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-del]');
      if (!btn) return;
      if (!confirm('Obrisati ovo mjerenje?')) return;
      var ts = Number(btn.getAttribute('data-del'));
      entries = entries.filter(function (x) { return x.ts !== ts; });
      save(STORE_KEY, entries);
      renderHistory();
    });

    renderFruits();
    render();
    renderHistory();
  })();

  /* ================================================================
   * Jedinica jačine (% vol ili gradi) — zajednička za alate 2 i 3
   * ================================================================ */

  var UNIT_KEY = 'rakija.jedinica.v1';
  var unit = load(UNIT_KEY, 'vol') === 'grad' ? 'grad' : 'vol';
  var unitListeners = [];

  var UNITS = {
    vol: { label: '%', long: '% vol', max: 100 },
    grad: { label: 'gradi', long: 'gradi', max: 100 / Alkohol.PERCENT_PER_GRAD }
  };

  // Vrijednost iz polja (u trenutnoj jedinici) -> % vol.
  function toVol(v) { return unit === 'grad' ? Alkohol.fromGradi(v) : v; }
  function fromVol(vol) { return unit === 'grad' ? Alkohol.toGradi(vol) : vol; }

  // "52,3 % vol (20,9 gradi)" ili obrnuto, zavisno od izabrane jedinice.
  function strengthText(vol) {
    var main = unit === 'grad' ? fmt(Alkohol.toGradi(vol)) + ' gradi' : fmt(vol) + ' % vol';
    var other = unit === 'grad' ? fmt(vol) + ' % vol' : fmt(Alkohol.toGradi(vol)) + ' gradi';
    return main + ' (' + other + ')';
  }

  function applyUnit() {
    document.querySelectorAll('[data-unit-toggle] button').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-unit') === unit));
    });
    document.querySelectorAll('[data-unit-label]').forEach(function (s) { s.textContent = UNITS[unit].label; });
  }

  function setUnit(next) {
    if (next === unit) return;
    // Vrijednosti koje su već upisane pretvori u novu jedinicu.
    document.querySelectorAll('input[data-strength]').forEach(function (input) {
      var v = parseNum(input.value);
      if (!valid(v)) return;
      var vol = toVol(v);
      input.value = fmtInput(next === 'grad' ? Alkohol.toGradi(vol) : vol);
    });
    unit = next;
    save(UNIT_KEY, unit);
    applyUnit();
    unitListeners.forEach(function (fn) { fn(); });
  }

  document.querySelectorAll('[data-unit-toggle]').forEach(function (group) {
    group.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-unit]');
      if (b) setUnit(b.getAttribute('data-unit'));
    });
  });
  applyUnit();

  /* ================================================================
   * 2. JAČINA RAKIJE — alkoholometar baždaren na 20 °C
   * ================================================================ */

  var ALC_TABLE_FROM = 10;
  var ALC_TABLE_TO = 35;
  var ALC_TEMP_MIN = 0;
  var ALC_TEMP_MAX = 40; // formula OIML važi do 40 °C
  var JACINA_KEY = 'rakija.jacina.v1';

  (function initJacina() {
    var prefs = load(JACINA_KEY, {});
    var el = {
      reading: $('jReading'), temp: $('jTemp'), hint: $('jHint'),
      empty: $('jEmpty'), body: $('jBody'),
      main: $('jMain'), mainUnit: $('jMainUnit'), also: $('jAlso'), corr: $('jCorr'),
      table: $('jTable'), tableSub: $('jTableSub'),
      convVol: $('convVol'), convGrad: $('convGrad')
    };
    if (typeof prefs.temp === 'number') el.temp.value = fmtInput(prefs.temp);

    function renderTable(vol) {
      var rows = [];
      var t0 = parseNum(el.temp.value);
      var cur = valid(t0) ? Math.round(t0) : null;
      el.tableSub.textContent = valid(vol)
        ? nb('Ako alkoholometar pokazuje ' + fmtInput(fromVol(vol)) + ' ' + UNITS[unit].long +
          ', stvarna jačina na 20 °C je:')
        : 'Stvarna jačina na 20 °C prema međunarodnim alkoholometrijskim tablicama (OIML).';
      for (var t = ALC_TABLE_FROM; t <= ALC_TABLE_TO; t++) {
        var real = valid(vol) ? Alkohol.realStrength(vol, t) : null;
        var cls = (t === cur ? 'cur' : '') + (t === REF_TEMP ? ' ref' : '');
        rows.push('<tr class="' + cls.trim() + '"><td>' + t + ' °C</td><td>' +
          (real === null ? '—' : fmt(real)) + '</td><td>' +
          (real === null ? '—' : fmt(Alkohol.toGradi(real))) + '</td></tr>');
      }
      el.table.innerHTML = nb(rows.join(''));
    }

    function render() {
      var r = parseNum(el.reading.value);
      var t = parseNum(el.temp.value);
      var vol = valid(r) ? toVol(r) : r;
      var badR = r !== null && (isNaN(r) || vol < 0 || vol > 100);
      var badT = !valid(t) || t < ALC_TEMP_MIN || t > ALC_TEMP_MAX;
      markInvalid(el.reading, badR);
      markInvalid(el.temp, badT);

      if (badT) setHint(el.hint, 'Upiši temperaturu rakije (0–40 °C).', true);
      else if (badR) setHint(el.hint, 'Jačina mora biti između 0 i ' + fmtInput(UNITS[unit].max) + ' ' + UNITS[unit].long + '.', true);
      else if (t < ALC_TABLE_FROM || t > ALC_TABLE_TO)
        setHint(el.hint, 'Najtačnije je mjeriti blizu 20 °C. Ako možeš, ohladi ili zagrij rakiju.', true);
      else setHint(el.hint, 'Alkoholometar je baždaren na 20 °C.', false);

      renderTable(badR || r === null ? null : vol);

      var ok = r !== null && !badR && !badT;
      el.empty.hidden = ok;
      el.body.hidden = !ok;
      if (!ok) {
        el.empty.textContent = r === null ? 'Upiši jačinu koju pokazuje alkoholometar.' : 'Provjeri unesene vrijednosti.';
        return;
      }

      var real = Alkohol.realStrength(vol, t);
      el.main.textContent = fmt(fromVol(real));
      el.mainUnit.textContent = UNITS[unit].long;
      el.also.textContent = nb('= ' + (unit === 'grad' ? fmt(real) + ' % vol' : fmt(Alkohol.toGradi(real)) + ' gradi'));
      var diff = round1(t - REF_TEMP);
      el.corr.innerHTML = nb(diff === 0
        ? 'Rakija je na 20 °C — korekcija nije potrebna.'
        : 'Korekcija <b>' + fmtSigned(fromVol(real - vol)) + ' ' + UNITS[unit].long + '</b> · ' + tempText(t, diff));
    }

    function savePrefs() {
      var t = parseNum(el.temp.value);
      save(JACINA_KEY, { temp: valid(t) ? t : REF_TEMP });
    }

    el.reading.addEventListener('input', render);
    el.temp.addEventListener('input', function () { render(); savePrefs(); });
    unitListeners.push(render);

    // Brzo pretvaranje % vol <-> gradi.
    el.convVol.addEventListener('input', function () {
      var v = parseNum(el.convVol.value);
      el.convGrad.value = valid(v) ? fmt(Alkohol.toGradi(v)).replace(/,0$/, '') : '';
    });
    el.convGrad.addEventListener('input', function () {
      var g = parseNum(el.convGrad.value);
      el.convVol.value = valid(g) ? fmt(Alkohol.fromGradi(g)).replace(/,0$/, '') : '';
    });

    render();
  })();

  /* ================================================================
   * 3. RAZBLAŽIVANJE RAKIJE
   * ================================================================ */

  var RAZ_KEY = 'rakija.razblazivanje.v1';
  var PRESETS_VOL = [40, 42, 45, 48, 50];
  var PRESETS_GRAD = [16, 17, 18, 19, 20];

  (function initRazblazivanje() {
    var prefs = load(RAZ_KEY, {});
    var el = {
      strength: $('rStrength'), temp: $('rTemp'), liters: $('rLiters'), target: $('rTarget'),
      presets: $('rPresets'), hint: $('rHint'),
      empty: $('rEmpty'), body: $('rBody'),
      water: $('rWater'), waterMl: $('rWaterMl'), total: $('rTotal')
    };
    if (typeof prefs.temp === 'number') el.temp.value = fmtInput(prefs.temp);
    if (typeof prefs.targetVol === 'number') el.target.value = fmtInput(fromVol(prefs.targetVol));

    function renderPresets() {
      var list = unit === 'grad' ? PRESETS_GRAD : PRESETS_VOL;
      var cur = parseNum(el.target.value);
      el.presets.innerHTML = list.map(function (v) {
        return '<button type="button" class="preset" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' +
          nb(v + ' ' + UNITS[unit].label) + '</button>';
      }).join('');
    }

    function render() {
      var s = parseNum(el.strength.value);
      var t = parseNum(el.temp.value);
      var l = parseNum(el.liters.value);
      var g = parseNum(el.target.value);
      var sVol = valid(s) ? toVol(s) : s;
      var gVol = valid(g) ? toVol(g) : g;

      var badS = s !== null && (isNaN(s) || sVol <= 0 || sVol > 100);
      var badT = !valid(t) || t < ALC_TEMP_MIN || t > ALC_TEMP_MAX;
      var badL = l !== null && (isNaN(l) || l <= 0);
      var badG = g !== null && (isNaN(g) || gVol <= 0 || gVol > 100);

      var real = !badS && !badT && valid(s) ? Alkohol.realStrength(sVol, t) : null;
      var tooStrong = real !== null && !badG && valid(g) && gVol >= real;

      markInvalid(el.strength, badS);
      markInvalid(el.temp, badT);
      markInvalid(el.liters, badL);
      markInvalid(el.target, badG || tooStrong);
      renderPresets();

      if (tooStrong) {
        setHint(el.hint, 'Željena jačina mora biti manja od stvarne jačine rakije: ' + strengthText(real) + '.', true);
      } else if (real !== null && round1(t - REF_TEMP) !== 0) {
        setHint(el.hint, 'Stvarna jačina tvoje rakije na 20 °C: ' + strengthText(real) + '.', false);
      } else {
        setHint(el.hint, '', false);
      }

      var ok = real !== null && valid(l) && !badL && valid(g) && !badG && !tooStrong;
      el.empty.hidden = ok;
      el.body.hidden = !ok;
      if (!ok) {
        var missing = s === null || l === null || g === null;
        el.empty.textContent = missing ? 'Upiši jačinu, količinu i željenu jačinu.' : 'Provjeri unesene vrijednosti.';
        if (badT) el.empty.textContent = 'Upiši temperaturu rakije (0–40 °C).';
        return;
      }

      var d = Alkohol.dilute(l, real, gVol);
      el.water.textContent = fmt(d.water, d.water < 10 ? 2 : 1);
      el.waterMl.hidden = d.water >= 1;
      el.waterMl.textContent = nb('= ' + Math.round(d.water * 1000) + ' ml');
      el.total.innerHTML = nb('Dobićeš <b>' + fmt(d.total, d.total < 10 ? 2 : 1) + ' L</b> rakije od <b>' +
        strengthText(gVol) + '</b>');
    }

    function savePrefs() {
      var t = parseNum(el.temp.value);
      var g = parseNum(el.target.value);
      save(RAZ_KEY, { temp: valid(t) ? t : REF_TEMP, targetVol: valid(g) ? toVol(g) : null });
    }

    [el.strength, el.temp, el.liters, el.target].forEach(function (input) {
      input.addEventListener('input', function () { render(); savePrefs(); });
    });
    el.presets.addEventListener('click', function (e) {
      var b = e.target.closest('.preset');
      if (!b) return;
      el.target.value = b.getAttribute('data-v');
      render();
      savePrefs();
    });
    unitListeners.push(function () { render(); savePrefs(); });

    render();
  })();

  /* ---------- Navigacija između ekrana ---------- */

  var screens = {
    home: $('screen-home'),
    indikator: $('screen-indikator'),
    jacina: $('screen-jacina'),
    razblazivanje: $('screen-razblazivanje')
  };

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

  document.querySelectorAll('.back').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (history.state && history.state.fromHome) history.back();
      else { history.replaceState(null, '', location.pathname + location.search); route(); }
    });
  });

  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  var topbars = document.querySelectorAll('.topbar');
  window.addEventListener('scroll', function () {
    var scrolled = window.scrollY > 4;
    topbars.forEach(function (bar) { bar.classList.toggle('scrolled', scrolled); });
  }, { passive: true });

  route();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
