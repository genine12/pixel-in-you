// 공용 UI: 프레임 크롬 · 캔버스 그리드 렌더러 · 토스트
import { S, theme, quotaInfo } from './store.js';
import { lum, h, targetHSL, hslToHex, gridOf, seedOf } from './game.js';

const app = () => document.getElementById('app');

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// hex → "r g b" (CSS 변수용)
function rgbTriplet(hex) {
  const v = hex.replace('#', '');
  return `${parseInt(v.slice(0, 2), 16)} ${parseInt(v.slice(2, 4), 16)} ${parseInt(v.slice(4, 6), 16)}`;
}

// 테마 CSS 변수 적용
export function applyTheme() {
  const t = theme();
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--ink', t.ink);
  r.setProperty('--dim', t.dim);
  r.setProperty('--bright', t.bright);
  r.setProperty('--alert', t.alert);
  r.setProperty('--ink-rgb', rgbTriplet(t.ink));
  r.setProperty('--bright-rgb', rgbTriplet(t.bright));
  r.setProperty('--alert-rgb', rgbTriplet(t.alert));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
}

// ── 프레임 크롬 ──────────────────────────────────────────
export function statusBar(right) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `<div class="statusbar"><span>${time}</span><span>${right || 'ORBIT · ▮▮▮▯ · 62%'}</span></div>`;
}

export function titleBar(label, right, backAct) {
  return `<div class="titlebar">
    ${backAct ? `<button class="tb-back" data-act="${backAct}">◂ CONTROL</button>` : ''}
    <span class="tb-label">${label}</span><span class="tb-fill"></span>
    <span class="tb-right">${right || ''}</span></div>`;
}

const TABS = [
  ['CONTROL', 'dashboard'], ['STARMAP', 'starmap'], ['ARCHIVE', 'archive'],
  ['SHOP', 'shop'], ['SET', 'settings'],
];
export function tabBar(active) {
  return `<nav class="tabbar">` + TABS.map(([label, scr]) =>
    `<button class="tab${scr === active ? ' on' : ''}" data-nav="${scr}">${label}</button>`).join('') + `</nav>`;
}

// 화면 렌더 공통 래퍼 — halo/스캔라인/비네트 오버레이 포함
export function renderScreen(inner, { halo = true } = {}) {
  app().innerHTML = `<div class="frame">
    ${halo ? '<div class="halo"></div>' : ''}
    <div class="content">${inner}</div>
    <div class="scanlines"></div><div class="vignette"></div>
  </div>`;
  // 탭 네비게이션 바인딩
  app().querySelectorAll('[data-nav]').forEach(b =>
    b.addEventListener('click', () => S.nav(b.dataset.nav)));
  return app();
}

// ── 토스트 ───────────────────────────────────────────────
export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

// ── 캔버스 그리드 렌더러 ─────────────────────────────────
// 마스킹된(듀오톤 봉인) 그리드: 채워진 셀 = 명도 블록, 빈 셀 = 어두운 홈
export function drawMasked(canvas, n, seed, filledSet, { sel = null } = {}) {
  const px = canvas.width / n;
  const g = canvas.getContext('2d');
  const t = theme();
  g.fillStyle = t.bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const [ir, ig, ib] = t.ink.replace('#', '').match(/../g).map(v => parseInt(v, 16));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const key = y * 10000 + x;
    const gap = Math.max(.5, px * .06);
    if (filledSet.has(key)) {
      const a = .24 + .66 * lum(x, y, n, seed);
      g.fillStyle = `rgba(${ir},${ig},${ib},${a.toFixed(3)})`;
      g.fillRect(x * px + gap, y * px + gap, px - gap * 2, px - gap * 2);
    } else {
      g.strokeStyle = `rgba(${ir},${ig},${ib},.22)`;
      g.lineWidth = .5;
      g.strokeRect(x * px + gap, y * px + gap, px - gap * 2, px - gap * 2);
    }
    if (sel && sel.x === x && sel.y === y) {
      g.strokeStyle = t.bright;
      g.lineWidth = Math.max(1, px * .1);
      g.strokeRect(x * px + 1, y * px + 1, px - 2, px - 2);
    }
  }
}

// 목표 색상(원색) 그리드 — 아카이브 썸네일 등
export function drawTargetColors(canvas, n, seed) {
  const px = canvas.width / n;
  const g = canvas.getContext('2d');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = targetHSL(x, y, n, seed);
    g.fillStyle = `hsl(${c.h.toFixed(0)} ${c.s.toFixed(0)}% ${c.l.toFixed(0)}%)`;
    g.fillRect(Math.floor(x * px), Math.floor(y * px), Math.ceil(px), Math.ceil(px));
  }
}

// 스테이지 프리뷰(승급 화면) — 명도 블록
export function drawPromo(canvas, n, seed, hot) {
  const px = canvas.width / n;
  const g = canvas.getContext('2d');
  const t = theme();
  const [ir, ig, ib] = t.ink.replace('#', '').match(/../g).map(v => parseInt(v, 16));
  g.fillStyle = t.bg; g.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = lum(x, y, n, seed);
    const a = hot ? .1 + .6 * l : .06 + .34 * l;
    g.fillStyle = `rgba(${ir},${ig},${ib},${a.toFixed(3)})`;
    const gap = Math.max(.4, px * .07);
    g.fillRect(x * px + gap, y * px + gap, px - gap * 2, px - gap * 2);
  }
}

// 대시보드 하단 CTA용 잔여 한도 문자열
export function quotaLabel() {
  const q = quotaInfo();
  return `${q.left} CELLS AVAILABLE · MIDNIGHT RESET`;
}
