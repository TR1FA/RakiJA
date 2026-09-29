# RakiJA

Aplikacija za telefon (PWA): radi u pregledaču, instalira se na početni ekran
sa svojom ikonicom i otvara se preko cijelog ekrana kao obična aplikacija.
Isti kod radi na iPhone-u i na Androidu.

**Otvori:** https://tr1fa.github.io/RakiJA/

- **iPhone (Safari):** Podijeli → *Dodaj na početni ekran*.
- **Android / Samsung (Chrome ili Samsung Internet):** meni → *Dodaj na
  početni ekran* / *Instaliraj aplikaciju*.

Poslije prvog otvaranja radi i bez interneta.

## Alati

1. **Indikator vrenja komine** — upišeš očitanu vrijednost (°Oe) i temperaturu
   uzorka, aplikacija daje stvarnu vrijednost na 20 °C i kaže da li je vrenje
   završeno za izabrano voće. Mjerenja se čuvaju na telefonu.
2. *Uskoro* — mjesto za drugi alat.

### Pravila iz uputstva proizvođača indikatora (baždaren na 20 °C)

- iznad 20 °C: **+0,2 °Oe za svaki 1 °C**
- ispod 20 °C: **−0,2 °Oe za svaki 1 °C**
- vrenje je završeno u intervalu: šljiva 16–20, jabuka 4–12, kruška 6–16,
  viljamovka 10–16, trešnja 12–20, malina 4–8 °Oe
- za ostalo voće: orijentaciono oko 8 °Oe (sljivovica.net)

Uputstvo za mjerenje: https://www.sljivovica.net/odredjivanje-zavrsetka-vrenja.html

## Testiranje na telefonu (isti Wi-Fi kao računar)

```
python serve.py
```

Na telefonu otvori adresu koju skripta ispiše (npr. `http://192.168.0.20:8080/`).
Ako Windows pita za dozvolu mreže za Python, dozvoli.

- **iPhone (Safari):** Podijeli → *Dodaj na početni ekran*.
- **Android (Chrome):** meni ⋮ → *Dodaj na početni ekran* / *Instaliraj aplikaciju*.

Preko lokalne `http://` adrese aplikacija radi, ali bez interneta radi tek kad
je objavljena na `https://` adresi (tada se uključuje `sw.js`).

## Izmjene

- Ikonice: zamijeni `tools/ikonica-original.png` i pokreni `python tools/make_icons.py`.
- Nakon svake izmjene fajlova povećaj `CACHE` verziju u `sw.js`
  (inače instalirana aplikacija još jednom učita staru verziju).
