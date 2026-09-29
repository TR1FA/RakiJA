/*
 * Gustina mješavine alkohola i vode po međunarodnoj formuli OIML R 22
 * (preuzeta i u OIV-MA-AS312-01A i EU direktivu 76/766/EEZ).
 * Provjereno prema OIV tablicama I i II: odstupanje ≤ 0,01 % vol.
 */
(function () {
  'use strict';

  var A = [9.9820123e2, -1.929769495e2, 3.891238958e2, -1.668103923e3, 1.352215441e4, -8.829278388e4,
    3.062874042e5, -6.138381234e5, 7.470172998e5, -5.478461354e5, 2.234460334e5, -3.903285426e4];
  var B = [-2.0618513e-1, -5.2682542e-3, 3.6130013e-5, -3.8957702e-7, 7.169354e-9, -9.9739231e-11];
  var C = [
    [1.693443461530087e-1, -1.046914743455169e1, 7.196353469546523e1, -7.047478054272792e2,
      3.924090430035045e3, -1.210164659068747e4, 2.248646550400788e4, -2.605562982188164e4,
      1.852373922069467e4, -7.420201433430137e3, 1.285617841998974e3],
    [-1.19301300505701e-2, 2.517399633803461e-1, -2.170575700536993, 1.353034988843029e1,
      -5.029988758547014e1, 1.09635566657757e2, -1.422753946421155e2, 1.08043594285623e2,
      -4.414153236817392e1, 7.442971530188783],
    [-6.802995733503803e-4, 1.876837790289664e-2, -2.002561813734156e-1, 1.02299296671922,
      -2.895696483903638, 4.810060584300675, -4.672147440794683, 2.458043105903461,
      -5.411227621436812e-1],
    [4.075376675622027e-6, -8.76305857347111e-6, 6.515031360099368e-6, -1.51578483698721e-6],
    [-2.788074354782409e-8, 1.345612883493354e-8]
  ];

  // Obični stakleni alkoholometar (OIML R 44), baždaren na 20 °C.
  var GLASS_EXPANSION = 25e-6;
  // Praktična formula koja se kod nas koristi: 1 grad ≈ 2,5 % vol.
  var PERCENT_PER_GRAD = 2.5;

  // Gustina (kg/m³) za maseni udio alkohola p (0–1) na temperaturi t (°C).
  function density(p, t) {
    var d = t - 20, rho = A[0], pk = 1, dk = 1, i, k;
    for (k = 1; k < A.length; k++) { pk *= p; rho += A[k] * pk; }
    for (k = 0; k < B.length; k++) { dk *= d; rho += B[k] * dk; }
    dk = 1;
    for (i = 0; i < C.length; i++) {
      dk *= d; pk = 1;
      for (k = 0; k < C[i].length; k++) { pk *= p; rho += C[i][k] * pk * dk; }
    }
    return rho;
  }

  var ETHANOL_20 = density(1, 20);
  var WATER_20 = density(0, 20);

  // Maseni udio -> % vol na 20 °C.
  function volFromMass(p) { return 100 * p * density(p, 20) / ETHANOL_20; }

  // Obje funkcije su monotone, pa je polovljenje intervala dovoljno.
  function bisect(f, target, increasing) {
    var lo = 0, hi = 1;
    for (var n = 0; n < 60; n++) {
      var mid = (lo + hi) / 2;
      if ((f(mid) < target) === increasing) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // % vol na 20 °C -> maseni udio.
  function massFromVol(vol) { return bisect(volFromMass, vol, true); }

  // Stvarna jačina (% vol na 20 °C) iz očitavanja alkoholometra na temperaturi t.
  function realStrength(reading, t) {
    var apparent = density(massFromVol(reading), 20);
    var actual = apparent / (1 + GLASS_EXPANSION * (t - 20));
    if (actual >= density(0, t)) return 0;
    if (actual <= density(1, t)) return 100;
    var p = bisect(function (x) { return density(x, t); }, actual, false);
    return volFromMass(p);
  }

  // Razblaživanje: litara vode da `liters` rakije jačine `fromVol` postane `toVol` (% vol na 20 °C).
  // Računa se preko mase, pa je uračunato skupljanje zapremine pri miješanju.
  function dilute(liters, fromVol, toVol) {
    var pFrom = massFromVol(fromVol), pTo = massFromVol(toVol);
    // Mase su u L·kg/m³ (= grami), pa dijeljenje gustinom daje litre.
    var massFrom = liters * density(pFrom, 20);
    var massTo = massFrom * pFrom / pTo;
    return {
      water: (massTo - massFrom) / WATER_20,
      total: massTo / density(pTo, 20)
    };
  }

  window.Alkohol = {
    density: density,
    volFromMass: volFromMass,
    massFromVol: massFromVol,
    realStrength: realStrength,
    dilute: dilute,
    toGradi: function (vol) { return vol / PERCENT_PER_GRAD; },
    fromGradi: function (g) { return g * PERCENT_PER_GRAD; },
    PERCENT_PER_GRAD: PERCENT_PER_GRAD
  };
})();
