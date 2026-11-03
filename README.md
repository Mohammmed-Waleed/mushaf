# Mushaf — Indo-Pak Quran reader (large text + 15-line mushaf)

A personal Quran reader in the familiar **Indo-Pak (Nastaleeq) handwriting**, with two ways to read:

- **Big text** (default) — the same Hanafi Nastaleeq script at one fixed, comfortable size (26 px). No scrolling: swipe left/right to turn screens (swipe right = forward, like an Urdu/Arabic book). Mushaf page numbers are kept, each page's text is nudged slightly so its last screen is full, and pages 1–2 are framed cover pages with larger text that fills the page.
- **15-line mushaf** — 610 fixed pages with the same page and line breaks as the printed Qudratullah/Taj-style copy (Ayat al-Kursi is on page 42, Para 30 starts on page 586).

No build step, no framework, no account. It is a static web app that installs as a PWA and works offline.

## Features

- **Separate Sura and Para indexes** — 114 suras with search; 30 paras with their names (Alif Laam Meem, Sayaqool, … Amma), opening words, start ayah and page.
- **View and theme** — `Aa` button in the reader switches between Big text and the 15-line mushaf, and picks a light / sepia / dark / black themes.
- **Bookmarks** — one-tap page ribbon, or tap any ayah to bookmark it with a colour and note. Edit/delete in the *Saved* tab.
- **Daily tab** — surah of the day (rotating through all 114, or pin one; Al-Kahf automatically on Fridays), ayah of the day, daily page goal with streak, khatam progress, and a *Resume* button.
- **Tap an ayah** for English (Saheeh International) and/or Urdu (Fateh Muhammad Jalandhry) translation, copy, share, play.
- **Audio** — ayah-by-ayah recitation that follows along and keeps the playing ayah in view; six reciters; repeat each ayah 1/2/3/5/10× for memorising.
- **Search** — sura name, `2:255`, `page 300`, `para 30`, Arabic text (diacritic-insensitive), or English meaning.
- **Backup** — export/import bookmarks, settings and progress as JSON. Everything lives in `localStorage` on your device.

## Run it

It needs to be served over http (browsers block `fetch` of local files):

```bash
python -m http.server 5188
```

Then open <http://localhost:5188>. To install on a phone, open the hosted copy in Chrome (Android) or Safari (iPhone) and choose *Add to Home Screen* / *Install app*.

## Data

| File | What | Source |
|---|---|---|
| `data/pages.json` | 610 pages × 15 lines of words (83,668 words, 6,236 ayahs, 114 headers) | [QUL](https://qul.tarteel.ai/mushaf_layouts/6) "Indopak 15 lines – Qudratullah" layout, scraped by `tools/scrape_layout.py` |
| `data/surahs.json` | names, meanings, ayah counts, Makki/Madani | Quran.com API v4 |
| `data/tr_en.json`, `data/tr_ur.json` | translations (footnote markup stripped) | Quran.com API v4 (IDs 20, 234) |
| `fonts/nastaleeq-*.woff2` | Hanafi Nastaleeq, with waqf lazim | QUL / Tarteel CDN |
| audio | streamed live | [EveryAyah](https://everyayah.com) |

Re-create the layout with `python tools/scrape_layout.py` (about 9 minutes; it fetches one QUL page per mushaf page).

## Limitations

- Audio needs an internet connection; everything else works offline once loaded.
- The text, fonts and translations belong to their respective projects (Tarteel QUL, Quran.com); check their terms before reusing them beyond personal use.
- The text was checked structurally (610 pages, all 6,236 ayahs, 114 headers, 112 bismillahs) and by spot-checking known pages, not proofread letter by letter against a printed copy. Please read through for anything that looks off before relying on it for hifz.
- Page-read tracking counts a page after it has been open for 6 seconds.
