(() => {
'use strict';

/* ───────────── helpers ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const key = (s, a) => s + ':' + a;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayNum = d => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
const TOTAL_PAGES = 610;
const COLORS = ['#1f6b52', '#c9892b', '#b3372b', '#2f6fb3', '#7a4fa0'];
const RECITERS = {
  'Alafasy_128kbps': 'Mishary Alafasy',
  'Husary_128kbps': 'Mahmoud Khalil Al-Husary',
  'Abdul_Basit_Murattal_192kbps': 'Abdul Basit (Murattal)',
  'Abdurrahmaan_As-Sudais_192kbps': 'Abdurrahman As-Sudais',
  'Minshawy_Murattal_128kbps': 'Al-Minshawi (Murattal)',
  'Hudhaify_128kbps': 'Ali Al-Hudhaify',
};
const PARA_EN = ['Alif Laam Meem', 'Sayaqool', 'Tilkal Rusul', 'Lan Tanaalu', 'Wal Muhsanaat', 'La Yuhibbullah', 'Wa Iza Samiu', 'Wa Lau Annana', 'Qaalal Malao', 'Wa A’lamu', 'Yatazeroon', 'Wa Maa Min Daabbah', 'Wa Maa Ubarri’u', 'Rubamaa', 'Subhanallazi', 'Qaal Alam', 'Iqtaraba', 'Qad Aflaha', 'Wa Qaalallazina', 'A’man Khalaq', 'Utlu Maa Oohiya', 'Wa Man Yaqnut', 'Wa Maalia', 'Faman Azlamu', 'Ilaihi Yuraddu', 'Haa Meem', 'Qaala Fama Khatbukum', 'Qad Sami’allahu', 'Tabaarakallazi', 'Amma'];
// First ayah of every juz
const JUZ = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];

/* ───────────── persistent state ───────────── */
const DEF = {
  settings: { theme: 'light', view: 'mushaf', dv: 1, fontSize: 26, fsv: 3, zoom: 1, fitPage: true, spread: true, tr: 'en', reciter: 'Alafasy_128kbps', repeat: 1,
              dailyGoal: 2, dailyMode: 'rotate', fixedSurah: 36, fridayKahf: true },
  last: { page: 1, s: 1, a: 1 },
  bms: [],
  read: {},        // 'YYYY-MM-DD' -> [pages read that day]
  khatam: [],      // pages read in the current khatam cycle
  khatams: 0,
  surahDone: {},   // (old) 'YYYY-MM-DD' -> true
  dailySurahs: [], // surahs the user wants to recite every day
  sdone: {},       // 'YYYY-MM-DD' -> [surah numbers recited that day]
  doneDays: {},    // 'YYYY-MM-DD' -> true once the whole daily goal was met
};
let ST;
try { ST = JSON.parse(localStorage.getItem('mushaf.v1') || 'null'); } catch { ST = null; }
ST = Object.assign(structuredClone(DEF), ST || {});
const savedSettings = ST.settings;   // what was stored, before defaults are filled in (used for one-time migrations)
ST.settings = Object.assign({}, DEF.settings, savedSettings);
if (savedSettings.fsv !== 3) { ST.settings.fontSize = DEF.settings.fontSize; ST.settings.fsv = 3; }   // big-text size is fixed at 26px
if (savedSettings.dv !== 1) { ST.settings.view = 'mushaf'; ST.settings.dv = 1; }                       // 15-line is the default view
ST.settings.theme = 'light';                                                                          // light theme only
ST.settings.zoom = 1; ST.settings.fitPage = true; ST.settings.spread = true;   // whole page always fits the screen; two pages side by side on wide screens
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('mushaf.v1', JSON.stringify(ST)); } catch {} }, 250); };

/* ───────────── data ───────────── */
let PAGES, SUR, TR = {};
const AY = {};          // 's:a' -> { s, a, page, words:[], text }
const ORDER = [];       // every ayah key in reading order
const PGINFO = [null];  // page -> { first:[s,a], last:[s,a] }
const LETTER = /[ء-يٮ-ۓۺ-ۿ]/;

async function loadData() {
  const j = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
  [PAGES, SUR] = await Promise.all([j('data/pages.json'), j('data/surahs.json')]);
  PAGES.forEach((lines, i) => {
    const page = i + 1;
    let first = null, last = null;
    for (const ln of lines) {
      if (ln.t !== 'w') continue;
      for (const [loc, text] of ln.w) {
        const [s, a] = loc.split(':').map(Number);
        const k = key(s, a);
        let ay = AY[k];
        if (!ay) { ay = AY[k] = { s, a, page, words: [], marker: '' }; ORDER.push(k); }
        if (LETTER.test(text)) ay.words.push(text); else ay.marker = text;
        if (!first) first = [s, a];
        last = [s, a];
      }
    }
    PGINFO[page] = { first, last };
  });
  for (const k of ORDER) AY[k].text = AY[k].words.join(' ');
}
const loadTr = async lang => TR[lang] || (TR[lang] = await fetch(`data/tr_${lang}.json`).then(r => r.json()));

const surahPage = s => AY[key(s, 1)].page;
const juzOf = (s, a) => { let j = 0; for (let i = 0; i < 30; i++) { const [js, ja] = JUZ[i]; if (s > js || (s === js && a >= ja)) j = i + 1; } return j; };
const juzPage = j => AY[key(...JUZ[j - 1])].page;
const surahName = s => SUR[s - 1].en;
const nextKey = k => ORDER[ORDER.indexOf(k) + 1];
const ORDER_IDX = {}; // filled lazily
const idxOf = k => (ORDER_IDX[k] ??= ORDER.indexOf(k));

/* ───────────── text measuring / fitting ───────────── */
const FONTS = ['IP Normal', 'IP Compact', 'IP Compressed'];
const GAP = 0.2, LH = 1.62, FILL = 0.97;
const cv = document.createElement('canvas').getContext('2d');
const wcache = new Map();
function em(word, font) {
  const k = font + '|' + word;
  let v = wcache.get(k);
  if (v === undefined) { cv.font = `100px "${font}"`; cv.direction = 'rtl'; v = cv.measureText(word).width / 100; wcache.set(k, v); }
  return v;
}
const natEm = (words, font, gap = GAP) => words.reduce((t, w) => t + em(w, font), 0) + (words.length - 1) * gap;
let NAT_REF = 10; // em width of a typical full line, calibrated at start
function calibrate() {
  const ws = [];
  for (let p = 3; p < 600; p += 7) for (const ln of PAGES[p - 1]) if (ln.t === 'w' && !ln.c && ln.w.length > 4) ws.push(natEm(ln.w.map(x => x[1]), FONTS[0]));
  ws.sort((a, b) => a - b);
  NAT_REF = ws[Math.floor(ws.length * 0.82)];
}

/* ───────────── layout ───────────── */
const stage = $('#stage'), readView = $('#v-read');
let cur = ST.last.page;       // page shown at the right (or alone)
let focusPage = cur;          // page the top bar refers to
let spreadOn = false;
let hlKey = null;

const chromeV = 96;           // head + foot + paddings (px)
function geometry() {
  const aw = readView.clientWidth - 24, ah = readView.clientHeight - 24;
  const cols = ST.settings.spread && aw >= 760 ? 2 : 1;
  const gap = 14;
  // body width Wb such that page = Wb + 32
  let wb = (aw - gap * (cols - 1)) / cols - 32;
  if (ST.settings.fitPage) {
    const a = 15 * LH * FILL / NAT_REF;   // body height per unit body width
    wb = Math.min(wb, (ah - chromeV) / a);
  }
  wb = clamp(wb * ST.settings.zoom, 200, 760 * Math.max(1, ST.settings.zoom));
  // spread spare height over the lines (up to +35%) so the page fills the screen like a printed one
  const F = wb / NAT_REF * FILL;
  const lhk = ST.settings.fitPage ? clamp((ah - chromeV) / 15 / F, LH, LH * 1.35) : LH;
  return { cols, wb, lhk };
}

function buildPage(p, wb, lhk) {
  const F = wb / NAT_REF * FILL;                 // base font size px
  const lh = F * lhk;
  const el = document.createElement('section');
  el.className = 'pg'; el.dataset.page = p;
  el.style.width = (wb + 32) + 'px';
  const info = PGINFO[p], [fs, fa] = info.first;
  const sName = SUR[fs - 1].en;
  el.innerHTML = `<div class="pg-head"><span>${esc(sName)}</span><span>Para ${juzOf(fs, fa)}</span></div><div class="pg-body"></div><div class="pg-foot">${p}</div>`;
  const body = $('.pg-body', el);
  if (p <= 2) {
    el.classList.add('cover');
    el.insertAdjacentHTML('afterbegin', '<i class="orn tl"></i><i class="orn tr"></i><i class="orn bl"></i><i class="orn br"></i>');
    body.style.height = (15 * lh) + 'px';
    body.append(coverNode(p, wb - 12, 15 * lh, F * 1.8, false));
    el.addEventListener('pointerdown', () => { focusPage = p; syncTop(); });
    return el;
  }
  for (const ln of PAGES[p - 1]) {
    const d = document.createElement('div');
    d.className = 'ln'; d.style.height = lh + 'px';
    if (ln.t === 's') {
      d.classList.add('hdr');
      d.innerHTML = `<div class="sbox" style="font-size:${F * 1.05}px"><span>سُورَةُ ${esc(SUR[ln.s - 1].ar)}</span><small>${esc(SUR[ln.s - 1].en)}</small></div>`;
    } else if (ln.t === 'b') {
      d.classList.add('bsm'); d.style.fontSize = F * 0.95 + 'px';
      d.textContent = 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِیْمِ';
    } else if (ln.w.length) {
      const texts = ln.w.map(w => w[1]);
      let font = FONTS[0], size = F;
      if (ln.c) { d.classList.add('c'); size = F; }
      else {
        const fits = f => natEm(texts, f) * size <= wb * 0.995;
        font = FONTS.find(fits);
        if (!font) { font = FONTS[2]; size = F * (wb * 0.995) / (natEm(texts, font) * F); }
      }
      d.style.fontFamily = `"${font}", "Noto Naskh Arabic", serif`;
      d.style.fontSize = size + 'px';
      if (!ln.c) d.style.minWidth = '0';
      for (const [loc, text] of ln.w) {
        const [s, a] = loc.split(':');
        const sp = document.createElement('span');
        const isEnd = !LETTER.test(text);
        sp.className = isEnd ? 'w end' : 'w';
        sp.dataset.k = s + ':' + a;
        sp.textContent = text;
        d.appendChild(sp);
      }
    }
    body.appendChild(d);
  }
  el.addEventListener('pointerdown', () => { focusPage = p; syncTop(); });
  return el;
}

function visiblePages() { return $$('.pg, .fp', stage).map(e => +e.dataset.page); }
const flowMode = () => ST.settings.view === 'flow';

function render(opts = {}) {
  if (flowMode()) return renderFlow();
  readView.classList.remove('flowmode');
  stage.className = ''; stage.style.removeProperty('--fs');
  const { cols, wb, lhk } = geometry();
  spreadOn = cols === 2;
  const base = spreadOn ? (cur % 2 ? cur : cur - 1) : cur;
  const pages = spreadOn ? [base, base + 1].filter(p => p <= TOTAL_PAGES) : [cur];
  if (spreadOn) cur = base;
  stage.replaceChildren(...pages.map(p => buildPage(p, wb, lhk)));
  if (!pages.includes(focusPage)) focusPage = pages[0];
  readView.scrollTop = 0;
  applyMarks();
  syncTop();
  ST.last.page = cur; save();
  trackRead(pages);
  if (opts.focus) readView.scrollLeft = 0;
}
function applyMarks() {
  $$('.w.bm, .w.sel, .w.playing', stage).forEach(w => { w.classList.remove('bm', 'sel', 'playing'); w.style.removeProperty('--bmc'); });
  markScope(stage);
}
function markScope(root) {
  const bmKeys = new Map(ST.bms.filter(b => b.s).map(b => [b.s + ':' + b.a, b.color]));
  for (const w of $$('.w', root)) {
    const k = w.dataset.k, c = bmKeys.get(k);
    if (c) { w.classList.add('bm'); w.style.setProperty('--bmc', c); }
    if (k === hlKey) w.classList.add('sel');
    if (k === playKey) w.classList.add('playing');
  }
}
function syncTop() {
  const info = PGINFO[focusPage], [s, a] = info.first;
  $('#ttlPage').textContent = 'Page ' + focusPage;
  $('#ttlSurah').textContent = surahName(s);
  $('#ttlJuz').textContent = `Para ${juzOf(s, a)} · ` + (flowMode() ? `page ${focusPage} · ${flowSub + 1}/${flowCount}` : spreadOn ? 'pages ' + visiblePages().join('–') : 'page ' + focusPage + ' of ' + TOTAL_PAGES);
  $('#btnBm').classList.toggle('on', ST.bms.some(b => !b.s && b.page === focusPage));
}

/* ───────────── large-text paged view (swipe left / right, no scrolling) ───────────── */
let flowSub = 0, flowCount = 1, flowW = 0, flowDrag = null;
const BSM = 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِیْمِ';
// Pages 1 and 2 are short: show them as framed "cover" pages with larger text that fills the page.
function coverNode(p, w, h, cap, flow) {
  const lines = PAGES[p - 1].filter(l => l.t !== 'w' || l.w.length);
  const nText = lines.filter(l => l.t !== 's').length;
  let maxEm = 1;
  for (const l of lines) {
    if (l.t === 'w') maxEm = Math.max(maxEm, natEm(l.w.map(x => x[1]), FONTS[0], 0.3));
    else if (l.t === 'b') maxEm = Math.max(maxEm, natEm(BSM.split(' '), FONTS[0], 0.3));
  }
  const size = Math.max(14, Math.min(w * 0.9 / maxEm, h / (1.95 * nText + 4.4), cap));
  const el = document.createElement(flow ? 'section' : 'div');
  el.className = flow ? 'fp cover' : 'cover-body';
  if (flow) { el.dataset.page = p; el.insertAdjacentHTML('afterbegin', '<i class="orn tl"></i><i class="orn tr"></i><i class="orn bl"></i><i class="orn br"></i>'); }
  el.style.fontSize = size + 'px';
  for (const ln of lines) {
    if (ln.t === 's') {
      const S = SUR[ln.s - 1];
      el.insertAdjacentHTML('beforeend', `<div class="cv-h"><div class="sbox"><span>سُورَةُ ${esc(S.ar)}</span><small>${esc(S.en)}</small></div><div class="csub">${esc(S.tr)} · ${S.n} ayahs · ${S.place}</div></div>`);
    } else if (ln.t === 'b') {
      el.insertAdjacentHTML('beforeend', `<div class="cline">${BSM}</div>`);
    } else {
      const d = document.createElement('div'); d.className = 'cline';
      for (const [loc, text] of ln.w) {
        const sp = document.createElement('span');
        sp.className = LETTER.test(text) ? 'w' : 'w end';
        sp.dataset.k = loc.split(':').slice(0, 2).join(':');
        sp.textContent = text;
        d.appendChild(sp);
      }
      el.appendChild(d);
    }
  }
  return el;
}
function flowPage(p, ctx) {
  if (ctx && p <= 2) return coverNode(p, ctx.w - 36, ctx.h - 44, ST.settings.fontSize * 1.8, true);
  const el = document.createElement('section');
  el.className = 'fp'; el.dataset.page = p;
  const [fs, fa] = PGINFO[p].first;
  el.innerHTML = `<div class="fdiv">Page ${p} · Para ${juzOf(fs, fa)}</div>`;
  let para = null;
  for (const ln of PAGES[p - 1]) {
    if (ln.t === 's') {
      para = null;
      el.insertAdjacentHTML('beforeend', `<div class="fhdr"><div class="sbox"><span>سُورَةُ ${esc(SUR[ln.s - 1].ar)}</span><small>${esc(SUR[ln.s - 1].en)}</small></div></div>`);
    } else if (ln.t === 'b') {
      para = null;
      el.insertAdjacentHTML('beforeend', `<div class="fbsm">${BSM}</div>`);
    } else if (ln.w.length) {
      if (!para) { para = document.createElement('p'); para.className = 'ftxt'; el.appendChild(para); }
      for (const [loc, text] of ln.w) {
        const sp = document.createElement('span');
        sp.className = LETTER.test(text) ? 'w' : 'w end';
        sp.dataset.k = loc.split(':').slice(0, 2).join(':');
        sp.textContent = text;
        para.append(sp, ' ');
      }
    }
  }
  if (para) para.append(Object.assign(document.createElement('span'), { className: 'tail' }));
  return el;
}
// Which screen (column) an element sits in, given the current slide offset.
function colOf(el) {
  const fv = $('.fview', stage), r = el.getBoundingClientRect();
  const x = r.left + r.width / 2 - fv.getBoundingClientRect().left - flowSub * flowW;
  return clamp(Math.floor(-x / flowW) + 1, 0, 999);
}
function setSub(n, animate = true) {
  const cols = $('.fcols', stage); if (!cols) return;
  flowSub = clamp(n, 0, flowCount - 1);
  cols.classList.toggle('drag', !animate);
  cols.style.transform = `translateX(${flowSub * flowW}px)`;
  syncTop();
}
function firstVisibleKey() {
  for (const w of $$('.w', stage)) if (colOf(w) === flowSub) return w.dataset.k;
  return null;
}
function showKey(k) {
  const w = $(`.w[data-k="${k}"]`, stage);
  if (w) setSub(colOf(w));
}
// Nudge the text size (within about -10% / +15%) so the last screen of the page is filled, not half empty.
function fitFill(cols, colH) {
  if (cur <= 2) return;
  const tail = $('.tail', cols); if (!tail) return;
  const base = ST.settings.fontSize;
  const probe = m => {
    stage.style.setProperty('--fs', base * m + 'px');
    return (tail.getBoundingClientRect().bottom - cols.getBoundingClientRect().top) / colH;
  };
  for (const m of [1, 1.03, 0.97, 1.06, 0.94, 1.09, 0.91, 1.12, 1.15, 0.9]) {
    const fill = probe(m);
    if (fill >= 0.9 && fill <= 1.001) return;
  }
  probe(1);
}
function renderFlow(startSub = 0) {
  spreadOn = false;
  readView.classList.add('flowmode');
  stage.className = 'flow';
  stage.style.setProperty('--fs', ST.settings.fontSize + 'px');
  const W = flowW = readView.clientWidth, H = readView.clientHeight;
  const colW = Math.min(W - 32, 760), gap = W - colW;
  const fv = document.createElement('div'); fv.className = 'fview';
  const cols = document.createElement('div'); cols.className = 'fcols drag';
  cols.style.cssText = `height:${H - 24}px;width:${colW}px;column-width:${colW}px;column-gap:${gap}px;margin:12px ${gap / 2}px`;
  cols.append(flowPage(cur, { w: colW, h: H - 24 }));
  fv.append(cols);
  stage.replaceChildren(fv);
  flowSub = 0; flowCount = 999;
  fitFill(cols, H - 24);
  const words = $$('.w', cols), end = $('.tail', cols) || words[words.length - 1];
  flowCount = end ? colOf(end) + 1 : 1;
  focusPage = cur;
  markScope(stage);
  setSub(startSub === 'last' ? flowCount - 1 : startSub, false);
  ST.last.page = cur; save();
  trackRead([cur]);
}
// dir > 0 = forward (next screen), dir < 0 = back
function flowStep(dir) {
  if (dir > 0) {
    if (flowSub < flowCount - 1) { setSub(flowSub + 1); return true; }
    if (cur < TOTAL_PAGES) { animateTurn(1, () => { cur++; hlKey = null; renderFlow(0); }); return true; }
  } else {
    if (flowSub > 0) { setSub(flowSub - 1); return true; }
    if (cur > 1) { animateTurn(-1, () => { cur--; hlKey = null; renderFlow('last'); }); return true; }
  }
  return false;
}
// finger-follow swipe
stage.addEventListener('touchstart', e => {
  if (!flowMode() || e.touches.length !== 1) return;
  flowDrag = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, t: Date.now() };
}, { passive: true });
stage.addEventListener('touchmove', e => {
  if (!flowDrag) return;
  flowDrag.dx = e.touches[0].clientX - flowDrag.x;
  const cols = $('.fcols', stage); if (!cols) return;
  cols.classList.add('drag');
  cols.style.transform = `translateX(${flowSub * flowW + flowDrag.dx}px)`;
}, { passive: true });
function endDrag() {
  if (!flowDrag) return;
  const { dx, t } = flowDrag; flowDrag = null;
  const fast = Date.now() - t < 350;
  if (Math.abs(dx) > (fast ? 40 : flowW * 0.25) && flowStep(dx > 0 ? 1 : -1)) return;
  setSub(flowSub, true);
}
stage.addEventListener('touchend', endDrag);
stage.addEventListener('touchcancel', endDrag);

function setView(v) {
  if (ST.settings.view === v) return;
  ST.settings.view = v; save();
  render(); fadeIn();
}
function openLook() {
  const S = ST.settings;
  openSheet(`<h2>Reading view</h2>
    <div class="seg" id="lkView"><button data-v="mushaf" class="${S.view === 'mushaf' ? 'on' : ''}">15-line mushaf</button><button data-v="flow" class="${S.view === 'flow' ? 'on' : ''}">Big text</button></div>
    <p class="muted sm">15-line mushaf: fixed pages like the printed copy. Big text: the same pages in larger writing, one screen at a time.</p>`, () => {
    $$('#lkView button').forEach(b => b.onclick = () => { setView(b.dataset.v); $$('#lkView button').forEach(x => x.classList.toggle('on', x === b)); });
  });
}
$('#btnLook').onclick = openLook;

/* page-turn animation: the old page slides away while the new one slides in from the other side
   (right-to-left book: going forward brings the next page in from the left) */
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.22,.8,.3,1)';
function fadeIn() {
  if (reduceMotion()) return;
  stage.animate([{ opacity: 0, transform: 'translateY(10px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
}
function animateTurn(dir, fn, dx = 0) {
  if (reduceMotion()) return fn();
  const rv = readView.getBoundingClientRect(), sign = dir > 0 ? 1 : -1;
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'fixed', left: rv.left + 'px', top: rv.top + 'px', width: rv.width + 'px', height: rv.height + 'px', overflow: 'hidden', pointerEvents: 'none', zIndex: 5, background: 'var(--bg)' });
  const g = stage.cloneNode(true);
  g.removeAttribute('id');
  g.style.width = stage.offsetWidth + 'px';
  g.style.transition = 'none';
  g.style.transform = `translate(${dx}px, ${-readView.scrollTop}px)`;
  wrap.append(g); document.body.append(wrap);
  stage.style.transition = ''; stage.style.transform = '';
  fn();
  wrap.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${sign * 24}%)`, opacity: 0 }], { duration: 340, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).onfinish = () => wrap.remove();
  stage.animate([{ transform: `translateX(${-sign * 24}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: EASE });
}

function goto(page, o = {}) {
  const from = cur, wasRead = $('#v-read').classList.contains('on');
  cur = clamp(page, 1, TOTAL_PAGES);
  focusPage = cur;
  if (o.k) hlKey = o.k; else if (!o.keep) hlKey = null;
  show('read', true);
  render();
  if (!o.quiet && (!wasRead || cur !== from)) fadeIn();
  if (o.k) {
    focusPage = cur = AY[o.k].page;
    if (flowMode()) showKey(o.k);
    else { const w = $(`.w[data-k="${o.k}"]`, stage); if (w) w.scrollIntoView({ block: 'center', inline: 'nearest' }); syncTop(); }
  }
}
function step(dir, dx = 0) {
  if (flowMode()) return flowStep(dir);
  const to = clamp(cur + dir * (spreadOn ? 2 : 1), 1, TOTAL_PAGES);
  if (to === cur) return false;
  animateTurn(dir, () => goto(to, { quiet: true }), dx);
  return true;
}
$('#navNext').onclick = () => step(1);
$('#navPrev').onclick = () => step(-1);

// 15-line view: the page follows your finger, then turns (swipe right = next page)
let tx = 0, ty = 0, tt = 0, mDrag = false;
stage.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now(); mDrag = false; }, { passive: true });
stage.addEventListener('touchmove', e => {
  if (flowMode() || ST.settings.zoom > 1.02 || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - tx, dy = e.touches[0].clientY - ty;
  if (!mDrag && (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2)) return;
  mDrag = true;
  stage.style.transition = 'none';
  stage.style.transform = `translateX(${dx}px)`;
}, { passive: true });
function endMush(e) {
  if (!mDrag) return;
  mDrag = false;
  const dx = e.changedTouches[0].clientX - tx, fast = Date.now() - tt < 350;
  if (Math.abs(dx) > (fast ? 45 : readView.clientWidth * 0.25) && step(dx > 0 ? 1 : -1, dx)) return;
  stage.style.transition = `transform .25s ${EASE}`;
  stage.style.transform = '';
  setTimeout(() => { stage.style.transition = ''; }, 270);
}
stage.addEventListener('touchend', endMush);
stage.addEventListener('touchcancel', endMush);
addEventListener('keydown', e => {
  if (!$('#v-read').classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !$('#sheet').hidden) return;
  if (e.key === 'ArrowLeft') step(1);
  else if (e.key === 'ArrowRight') step(-1);
  else if (e.key === 'b' || e.key === 'B') toggleBm();
});
let rzT; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (!$('#v-read').classList.contains('on') || !PAGES) return; const k = flowMode() ? firstVisibleKey() : null; render(); if (k) showKey(k); }, 150); });

stage.addEventListener('click', e => {
  const w = e.target.closest('.w');
  if (!w) return;
  const [s, a] = w.dataset.k.split(':').map(Number);
  openAyah(s, a);
});

/* ───────────── tabs & views ───────────── */
function show(v, norender) {
  $$('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#topbar').classList.toggle('hide', v !== 'read');
  if (v === 'read' && PAGES && !norender) render();
  if (v === 'surah') renderSurahs();
  if (v === 'para') renderParas();
  if (v === 'daily') renderDaily();
  if (v === 'saved') renderSaved();
  if (v === 'set') renderSettings();
}
$$('#tabs button').forEach(b => b.onclick = () => show(b.dataset.v));

/* ───────────── toast / sheet ───────────── */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }
function openSheet(html, after) {
  const sh = $('#sheet'); sh.innerHTML = html; sh.hidden = false; $('#scrim').hidden = false; sh.scrollTop = 0;
  if (after) after(sh);
}
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; if (hlKey && !$('#v-read').classList.contains('on')) hlKey = null; }
$('#scrim').onclick = () => { closeSheet(); if (hlKey) { hlKey = null; applyMarks(); } };
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) $('#scrim').click(); });

/* ───────────── ayah sheet ───────────── */
async function openAyah(s, a) {
  const k = key(s, a), ay = AY[k];
  hlKey = k; applyMarks();
  const trs = [];
  const want = ST.settings.tr === 'both' ? ['en', 'ur'] : ST.settings.tr === 'none' ? [] : [ST.settings.tr];
  for (const l of want) { const t = await loadTr(l); trs.push([l, t[s - 1][a - 1]]); }
  const bm = ST.bms.find(b => b.s === s && b.a === a);
  openSheet(`
    <div class="row"><div><b>${esc(surahName(s))} ${s}:${a}</b><div class="muted sm">${esc(SUR[s - 1].tr)} · Page ${ay.page} · Para ${juzOf(s, a)}</div></div><span class="sp"></span><button class="ib" id="shClose" aria-label="Close">✕</button></div>
    <div class="big-ar">${esc(ay.text)} <span style="color:var(--accent)">${esc(ay.marker)}</span></div>
    ${trs.map(([l, t]) => l === 'en' ? `<p class="tr-en">${esc(t)}</p>` : `<p class="tr-ur">${esc(t)}</p>`).join('')}
    ${want.length ? `<div class="muted sm">${want.includes('en') ? 'Saheeh International' : ''}${want.length > 1 ? ' · ' : ''}${want.includes('ur') ? 'Fateh Muhammad Jalandhry' : ''}</div>` : ''}
    <div class="btns">
      <button class="btn" id="shPlay">▶ Play from here</button>
      <button class="btn ghost" id="shBm">${bm ? '★ Bookmarked' : '☆ Bookmark'}</button>
      <button class="btn ghost" id="shCopy">Copy</button>
      <button class="btn ghost" id="shShare">Share</button>
    </div>
    <div id="bmEdit"></div>`, sh => {
    $('#shClose').onclick = () => $('#scrim').click();
    $('#shPlay').onclick = () => { closeSheet(); playFrom(s, a); };
    $('#shCopy').onclick = async () => { await navigator.clipboard?.writeText(shareText(s, a, trs)); toast('Copied'); };
    $('#shShare').onclick = async () => { const text = shareText(s, a, trs); if (navigator.share) { try { await navigator.share({ text }); } catch {} } else { await navigator.clipboard?.writeText(text); toast('Copied'); } };
    $('#shBm').onclick = () => bmEditor(s, a);
    if (bm) bmEditor(s, a);
  });
}
const shareText = (s, a, trs) => `${AY[key(s, a)].text} ${AY[key(s, a)].marker}\n${trs.map(t => t[1]).join('\n')}\n— ${surahName(s)} ${s}:${a}`;

function bmEditor(s, a) {
  const box = $('#bmEdit');
  let bm = ST.bms.find(b => b.s === s && b.a === a);
  let color = bm?.color || COLORS[0];
  box.innerHTML = `<h3>Bookmark</h3>
    <div class="cols">${COLORS.map(c => `<button class="sw ${c === color ? 'on' : ''}" style="--c:${c}" data-c="${c}" aria-label="colour"></button>`).join('')}</div>
    <input type="text" id="bmNote" placeholder="Add a note (optional)" value="${esc(bm?.note || '')}">
    <div class="btns"><button class="btn" id="bmSave">${bm ? 'Update' : 'Save bookmark'}</button>${bm ? '<button class="btn danger" id="bmDel">Remove</button>' : ''}</div>`;
  $$('.sw', box).forEach(b => b.onclick = () => { color = b.dataset.c; $$('.sw', box).forEach(x => x.classList.toggle('on', x === b)); });
  $('#bmSave').onclick = () => {
    const note = $('#bmNote').value.trim();
    if (bm) Object.assign(bm, { color, note });
    else ST.bms.push({ id: Date.now().toString(36), s, a, page: AY[key(s, a)].page, note, color, t: Date.now() });
    save(); applyMarks(); toast('Bookmark saved'); $('#scrim').click();
  };
  if (bm) $('#bmDel').onclick = () => { ST.bms = ST.bms.filter(b => b !== bm); save(); applyMarks(); toast('Bookmark removed'); $('#scrim').click(); };
  box.scrollIntoView({ block: 'nearest' });
}
function toggleBm() {
  const i = ST.bms.findIndex(b => !b.s && b.page === focusPage);
  if (i >= 0) { ST.bms.splice(i, 1); toast('Page bookmark removed'); }
  else { ST.bms.push({ id: Date.now().toString(36), page: focusPage, note: '', color: COLORS[0], t: Date.now() }); toast('Page ' + focusPage + ' bookmarked'); }
  save(); syncTop();
}
$('#btnBm').onclick = toggleBm;
function setTheme() {
  ST.settings.theme = 'light';
  document.documentElement.removeAttribute('data-theme');
}

/* ───────────── go-to sheet ───────────── */
$('#btnMenu').onclick = () => {
  openSheet(`<h2>Go to</h2>
    <div class="row"><input type="number" id="gPage" min="1" max="${TOTAL_PAGES}" placeholder="Page (1–${TOTAL_PAGES})" value="${focusPage}"><button class="btn" id="gPageGo">Go</button></div>
    <h3>Surah</h3><select id="gSurah">${SUR.map(s => `<option value="${s.id}">${s.id}. ${esc(s.en)} — ${esc(s.ar)}</option>`).join('')}</select>
    <h3>Para</h3><select id="gJuz">${JUZ.map((_, i) => `<option value="${i + 1}">Para ${i + 1} · ${esc(PARA_EN[i])} (page ${juzPage(i + 1)})</option>`).join('')}</select>`, sh => {
    const go = p => { closeSheet(); goto(p); };
    $('#gPageGo').onclick = () => go(+$('#gPage').value || 1);
    $('#gPage').onkeydown = e => e.key === 'Enter' && $('#gPageGo').click();
    $('#gSurah').value = PGINFO[focusPage].first[0];
    $('#gSurah').onchange = e => go(surahPage(+e.target.value));
    $('#gJuz').value = juzOf(...PGINFO[focusPage].first);
    $('#gJuz').onchange = e => go(juzPage(+e.target.value));
    $('#gPage').select();
  });
};

/* ───────────── audio ───────────── */
const audio = new Audio();
let queueStart = null, playKey = null, repLeft = 1, paused = false;
const pad = n => String(n).padStart(3, '0');
function playFrom(s, a) {
  queueStart = key(s, a); repLeft = ST.settings.repeat; startPlay(queueStart);
}
function startPlay(k) {
  const ay = AY[k]; if (!ay) return stopPlay();
  playKey = k; paused = false;
  audio.src = `https://everyayah.com/data/${ST.settings.reciter}/${pad(ay.s)}${pad(ay.a)}.mp3`;
  audio.play().catch(() => { toast('Audio needs an internet connection'); stopPlay(); });
  $('#player').hidden = false;
  $('#pTitle').textContent = `${surahName(ay.s)} ${ay.s}:${ay.a}`;
  $('#pSub').textContent = RECITERS[ST.settings.reciter] + (ST.settings.repeat > 1 ? ` · ×${ST.settings.repeat}` : '');
  $('#pPlay').textContent = '⏸';
  if (!visiblePages().includes(ay.page)) { cur = ay.page; focusPage = ay.page; render(); }
  applyMarks();
  if (flowMode()) showKey(k);
  else { const w = $(`.w.playing`, stage); if (w) w.scrollIntoView({ block: 'nearest' }); }
}
function stopPlay() { audio.pause(); playKey = null; $('#player').hidden = true; applyMarks(); }
audio.onended = () => {
  if (repLeft > 1) { repLeft--; audio.currentTime = 0; audio.play(); return; }
  const n = ORDER[idxOf(playKey) + 1];
  const same = n && AY[n].s === AY[playKey].s;
  if (!same) { stopPlay(); return; }
  repLeft = ST.settings.repeat; startPlay(n);
};
audio.onerror = () => { if (playKey) { toast('Could not load audio (offline?)'); stopPlay(); } };
$('#pPlay').onclick = () => { if (audio.paused) { audio.play(); $('#pPlay').textContent = '⏸'; } else { audio.pause(); $('#pPlay').textContent = '▶'; } };
$('#pStop').onclick = stopPlay;
$('#pNext').onclick = () => { const n = ORDER[idxOf(playKey) + 1]; if (n) { repLeft = ST.settings.repeat; startPlay(n); } };
$('#pPrev').onclick = () => { const p = ORDER[idxOf(playKey) - 1]; if (p) { repLeft = ST.settings.repeat; startPlay(p); } };

/* ───────────── reading tracking & daily logic ───────────── */
let readT;
const lastPage = n => AY[key(n, SUR[n - 1].n)].page;
const surahDoneOn = (n, day = ymd(new Date())) => (ST.sdone[day] || []).includes(n);
function setSurahDone(n, on, day = ymd(new Date())) {
  const a = (ST.sdone[day] ||= []), i = a.indexOf(n);
  if (on && i < 0) a.push(n); else if (!on && i >= 0) a.splice(i, 1);
}
const pagesToday = () => (ST.read[ymd(new Date())] || []).length;
// A day is complete when the page goal is met and every surah on the daily list has been recited.
function dayComplete() {
  const day = ymd(new Date());
  return pagesToday() >= ST.settings.dailyGoal && ST.dailySurahs.every(n => surahDoneOn(n, day));
}
function markDay() { if (dayComplete()) ST.doneDays[ymd(new Date())] = true; }
function trackRead(pages) {
  clearTimeout(readT);
  readT = setTimeout(() => {
    if (!$('#v-read').classList.contains('on')) return;
    const day = ymd(new Date());
    const r = (ST.read[day] ||= []);
    let changed = false;
    for (const p of pages) {
      if (!r.includes(p)) { r.push(p); changed = true; }
      if (!ST.khatam.includes(p)) { ST.khatam.push(p); changed = true; }
    }
    if (ST.khatam.length >= TOTAL_PAGES) { ST.khatams++; ST.khatam = []; toast('Khatam complete — Alhamdulillah!'); }
    // a daily surah counts as recited once every page of it has been read today
    for (const n of ST.dailySurahs) {
      if (surahDoneOn(n, day)) continue;
      let all = true;
      for (let p = surahPage(n); p <= lastPage(n); p++) if (!r.includes(p)) { all = false; break; }
      if (all) { setSurahDone(n, true, day); changed = true; toast(`${surahName(n)} done for today ✓`); }
    }
    if (changed) { markDay(); save(); }
  }, 6000);
}
function streak() {
  const d = new Date(); let n = 0;
  if (!ST.doneDays[ymd(d)]) d.setDate(d.getDate() - 1);
  while (ST.doneDays[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function hijri() { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch { return ''; } }

function renderDaily() {
  markDay(); save();
  const d = new Date(), goal = ST.settings.dailyGoal, pt = pagesToday();
  const pct = Math.min(100, Math.round(pt / goal * 100));
  const kp = Math.round(ST.khatam.length / TOTAL_PAGES * 100);
  const list = ST.dailySurahs, doneN = list.filter(n => surahDoneOn(n)).length;
  const lp = ST.last.page, [ls, la] = PGINFO[lp].first;
  const complete = dayComplete();
  const status = complete ? 'Today is complete — well done!'
    : [pt < goal ? `${goal - pt} more page${goal - pt > 1 ? 's' : ''}` : '', list.length && doneN < list.length ? `${list.length - doneN} surah${list.length - doneN > 1 ? 's' : ''} to recite` : ''].filter(Boolean).join(' · ') + ' to go';
  $('#dailyBody').innerHTML = `
    <h2>Today</h2>
    <div class="muted sm" style="margin-top:-8px;margin-bottom:12px">${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${hijri() ? ' · ' + esc(hijri()) : ''}</div>
    <div class="card">
      <div class="row">
        <div class="ring" style="--p:${pct}"><i><span>${pt}/${goal}<small>pages</small></span></i></div>
        <div class="sp"><b>Daily goal</b>
          <div class="muted sm">${esc(status)}</div>
          <div class="row" style="margin-top:8px;gap:6px"><button class="ib" data-act="goal-" aria-label="Fewer pages" style="border:1px solid var(--line);min-width:34px;min-height:34px;padding:0">−</button><span class="sm"><b>${goal}</b> page${goal > 1 ? 's' : ''} / day</span><button class="ib" data-act="goal+" aria-label="More pages" style="border:1px solid var(--line);min-width:34px;min-height:34px;padding:0">+</button></div></div>
      </div>
      <div class="row sm" style="margin-top:12px"><span class="pill">🔥 ${streak()} day streak</span><span class="pill">Khatam ${kp}%${ST.khatams ? ` · ${ST.khatams}×` : ''}</span></div>
      <div class="row" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
        <div class="sp"><b>Continue reading</b><div class="muted sm">Page ${lp} · ${esc(surahName(ls))} · Para ${juzOf(ls, la)}</div></div>
        <button class="btn" data-act="resume">Resume</button></div>
    </div>
    <div class="row" style="margin:22px 0 8px"><h3 style="margin:0">Daily surahs${list.length ? ` · ${doneN}/${list.length}` : ''}</h3><span class="sp"></span><button class="btn sm" data-act="add">+ Add surah</button></div>
    ${list.length ? list.map(n => {
      const S = SUR[n - 1], done = surahDoneOn(n), pg = lastPage(n) - surahPage(n) + 1;
      return `<div class="card" data-s="${n}">
        <div class="row"><div class="num">${n}</div><div class="sp"><b>${esc(S.en)}</b><div class="muted sm">${S.n} ayahs · ${pg} page${pg > 1 ? 's' : ''} · from p.${surahPage(n)}</div></div><div class="ar" style="font-size:26px">${esc(S.ar)}</div></div>
        <div class="btns"><button class="btn sm" data-act="read">Read</button><button class="btn ghost sm" data-act="listen">▶ Listen</button><button class="btn sm ${done ? '' : 'ghost'}" data-act="done">${done ? '✓ Done today' : 'Mark done'}</button><button class="btn ghost sm" data-act="rm" aria-label="Remove ${esc(S.en)}">Remove</button></div></div>`;
    }).join('') : `<div class="card"><div class="muted sm">Add the surahs you want to recite every day. They reset each morning, and a surah is ticked automatically once you have read all its pages.</div></div>`}`;
}
$('#dailyBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, n = +(b.dataset.s || b.closest('[data-s]')?.dataset.s || 0);
  const S = ST.settings;
  if (act === 'goal-' || act === 'goal+') { S.dailyGoal = clamp(S.dailyGoal + (act === 'goal+' ? 1 : -1), 1, 60); save(); renderDaily(); }
  else if (act === 'resume') goto(ST.last.page);
  else if (act === 'add') openAddSurah();
  else if (act === 'read') goto(surahPage(n));
  else if (act === 'listen') { goto(surahPage(n)); playFrom(n, 1); }
  else if (act === 'done') { setSurahDone(n, !surahDoneOn(n)); save(); renderDaily(); }
  else if (act === 'rm') { ST.dailySurahs = ST.dailySurahs.filter(x => x !== n); save(); renderDaily(); }
});
function openAddSurah() {
  const draw = (q = '') => {
    const nq = normLat(q);
    $('#asList').innerHTML = SUR.filter(s => !nq || normLat(s.en).includes(nq) || normLat(s.tr).includes(nq) || String(s.id) === nq || normAr(s.ar).includes(normAr(q)))
      .map(s => { const on = ST.dailySurahs.includes(s.id); return `<div class="item" data-s="${s.id}"><div class="num">${s.id}</div><div class="sp"><b>${esc(s.en)}</b><div class="muted sm">${esc(s.tr)} · ${s.n} ayahs</div></div><div class="ar" style="font-size:20px">${esc(s.ar)}</div><span class="pill" style="${on ? 'background:var(--accent);color:var(--accent-ink);border-color:var(--accent)' : ''}">${on ? '✓ Added' : 'Add'}</span></div>`; }).join('');
  };
  openSheet(`<h2>Add surah to your daily list</h2><input type="search" id="asQ" placeholder="Search sura…" autocomplete="off"><div id="asList" style="margin-top:6px"></div><div class="btns"><button class="btn" id="asDone">Done</button></div>`, () => {
    draw();
    $('#asQ').oninput = e => draw(e.target.value);
    $('#asList').onclick = e => {
      const it = e.target.closest('.item'); if (!it) return;
      const n = +it.dataset.s, i = ST.dailySurahs.indexOf(n);
      if (i >= 0) ST.dailySurahs.splice(i, 1); else ST.dailySurahs.push(n);
      save(); draw($('#asQ').value); renderDaily();
    };
    $('#asDone').onclick = () => $('#scrim').click();
  });
}

/* ───────────── index & search ───────────── */
function renderSurahs() {
  $('#surahList').innerHTML = SUR.map(s => `<div class="item" data-p="${surahPage(s.id)}"><div class="num">${s.id}</div><div class="sp"><b>${esc(s.en)}</b><div class="muted sm">${esc(s.tr)} · ${s.n} ayahs · ${s.place}</div></div><div class="ar">${esc(s.ar)}</div><span class="pill">p.${surahPage(s.id)}</span></div>`).join('');
  $$('#surahList .item').forEach(e => e.onclick = () => goto(+e.dataset.p));
}
function renderParas() {
  $('#paraList').innerHTML = JUZ.map(([s, a], i) => {
    const first = AY[key(s, a)].words.slice(0, 3).join(' ');
    return `<div class="item" data-p="${juzPage(i + 1)}"><div class="num">${i + 1}</div><div class="sp"><b>Para ${i + 1} · ${esc(PARA_EN[i])}</b><div class="muted sm">${esc(surahName(s))} ${s}:${a} · page ${juzPage(i + 1)}</div></div><div class="ar para-ar">${esc(first)}</div></div>`;
  }).join('');
  $$('#paraList .item').forEach(e => e.onclick = () => goto(+e.dataset.p));
}
const normAr = s => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/[يىی]/g, 'ي').replace(/[ك]/g, 'ك').replace(/ک/g, 'ك').replace(/ة/g, 'ه').replace(/ہ|ھ/g, 'ه').replace(/\s+/g, ' ').trim();
const normLat = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
let NORM;
function buildNorm() { NORM = ORDER.map(k => normAr(AY[k].text)); }
let qT;
$('#q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(runSearch, 120); });
async function runSearch() {
  const raw = $('#q').value.trim(), box = $('#qres');
  if (!raw) { box.innerHTML = ''; $('#surahList').hidden = false; return; }
  $('#surahList').hidden = true;
  const out = [];
  const item = (title, sub, p, k, ar) => out.push(`<div class="item" data-p="${p}" ${k ? `data-k="${k}"` : ''}><div class="sp"><b>${title}</b><div class="muted sm">${sub}</div></div>${ar ? `<div class="ar" style="font-size:20px;max-width:55%">${ar}</div>` : ''}</div>`);
  let m;
  if ((m = raw.match(/^(\d{1,3})\s*[:.\-\s]\s*(\d{1,3})$/))) {
    const s = +m[1], a = +m[2];
    if (s >= 1 && s <= 114 && AY[key(s, a)]) item(`${esc(surahName(s))} ${s}:${a}`, `Ayah · page ${AY[key(s, a)].page}`, AY[key(s, a)].page, key(s, a), esc(AY[key(s, a)].text.slice(0, 60)));
  }
  if ((m = raw.match(/^(?:p(?:age)?\s*)?(\d{1,3})$/i))) {
    const n = +m[1];
    if (n >= 1 && n <= 114 && !/^p/i.test(raw)) item(`Surah ${n} — ${esc(surahName(n))}`, `${esc(SUR[n - 1].tr)} · page ${surahPage(n)}`, surahPage(n));
    if (n >= 1 && n <= TOTAL_PAGES) item(`Page ${n}`, `${esc(surahName(PGINFO[n].first[0]))} · Para ${juzOf(...PGINFO[n].first)}`, n);
  }
  if ((m = raw.match(/^(?:juz|para|paara|siparah)\s*(\d{1,2})$/i)) && +m[1] >= 1 && +m[1] <= 30) item(`Para ${m[1]} · ${esc(PARA_EN[+m[1] - 1])}`, `Page ${juzPage(+m[1])}`, juzPage(+m[1]));
  const hasAr = /[؀-ۿ]/.test(raw), q = hasAr ? normAr(raw) : normLat(raw);
  if (q) {
    if (hasAr) SUR.forEach(s => { if (normAr(s.ar).includes(q)) item(`${esc(s.en)} (${s.id})`, `Surah · page ${surahPage(s.id)}`, surahPage(s.id), '', esc(s.ar)); });
    else SUR.forEach(s => { if (normLat(s.en).includes(q) || normLat(s.tr).includes(q) || normLat(s.en).replace(/^a[lsdtznr] ?/, '').includes(q)) item(`${esc(s.en)} (${s.id})`, `${esc(s.tr)} · page ${surahPage(s.id)}`, surahPage(s.id), '', esc(s.ar)); });
    let hits = 0;
    if (hasAr && q.length >= 2) {
      if (!NORM) buildNorm();
      for (let i = 0; i < NORM.length && hits < 40; i++) if (NORM[i].includes(q)) { const ay = AY[ORDER[i]]; item(`${esc(surahName(ay.s))} ${ay.s}:${ay.a}`, `Page ${ay.page}`, ay.page, ORDER[i], esc(ay.text.slice(0, 70))); hits++; }
    } else if (!hasAr && q.length >= 3) {
      const en = await loadTr('en'); if ($('#q').value.trim() !== raw) return;
      outer: for (let s = 0; s < 114; s++) for (let a = 0; a < en[s].length; a++) if (normLat(en[s][a]).includes(q)) {
        const k = key(s + 1, a + 1), ay = AY[k]; item(`${esc(surahName(s + 1))} ${s + 1}:${a + 1}`, esc(en[s][a].slice(0, 130)), ay.page, k); if (++hits >= 40) break outer;
      }
    }
  }
  box.innerHTML = out.length ? out.join('') : '<div class="empty">No results</div>';
  $$('.item', box).forEach(e => e.onclick = () => { goto(+e.dataset.p, e.dataset.k ? { k: e.dataset.k } : {}); });
}

/* ───────────── saved ───────────── */
function renderSaved() {
  const list = [...ST.bms].sort((a, b) => b.t - a.t);
  const box = $('#savedBody');
  box.innerHTML = `<h2>Bookmarks</h2>` + (list.length ? list.map(b => `
    <div class="item" data-id="${b.id}"><span class="dot" style="--c:${b.color}"></span>
      <div class="sp"><b>${b.s ? `${esc(surahName(b.s))} ${b.s}:${b.a}` : `Page ${b.page}`}</b>
      <div class="muted sm">${b.s ? `Page ${b.page} · ` : esc(surahName(PGINFO[b.page].first[0])) + ' · '}${new Date(b.t).toLocaleDateString()}</div>
      ${b.note ? `<div class="sm">${esc(b.note)}</div>` : ''}
      ${b.s ? `<div class="ar" style="font-size:19px">${esc(AY[key(b.s, b.a)].text.slice(0, 70))}…</div>` : ''}</div>
      <button class="ib" data-act="edit" aria-label="Edit">✎</button><button class="ib" data-act="del" aria-label="Delete">🗑</button></div>`).join('')
    : `<div class="empty">No bookmarks yet.<br>Tap the ribbon at the top to save a page, or tap any ayah to bookmark it.</div>`);
  $$('.item', box).forEach(e => e.onclick = ev => {
    const b = ST.bms.find(x => x.id === e.dataset.id), act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') { ST.bms = ST.bms.filter(x => x !== b); save(); renderSaved(); return; }
    if (act === 'edit') {
      openSheet(`<h2>Edit bookmark</h2><div class="cols">${COLORS.map(c => `<button class="sw ${c === b.color ? 'on' : ''}" style="--c:${c}" data-c="${c}"></button>`).join('')}</div><input type="text" id="eNote" value="${esc(b.note)}" placeholder="Note"><div class="btns"><button class="btn" id="eSave">Save</button></div>`, sh => {
        let col = b.color; $$('.sw', sh).forEach(s => s.onclick = () => { col = s.dataset.c; $$('.sw', sh).forEach(x => x.classList.toggle('on', x === s)); });
        $('#eSave').onclick = () => { b.note = $('#eNote').value.trim(); b.color = col; save(); closeSheet(); renderSaved(); };
      });
      return;
    }
    goto(b.page, b.s ? { k: key(b.s, b.a) } : {});
  });
}

/* ───────────── settings ───────────── */
function renderSettings() {
  const S = ST.settings;
  const opt = (v, cur, label) => `<option value="${v}" ${v == cur ? 'selected' : ''}>${label}</option>`;
  $('#setBody').innerHTML = `
    <h2>Settings</h2>
    <h3>Reading</h3>
    <label class="f">Translation<select id="sTr">${opt('en', S.tr, 'English (Saheeh Intl)')}${opt('ur', S.tr, 'Urdu (Jalandhry)')}${opt('both', S.tr, 'English + Urdu')}${opt('none', S.tr, 'None')}</select></label>
    <h3>Audio</h3>
    <label class="f">Reciter<select id="sRec">${Object.entries(RECITERS).map(([k, v]) => opt(k, S.reciter, v)).join('')}</select></label>
    <label class="f">Repeat each ayah<select id="sRep">${[1, 2, 3, 5, 10].map(n => opt(n, S.repeat, n === 1 ? 'Once' : n + ' times')).join('')}</select></label>
    <h3>Daily</h3>
    <label class="f">Daily page goal<input type="number" id="sGoal" min="1" max="60" value="${S.dailyGoal}"></label>
    <h3>Your data</h3>
    <div class="muted sm">Khatam progress: ${ST.khatam.length}/${TOTAL_PAGES} pages · ${ST.bms.length} bookmarks · ${Object.keys(ST.read).length} days read</div>
    <div class="btns"><button class="btn ghost sm" id="sExp">Export backup</button><button class="btn ghost sm" id="sImp">Import backup</button><button class="btn danger sm" id="sRst">Reset khatam</button></div>
    <input type="file" id="sFile" accept="application/json" hidden>
    <h3>About</h3>
    <p class="muted sm">15-line Indo-Pak mushaf (610 pages, Qudratullah layout) with Hanafi Nastaleeq fonts from the <a href="https://qul.tarteel.ai" target="_blank" rel="noopener">Quranic Universal Library</a> by Tarteel. Translations via <a href="https://quran.com" target="_blank" rel="noopener">Quran.com</a>; audio streamed from <a href="https://everyayah.com" target="_blank" rel="noopener">EveryAyah</a>. Everything you save stays on this device.</p>`;
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('#sTr', 'change', e => { S.tr = e.target.value; save(); });
  on('#sRec', 'change', e => { S.reciter = e.target.value; save(); });
  on('#sRep', 'change', e => { S.repeat = +e.target.value; save(); });
  on('#sGoal', 'change', e => { S.dailyGoal = clamp(+e.target.value || 1, 1, 60); save(); });
  on('#sRst', 'click', () => { if (confirm('Reset khatam progress to 0?')) { ST.khatam = []; save(); renderSettings(); } });
  on('#sExp', 'click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ST, null, 1)], { type: 'application/json' }));
    a.download = `mushaf-backup-${ymd(new Date())}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  on('#sImp', 'click', () => $('#sFile').click());
  on('#sFile', 'change', async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(d.bms) || !d.settings) throw 0;
      ST = Object.assign(structuredClone(DEF), d); ST.settings = Object.assign({}, DEF.settings, d.settings);
      setTheme(); save(); toast('Backup restored'); renderSettings();
    } catch { toast('That file is not a valid backup'); }
  });
}

/* ───────────── boot ───────────── */
async function boot() {
  const t0 = Date.now(), msg = t => { const m = $('#bootmsg'); if (m) m.textContent = t; };
  setTheme();
  try {
    msg('Loading the Quran…');
    await loadData();
    msg('Preparing the script…');
    await Promise.all(FONTS.map(f => document.fonts.load(`40px "${f}"`, 'بِسْمِ اللّٰهِ')));
    await document.fonts.ready;
  } catch (e) {
    msg('Could not load the Quran data. Please serve this folder over http (see README) and reload.');
    $('#boot').classList.add('failed');
    console.error(e); return;
  }
  calibrate();
  msg('Bismillah…');
  render();
  await new Promise(r => setTimeout(r, Math.max(0, 1100 - (Date.now() - t0))));
  $('#boot').classList.add('off');
  setTimeout(() => $('#boot').remove(), 400);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__mushaf = { goto, render, ST, AY, PAGES };
}
boot();
})();
