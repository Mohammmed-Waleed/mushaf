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
const THEMES = ['light', 'sepia', 'dark', 'black'];
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
  settings: { theme: 'light', view: 'flow', fontSize: 36, zoom: 1, fitPage: true, spread: true, tr: 'en', reciter: 'Alafasy_128kbps', repeat: 1,
              dailyGoal: 2, dailyMode: 'rotate', fixedSurah: 36, fridayKahf: true },
  last: { page: 1, s: 1, a: 1 },
  bms: [],
  read: {},        // 'YYYY-MM-DD' -> [pages read that day]
  khatam: [],      // pages read in the current khatam cycle
  khatams: 0,
  surahDone: {},   // 'YYYY-MM-DD' -> true
};
let ST;
try { ST = JSON.parse(localStorage.getItem('mushaf.v1') || 'null'); } catch { ST = null; }
ST = Object.assign(structuredClone(DEF), ST || {});
ST.settings = Object.assign({}, DEF.settings, ST.settings);
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
  $('#ttlJuz').textContent = `Para ${juzOf(s, a)} · ${spreadOn ? 'pages ' + visiblePages().join('–') : 'page ' + focusPage + ' of ' + TOTAL_PAGES}`;
  $('#btnBm').classList.toggle('on', ST.bms.some(b => !b.s && b.page === focusPage));
}

/* ───────────── large-text flowing view ───────────── */
let flowFirst = 0, flowLast = 0, flowRaf = 0;
const BSM = 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِیْمِ';
function flowPage(p) {
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
  return el;
}
function flowEnd() { return $('.fend', stage); }
function appendFlow() {
  if (flowLast >= TOTAL_PAGES) return;
  const el = flowPage(++flowLast);
  stage.insertBefore(el, flowEnd());
  markScope(el);
  if (flowLast - flowFirst >= 14 && focusPage > flowFirst + 4) {   // keep the DOM small on long reads
    const h0 = readView.scrollHeight, first = $('.fp', stage);
    first.remove(); flowFirst++;
    readView.scrollTop -= h0 - readView.scrollHeight;
  }
  $('.fprev', stage).hidden = flowFirst <= 1;
}
function prependFlow() {
  if (flowFirst <= 1) return;
  const h0 = readView.scrollHeight;
  const el = flowPage(--flowFirst);
  stage.insertBefore(el, $('.fp', stage));
  markScope(el);
  readView.scrollTop += readView.scrollHeight - h0;
  if (flowLast - flowFirst >= 14) { $$('.fp', stage).pop().remove(); flowLast--; }
  $('.fprev', stage).hidden = flowFirst <= 1;
}
function fillFlow() {
  while (flowLast < TOTAL_PAGES && readView.scrollHeight < readView.scrollTop + readView.clientHeight * 2.5) appendFlow();
}
function renderFlow() {
  spreadOn = false;
  stage.className = 'flow';
  stage.style.setProperty('--fs', ST.settings.fontSize + 'px');
  stage.replaceChildren();
  const prev = document.createElement('button'); prev.className = 'btn ghost sm fprev'; prev.textContent = '↑ Previous page';
  prev.onclick = prependFlow;
  const end = document.createElement('div'); end.className = 'fend';
  const next = document.createElement('button'); next.className = 'btn ghost sm fnext'; next.textContent = 'Next page ↓';
  next.onclick = () => { appendFlow(); readView.scrollBy({ top: readView.clientHeight * 0.8, behavior: 'smooth' }); };
  end.append(next);
  stage.append(prev, end);
  flowFirst = flowLast = cur;
  stage.insertBefore(flowPage(cur), end);
  prev.hidden = cur <= 1;
  readView.scrollTop = 0;
  markScope(stage);
  fillFlow();
  syncTop();
  ST.last.page = cur; save();
  trackRead([cur]);
}
function onFlowScroll() {
  flowRaf = 0;
  if (!flowMode() || !$('#v-read').classList.contains('on')) return;
  if (readView.scrollTop + readView.clientHeight * 2 > readView.scrollHeight) fillFlow();
  const top = readView.getBoundingClientRect().top + 70;
  let pg = flowFirst;
  for (const el of $$('.fp', stage)) { if (el.getBoundingClientRect().top <= top) pg = +el.dataset.page; else break; }
  if (pg !== focusPage) { focusPage = cur = pg; ST.last.page = pg; save(); syncTop(); trackRead([pg]); }
}
readView.addEventListener('scroll', () => { if (!flowRaf && flowMode()) flowRaf = requestAnimationFrame(onFlowScroll); }, { passive: true });

function setFont(n) {
  ST.settings.fontSize = clamp(Math.round(n), 22, 84); save();
  stage.style.setProperty('--fs', ST.settings.fontSize + 'px');
}
function setView(v) {
  ST.settings.view = v; save();
  render();
}
function openLook() {
  const S = ST.settings;
  openSheet(`<h2>Reading view</h2>
    <div class="seg" id="lkView"><button data-v="flow" class="${S.view === 'flow' ? 'on' : ''}">Large text</button><button data-v="mushaf" class="${S.view === 'mushaf' ? 'on' : ''}">15-line mushaf</button></div>
    <h3>Text size (large text view)</h3>
    <div class="row"><button class="btn ghost" id="lkMinus" aria-label="Smaller">A−</button><input type="range" id="lkSize" min="22" max="84" value="${S.fontSize}" style="flex:1;width:auto"><button class="btn ghost" id="lkPlus" aria-label="Larger">A+</button></div>
    <div class="ar" id="lkPrev" style="font-size:${S.fontSize}px;text-align:center;margin-top:10px">اَلْحَمْدُ لِلّٰهِ رَبِّ الْعٰلَمِیْنَ</div>
    <h3>Theme</h3>
    <div class="seg" id="lkTheme">${THEMES.map(t => `<button data-t="${t}" class="${S.theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>`, sh => {
    $$('#lkView button').forEach(b => b.onclick = () => { setView(b.dataset.v); $$('#lkView button').forEach(x => x.classList.toggle('on', x === b)); });
    const size = n => { setFont(n); $('#lkSize').value = ST.settings.fontSize; $('#lkPrev').style.fontSize = ST.settings.fontSize + 'px'; };
    $('#lkSize').oninput = e => size(+e.target.value);
    $('#lkMinus').onclick = () => size(ST.settings.fontSize - 3);
    $('#lkPlus').onclick = () => size(ST.settings.fontSize + 3);
    $$('#lkTheme button').forEach(b => b.onclick = () => { setTheme(b.dataset.t); $$('#lkTheme button').forEach(x => x.classList.toggle('on', x === b)); });
  });
}
$('#btnLook').onclick = openLook;

function goto(page, o = {}) {
  cur = clamp(page, 1, TOTAL_PAGES);
  focusPage = cur;
  if (o.k) hlKey = o.k; else if (!o.keep) hlKey = null;
  show('read', true);
  render();
  if (o.k) { const w = $(`.w[data-k="${o.k}"]`, stage); if (w) w.scrollIntoView({ block: 'center', inline: 'nearest' }); focusPage = cur = AY[o.k].page; syncTop(); }
}
const step = dir => goto(cur + dir * (spreadOn ? 2 : 1), { keep: false });
$('#navNext').onclick = () => step(1);
$('#navPrev').onclick = () => step(-1);

// swipe (RTL book: swipe right → next page)
let tx = 0, ty = 0, tt = 0;
stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now(); }, { passive: true });
stage.addEventListener('touchend', e => {
  if (flowMode() || ST.settings.zoom > 1.02) return;
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 60 && Date.now() - tt < 600) step(dx > 0 ? 1 : -1);
}, { passive: true });
addEventListener('keydown', e => {
  if (!$('#v-read').classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !$('#sheet').hidden) return;
  if (e.key === 'ArrowLeft') step(1);
  else if (e.key === 'ArrowRight') step(-1);
  else if (e.key === 'b' || e.key === 'B') toggleBm();
});
let rzT; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => $('#v-read').classList.contains('on') && PAGES && !flowMode() && render(), 150); });

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
$('#btnTheme').onclick = () => setTheme(THEMES[(THEMES.indexOf(ST.settings.theme) + 1) % THEMES.length]);
function setTheme(t) {
  ST.settings.theme = t; save();
  document.documentElement.dataset.theme = t === 'light' ? '' : t;
  $('meta[name=theme-color]').content = { light: '#efe7d3', sepia: '#d9c9a3', dark: '#14181a', black: '#000000' }[t];
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
  if (flowMode() && ay.page > flowLast && ay.page <= flowLast + 2) while (flowLast < ay.page) appendFlow();
  if (!visiblePages().includes(ay.page)) { cur = ay.page; focusPage = ay.page; render(); }
  applyMarks();
  const w = $(`.w.playing`, stage); if (w) w.scrollIntoView({ block: flowMode() ? 'center' : 'nearest', behavior: flowMode() ? 'smooth' : 'auto' });
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
    if (changed) save();
  }, 6000);
}
const pagesToday = () => (ST.read[ymd(new Date())] || []).length;
function dayDone(d) { const k = ymd(d); return (ST.read[k] || []).length >= ST.settings.dailyGoal || !!ST.surahDone[k]; }
function streak() {
  const d = new Date(); let n = 0;
  if (!dayDone(d)) d.setDate(d.getDate() - 1);
  while (dayDone(d)) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function surahOfDay(d = new Date()) {
  if (d.getDay() === 5 && ST.settings.fridayKahf) return 18;
  if (ST.settings.dailyMode === 'fixed') return ST.settings.fixedSurah;
  return dayNum(d) % 114 + 1;
}
function ayahOfDay(d = new Date()) { return ORDER[(Math.imul(dayNum(d) + 11, 2654435761) >>> 0) % ORDER.length]; }
function hijri() { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch { return ''; } }

async function renderDaily() {
  const d = new Date(), sd = surahOfDay(d), S = SUR[sd - 1], done = !!ST.surahDone[ymd(d)];
  const [aks] = [ayahOfDay(d)], ay = AY[aks];
  const goal = ST.settings.dailyGoal, pt = pagesToday();
  const pct = Math.min(100, Math.round(pt / goal * 100));
  const kp = Math.round(ST.khatam.length / TOTAL_PAGES * 100);
  const want = ST.settings.tr === 'both' ? ['en', 'ur'] : ST.settings.tr === 'none' ? ['en'] : [ST.settings.tr];
  const trs = []; for (const l of want) trs.push([l, (await loadTr(l))[ay.s - 1][ay.a - 1]]);
  const kahf = d.getDay() === 5 && ST.settings.fridayKahf;
  $('#dailyBody').innerHTML = `
    <h2>Today</h2>
    <div class="muted sm" style="margin-top:-8px;margin-bottom:12px">${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${hijri() ? ' · ' + esc(hijri()) : ''}</div>
    <div class="card row">
      <div class="ring" style="--p:${pct}"><i><span>${pt}/${goal}<small>pages</small></span></i></div>
      <div class="sp"><b>Daily reading goal</b>
        <div class="muted sm">${pt >= goal ? 'Goal reached — well done!' : `${goal - pt} more page${goal - pt > 1 ? 's' : ''} to go`}</div>
        <div class="row sm" style="margin-top:8px"><span class="pill">🔥 ${streak()} day streak</span><span class="pill">Khatam ${kp}%${ST.khatams ? ` · ${ST.khatams}×` : ''}</span></div></div>
    </div>
    <h3>${kahf ? 'Friday · Surah Al-Kahf' : 'Surah of the day'}</h3>
    <div class="card">
      <div class="row"><div class="num">${sd}</div><div class="sp"><b>${esc(S.en)}</b><div class="muted sm">${esc(S.tr)} · ${S.n} ayahs · ${S.place} · page ${surahPage(sd)}</div></div><div class="ar" style="font-size:30px">${esc(S.ar)}</div></div>
      <div class="btns"><button class="btn" id="dRead">Read now</button><button class="btn ghost" id="dListen">▶ Listen</button>
      <button class="btn ${done ? '' : 'ghost'}" id="dDone">${done ? '✓ Completed today' : 'Mark as read'}</button></div>
    </div>
    <h3>Ayah of the day</h3>
    <div class="card"><div class="muted sm">${esc(surahName(ay.s))} ${ay.s}:${ay.a} · page ${ay.page}</div>
      <div class="big-ar">${esc(ay.text)} <span style="color:var(--accent)">${esc(ay.marker)}</span></div>
      ${trs.map(([l, t]) => l === 'en' ? `<p class="tr-en">${esc(t)}</p>` : `<p class="tr-ur">${esc(t)}</p>`).join('')}
      <div class="btns"><button class="btn ghost" id="aOpen">Open in Mushaf</button><button class="btn ghost" id="aPlay">▶ Listen</button><button class="btn ghost" id="aBm">☆ Bookmark</button></div></div>
    <h3>Continue reading</h3>
    <div class="card row"><div class="sp"><b>Page ${ST.last.page}</b><div class="muted sm">${esc(surahName(PGINFO[ST.last.page].first[0]))} · Para ${juzOf(...PGINFO[ST.last.page].first)}</div></div><button class="btn" id="dCont">Resume</button></div>`;
  $('#dRead').onclick = () => goto(surahPage(sd));
  $('#dListen').onclick = () => { goto(surahPage(sd)); playFrom(sd, 1); };
  $('#dDone').onclick = () => { if (ST.surahDone[ymd(d)]) delete ST.surahDone[ymd(d)]; else ST.surahDone[ymd(d)] = true; save(); renderDaily(); };
  $('#aOpen').onclick = () => goto(ay.page, { k: aks });
  $('#aPlay').onclick = () => { goto(ay.page, { k: aks }); playFrom(ay.s, ay.a); };
  $('#aBm').onclick = () => { goto(ay.page, { k: aks }); openAyah(ay.s, ay.a).then(() => bmEditor(ay.s, ay.a)); };
  $('#dCont').onclick = () => goto(ST.last.page);
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
    <label class="f">Theme<select id="sTheme">${THEMES.map(t => opt(t, S.theme, t[0].toUpperCase() + t.slice(1))).join('')}</select></label>
    <label class="f">View<select id="sView">${opt('flow', S.view, 'Large text (scrolling)')}${opt('mushaf', S.view, '15-line mushaf pages')}</select></label>
    <label class="f">Text size (large text)<input type="range" id="sFont" min="22" max="84" value="${S.fontSize}"></label>
    <label class="f">Page size (15-line mushaf)<input type="range" id="sZoom" min="0.7" max="1.6" step="0.05" value="${S.zoom}"></label>
    <label class="f">Fit whole page on screen (15-line)<input type="checkbox" id="sFit" ${S.fitPage ? 'checked' : ''}></label>
    <label class="f">Two-page spread on wide screens (15-line)<input type="checkbox" id="sSpread" ${S.spread ? 'checked' : ''}></label>
    <label class="f">Translation<select id="sTr">${opt('en', S.tr, 'English (Saheeh Intl)')}${opt('ur', S.tr, 'Urdu (Jalandhry)')}${opt('both', S.tr, 'English + Urdu')}${opt('none', S.tr, 'None')}</select></label>
    <h3>Audio</h3>
    <label class="f">Reciter<select id="sRec">${Object.entries(RECITERS).map(([k, v]) => opt(k, S.reciter, v)).join('')}</select></label>
    <label class="f">Repeat each ayah<select id="sRep">${[1, 2, 3, 5, 10].map(n => opt(n, S.repeat, n === 1 ? 'Once' : n + ' times')).join('')}</select></label>
    <h3>Daily</h3>
    <label class="f">Daily page goal<input type="number" id="sGoal" min="1" max="60" value="${S.dailyGoal}"></label>
    <label class="f">Surah of the day<select id="sMode">${opt('rotate', S.dailyMode, 'Rotate through all 114')}${opt('fixed', S.dailyMode, 'Always the same surah')}</select></label>
    <label class="f" id="fixRow" ${S.dailyMode === 'fixed' ? '' : 'hidden'}>Surah<select id="sFix">${SUR.map(s => opt(s.id, S.fixedSurah, `${s.id}. ${s.en}`)).join('')}</select></label>
    <label class="f">Friday: Surah Al-Kahf<input type="checkbox" id="sKahf" ${S.fridayKahf ? 'checked' : ''}></label>
    <h3>Your data</h3>
    <div class="muted sm">Khatam progress: ${ST.khatam.length}/${TOTAL_PAGES} pages · ${ST.bms.length} bookmarks · ${Object.keys(ST.read).length} days read</div>
    <div class="btns"><button class="btn ghost sm" id="sExp">Export backup</button><button class="btn ghost sm" id="sImp">Import backup</button><button class="btn danger sm" id="sRst">Reset khatam</button></div>
    <input type="file" id="sFile" accept="application/json" hidden>
    <h3>About</h3>
    <p class="muted sm">15-line Indo-Pak mushaf (610 pages, Qudratullah layout) with Hanafi Nastaleeq fonts from the <a href="https://qul.tarteel.ai" target="_blank" rel="noopener">Quranic Universal Library</a> by Tarteel. Translations via <a href="https://quran.com" target="_blank" rel="noopener">Quran.com</a>; audio streamed from <a href="https://everyayah.com" target="_blank" rel="noopener">EveryAyah</a>. Everything you save stays on this device.</p>`;
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('#sTheme', 'change', e => setTheme(e.target.value));
  on('#sView', 'change', e => { S.view = e.target.value; save(); });
  on('#sFont', 'change', e => { S.fontSize = +e.target.value; save(); });
  on('#sZoom', 'change', e => { S.zoom = +e.target.value; save(); });
  on('#sFit', 'change', e => { S.fitPage = e.target.checked; save(); });
  on('#sSpread', 'change', e => { S.spread = e.target.checked; save(); });
  on('#sTr', 'change', e => { S.tr = e.target.value; save(); });
  on('#sRec', 'change', e => { S.reciter = e.target.value; save(); });
  on('#sRep', 'change', e => { S.repeat = +e.target.value; save(); });
  on('#sGoal', 'change', e => { S.dailyGoal = clamp(+e.target.value || 1, 1, 60); save(); });
  on('#sMode', 'change', e => { S.dailyMode = e.target.value; $('#fixRow').hidden = e.target.value !== 'fixed'; save(); });
  on('#sFix', 'change', e => { S.fixedSurah = +e.target.value; save(); });
  on('#sKahf', 'change', e => { S.fridayKahf = e.target.checked; save(); });
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
      save(); setTheme(ST.settings.theme); toast('Backup restored'); renderSettings();
    } catch { toast('That file is not a valid backup'); }
  });
}

/* ───────────── boot ───────────── */
async function boot() {
  setTheme(ST.settings.theme);
  try {
    await loadData();
    await Promise.all(FONTS.map(f => document.fonts.load(`40px "${f}"`, 'بِسْمِ اللّٰهِ')));
    await document.fonts.ready;
  } catch (e) {
    $('#bootmsg').textContent = 'Could not load the Quran data. Please serve this folder over http (see README) and reload.';
    console.error(e); return;
  }
  calibrate();
  render();
  $('#boot').classList.add('off');
  setTimeout(() => $('#boot').remove(), 400);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__mushaf = { goto, render, ST, AY, PAGES };
}
boot();
})();
