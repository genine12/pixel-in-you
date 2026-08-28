// 아카이브 · 보상/상점 · 설정
import { S, uid, theme, levelCycles, nextMilestone } from '../store.js';
import * as db from '../db.js';
import { renderScreen, statusBar, titleBar, tabBar, drawTargetColors, applyTheme, toast } from '../ui.js';
import { spriteHTML, THEMES, themeUnlocked } from '../sprites.js';
import { gridOf, levelsOf, seedOf, targetHSL, STAGES } from '../game.js';
import { loadLevelImages, drawMosaic } from './story.js';

const pad2 = v => String(v).padStart(2, '0');

// ── 아카이브 ─────────────────────────────────────────────
export function archiveScreen() {
  const p = S.profile;
  const done = S.completions;
  const doneKeys = new Set(done.map(c => `${c.stage}-${c.level}`));
  const exportUnlocked = (p.longest_streak || 0) >= 100 || !!p.settings?.premiumExport;

  // 행 구성: 완성 레벨 + 진행 중 + 다음 봉인 레벨
  const rows = done.map(c => ({
    type: 'done', stage: c.stage, level: c.level,
    grid: gridOf(c.stage), note: `REVEALED · ${c.cycles || '?'} CYCLES`, badge: 'REVEALED', pct: 100,
  }));
  if (!doneKeys.has(`${p.stage}-${p.level}`)) {
    const n = gridOf(p.stage);
    rows.push({
      type: 'cur', stage: p.stage, level: p.level, grid: n,
      note: `IN RESTORATION · ${S.cells.length} FILLED`,
      badge: `${Math.floor(S.cells.length / (n * n) * 100)}%`,
      pct: Math.floor(S.cells.length / (n * n) * 100),
    });
  }
  if (p.level + 1 < levelsOf(p.stage) || p.stage < 3) {
    const ns = p.level + 1 < levelsOf(p.stage) ? p.stage : p.stage + 1;
    const nl = p.level + 1 < levelsOf(p.stage) ? p.level + 1 : 0;
    rows.push({ type: 'locked', stage: ns, level: nl, grid: gridOf(ns), note: 'SEALED · 다음 레벨', badge: 'LOCKED', pct: 0 });
  }

  const rowsHTML = rows.map((r, i) => `
    <div class="lrow ${r.type === 'locked' ? 'dimmed' : ''}" ${r.type === 'done' ? `data-view="${i}" style="cursor:pointer"` : ''}>
      <canvas class="gridcv athumb" data-i="${i}" width="124" height="124" style="width:62px;height:62px;flex:none;border:1px solid var(--line-strong)"></canvas>
      <div class="grow" style="min-width:0">
        <div class="row" style="justify-content:space-between;align-items:baseline">
          <span style="font:500 13px var(--mono);letter-spacing:.12em;color:var(--bright)">S${r.stage + 1} · L${r.level + 1}</span>
          <span class="badge ${r.type === 'done' ? 'fill' : ''}">${r.badge}</span>
        </div>
        <div class="mono11 dim" style="margin-top:4px">GRID ${r.grid}×${r.grid} · ${r.grid * r.grid} CELLS</div>
        <div class="mono11 dim">${r.note}</div>
        <div class="minibar" style="margin-top:6px"><i style="width:${r.pct}%"></i></div>
      </div>
    </div>`).join('');

  const acceptedTotal = S.recentDates.length; // 로드된 최근 기록 기준
  const rejectsTotal = p.settings?.rejectsTotal || 0;

  const root = renderScreen(`
    ${statusBar()}
    ${titleBar('RESTORATION ARCHIVE', `STAGE ${pad2(p.stage + 1)} · ${done.length} REVEALED`)}
    <div style="padding:16px 16px 0;display:flex;flex-direction:column;gap:9px">${rowsHTML}</div>
    <div class="grow"></div>
    <div class="mx16 panel pad row" style="margin-bottom:12px;gap:13px;align-items:flex-start">
      ${spriteHTML('disk', 46, theme().pal)}
      <div class="grow mono11 dim" style="line-height:1.8">
        <div style="color:var(--ink);letter-spacing:.16em;font-weight:500">LIFETIME LOG</div>
        <div>ACCEPTED &nbsp;&nbsp;&nbsp;&nbsp;${acceptedTotal} SPECIMENS</div>
        <div>REJECTED &nbsp;&nbsp;&nbsp;&nbsp;${rejectsTotal}</div>
        <div>LONGEST STREAK &nbsp;${p.longest_streak || 0} CYCLES<br>EXPORT &nbsp;&nbsp;&nbsp;${exportUnlocked ? 'UNLOCKED ◈' : 'LOCKED · 100D'}</div>
      </div>
    </div>
    ${tabBar('archive')}
  `);

  // 썸네일: 완성 = 목표 원색, 진행/봉인 = 봉인 상태
  root.querySelectorAll('.athumb').forEach(cv => {
    const r = rows[+cv.dataset.i];
    if (r.type === 'done') drawTargetColors(cv, Math.min(r.grid, 32), seedOf(r.stage, r.level));
    else {
      const g = cv.getContext('2d');
      g.fillStyle = theme().bg; g.fillRect(0, 0, cv.width, cv.height);
      if (r.type === 'cur') {
        g.fillStyle = `rgb(${theme().ink.replace('#','').match(/../g).map(v=>parseInt(v,16)).join(',')} / .16)`;
        g.fillStyle = 'rgba(255,255,255,.06)';
        g.fillRect(0, 0, cv.width, cv.height * (r.pct / 100));
      }
      g.strokeStyle = 'rgba(255,255,255,.15)'; g.strokeRect(.5, .5, cv.width - 1, cv.height - 1);
    }
  });
  root.querySelectorAll('[data-view]').forEach(el =>
    el.addEventListener('click', () => {
      const r = rows[+el.dataset.view];
      S.nav('archiveView', { stage: r.stage, level: r.level });
    }));
}

// ── 아카이브 상세 = 리빌 모자이크 뷰 (디자인 2d) ────────────
// 틴트 전환 (ART 100% / REVEAL 70% / PHOTOS 35%) + 셀 탭 → 상세 시트
const TINTS = [
  { k: 'ART',    v: 1,   label: 'ART · 순수 그림',  desc: '틴트 100% — 지구가 보낸 이미지 그대로' },
  { k: 'REVEAL', v: .7,  label: 'REVEAL · 드러남',  desc: '틴트 70% — 셀 아래 사진들이 배어 나온다' },
  { k: 'PHOTOS', v: .35, label: 'PHOTOS · 내 사진', desc: '틴트 35% — 그림은 결국 당신의 하루들이었다' },
];

export function archiveViewScreen({ stage = 0, level = 0 } = {}) {
  const n = gridOf(stage);
  const seed = seedOf(stage, level);
  let imgs = null;
  let cellsByKey = new Map(); // y*10000+x → {cell, img}
  let ti = 1;                 // 기본 REVEAL
  let sel = null;             // {x, y}

  const draw = () => {
    if (S.screen !== 'archiveView') return;
    const tint = TINTS[ti];
    const entry = sel ? cellsByKey.get(sel.y * 10000 + sel.x) : null;

    const sheetHTML = sel ? `
      <div class="mx16 mt12 cell-sheet" id="sheet">
        <div class="sheet-head">
          <span style="font:700 11px var(--mono);letter-spacing:.14em;color:var(--ink)">CELL DETAIL · R${pad2(sel.y + 1)}·C${pad2(sel.x + 1)}</span>
          <button id="closeSheet" class="mono11 dim" style="cursor:pointer">✕</button>
        </div>
        <div class="pad row" style="gap:11px;align-items:flex-start">
          <canvas id="shOrig" width="96" height="96" style="width:72px;height:72px;flex:none;border:1px solid rgb(var(--bright-rgb)/.5)"></canvas>
          <canvas id="shTint" width="96" height="96" style="width:72px;height:72px;flex:none;border:1px solid rgb(var(--ink-rgb)/.5)"></canvas>
          <div class="grow mono11 dim" style="min-width:0;line-height:1.8">
            <div style="color:var(--bright);font-weight:500">${entry?.cell?.fill_date || '—'}</div>
            <div>ORIGINAL / TINTED</div>
            <div>내가 올린 사진</div>
          </div>
        </div>
      </div>` : '';

    const root = renderScreen(`
      ${statusBar()}
      ${titleBar('REVEAL MOSAIC', `S${stage + 1} · L${level + 1} · ${n}×${n} · ${n * n} CELLS`, 'back')}
      <div style="padding:14px 18px 0" class="row" >
        <span style="font:500 12.5px var(--mono);letter-spacing:.1em;color:var(--bright)">${tint.label}</span>
        <span class="grow"></span>
        <span class="mono11 dim">TINT ${Math.round(tint.v * 100)}%</span>
      </div>
      <div class="mosaic-wrap mx16" style="margin-top:11px;padding:5px">
        <canvas id="viewcv" class="gridcv" width="${Math.min(1024, n * 32)}" height="${Math.min(1024, n * 32)}"></canvas>
      </div>
      <div class="mx16 mt12 segtabs" id="tints">
        ${TINTS.map((t, i) => `<button class="${i === ti ? 'on' : ''}" data-ti="${i}">${t.k}</button>`).join('')}
      </div>
      <div class="mx16 mt8 mono11 dim" style="line-height:1.75">${tint.desc}</div>
      <div class="mx16 mt8 mono11 dim" id="status">${imgs ? `${imgs.length} FRAGMENTS · REVEALED` : 'FRAGMENT PHOTOS LOADING ▚'}</div>
      ${sheetHTML}
      <div class="grow"></div>
      <div class="mx16 row" style="gap:8px;margin-bottom:10px">
        <button class="btn grow" id="export" style="padding:13px;width:auto">EXPORT ▸</button>
        <button class="grow" id="back2" style="border:1px solid var(--line-strong);padding:13px;text-align:center;font:500 11.5px var(--mono);letter-spacing:.14em;color:var(--dim)">아카이브</button>
      </div>
      <div class="center mono11 dim" style="letter-spacing:.12em;margin-bottom:8px;font-size:10px">셀을 탭하면 그날의 사진을 볼 수 있습니다</div>
      ${tabBar('archive')}
    `);
    root.querySelector('.tb-back').addEventListener('click', () => S.nav('archive'));
    root.querySelector('#back2').addEventListener('click', () => S.nav('archive'));
    root.querySelector('#export').addEventListener('click', () => S.nav('export', { stage, level }));
    root.querySelectorAll('[data-ti]').forEach(b => b.addEventListener('click', () => { ti = +b.dataset.ti; draw(); }));
    root.querySelector('#closeSheet')?.addEventListener('click', () => { sel = null; draw(); });

    const cv = root.querySelector('#viewcv');
    if (imgs) drawMosaic(cv, n, seed, imgs, 'color', null, tint.v);
    else drawTargetColors(cv, n, seed);

    // 셀 탭 → 상세 시트
    cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * n);
      const y = Math.floor((e.clientY - r.top) / r.height * n);
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      sel = { x, y };
      draw();
    });

    // 상세 시트의 원본/틴트 썸네일
    if (sel && entry) {
      const t = targetHSL(sel.x, sel.y, n, seed);
      const targetCss = `hsl(${t.h.toFixed(0)} ${t.s.toFixed(0)}% ${t.l.toFixed(0)}%)`;
      const o = root.querySelector('#shOrig')?.getContext('2d');
      const tc = root.querySelector('#shTint')?.getContext('2d');
      if (o && tc) {
        if (entry.img) { o.drawImage(entry.img, 0, 0, 96, 96); tc.drawImage(entry.img, 0, 0, 96, 96); }
        else { o.fillStyle = targetCss; o.fillRect(0, 0, 96, 96); }
        tc.globalAlpha = tint.v; tc.fillStyle = targetCss; tc.fillRect(0, 0, 96, 96);
      }
    }
  };

  draw();
  db.fetchCells(uid(), stage, level).then(cells => loadLevelImages(cells)).then(loaded => {
    if (S.screen !== 'archiveView') return;
    imgs = loaded;
    cellsByKey = new Map(loaded.map(e => [e.cell.y * 10000 + e.cell.x, e]));
    draw();
  }).catch(() => {
    const st = document.querySelector('#status');
    if (st) st.textContent = 'PHOTO LOAD FAILED · 목표 색상으로 표시 중';
  });
}

// ── 프리미엄 EXPORT (디자인 2f) — 포스터/엽서 레이아웃 ──────
const EXPORT_KINDS = [
  { k: 'POSTER',   sub: '포스터', ratio: '2:3 · 610×915mm',  w: 2048, h: 3072 },
  { k: 'POSTCARD', sub: '엽서',   ratio: 'A6 · 105×148mm',   w: 1240, h: 1748 },
];

export function exportScreen({ stage = 0, level = 0 } = {}) {
  const p = S.profile;
  const n = gridOf(stage);
  const seed = seedOf(stage, level);
  const free = (p.longest_streak || 0) >= 100 || !!p.settings?.premiumExport;
  const comp = S.completions.find(c => c.stage === stage && c.level === level);
  let kind = 0;
  let imgs = null;
  let dateRange = '—';

  const draw = () => {
    if (S.screen !== 'export') return;
    const ek = EXPORT_KINDS[kind];
    const gate = free
      ? { title: 'PREMIUM EXPORT · UNLOCKED', badge: '100D 달성', body: '100일 연속 참여 보상으로 활성화되었습니다. 워터마크 없이 원본 해상도로 저장됩니다.', cta: '고화질로 저장하기 ▸', foot: `PNG ${ek.w}×${ek.h} · 무료` }
      : { title: 'PREMIUM EXPORT · LOCKED', badge: `${p.streak || 0} / 100D`, body: `100일 연속 참여로 무료 획득하거나, 결제해 바로 사용할 수 있습니다. 현재 스트릭 ${p.streak || 0}일.`, cta: '₩4,900 결제하고 저장 ▸', foot: `또는 ${Math.max(0, 100 - (p.streak || 0))}일 더 연속 참여하면 무료` };
    const accent = free ? 'var(--ink)' : '#A594F9';

    const root = renderScreen(`
      ${statusBar()}
      ${titleBar('PREMIUM EXPORT', `S${stage + 1} · L${level + 1} · ${n}×${n} · REVEALED`, 'back')}
      <div class="mx16 mt12 segtabs">
        ${EXPORT_KINDS.map((k, i) => `<button class="${i === kind ? 'on' : ''}" data-k="${i}">${k.k}</button>`).join('')}
      </div>

      <div class="mx16 mt12 grow" style="min-height:0;display:flex;align-items:center;justify-content:center;border:1px solid rgb(var(--ink-rgb)/.28);background:#08080a;padding:14px;overflow:hidden">
        <div style="width:214px;background:#FBFFDF;color:#050503;padding:16px 16px 14px;box-shadow:0 14px 40px rgba(0,0,0,.7)">
          <canvas id="prevcv" width="${n * 16}" height="${n * 16}" style="display:block;width:100%;image-rendering:pixelated"></canvas>
          <div style="margin-top:13px;font:700 13px var(--mono);letter-spacing:.16em">PIXEL IN YOU</div>
          <div style="font:400 10px var(--mono);letter-spacing:.1em;color:#5A5C46;margin-top:4px">STAGE ${pad2(stage + 1)} · LEVEL ${pad2(level + 1)} · ${n}×${n} · ${n * n} CELLS</div>
          <div style="font:400 10px var(--mono);letter-spacing:.1em;color:#5A5C46">${dateRange} · ${comp?.cycles || '?'} CYCLES</div>
          <div style="margin-top:9px;display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(5,5,3,.2);padding-top:7px">
            <span style="font:400 10px var(--mono);color:#5A5C46">OPERATOR ${p.operator || '—'}</span>
            <span style="font:700 10px var(--mono);letter-spacing:.14em">${ek.k}</span>
          </div>
        </div>
      </div>
      <div class="mx16 mt8 row" style="justify-content:space-between">
        <span class="mono11 dim">${ek.sub} 레이아웃</span><span class="mono11 dim">${ek.ratio}</span>
      </div>

      <div class="mx16 mt12 panel pad" style="border-color:${accent};box-shadow:0 0 20px ${free ? 'rgb(var(--ink-rgb)/.16)' : 'rgba(165,148,249,.2)'}">
        <div class="row" style="justify-content:space-between;align-items:center;gap:9px">
          <span style="font:700 11px var(--mono);letter-spacing:.14em;color:var(--bright)">${gate.title}</span>
          <span style="font:700 10px var(--mono);letter-spacing:.12em;padding:3px 7px;${free ? 'background:var(--ink);color:var(--bg)' : 'color:#A594F9;border:1px solid #6F5FC9'}">${gate.badge}</span>
        </div>
        <div class="mono11 dim" style="margin-top:7px;line-height:1.8">${gate.body}</div>
      </div>

      <button class="btn mx16" id="cta" style="margin-top:12px;margin-bottom:8px;width:auto;border-color:${accent};box-shadow:0 0 22px ${free ? 'rgb(var(--ink-rgb)/.3)' : 'rgba(165,148,249,.34)'}">${gate.cta}</button>
      <div class="center mono11 dim" style="letter-spacing:.12em;margin-bottom:24px">${gate.foot}</div>
    `);
    root.querySelector('.tb-back').addEventListener('click', () => S.nav('archiveView', { stage, level }));
    root.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { kind = +b.dataset.k; draw(); }));

    const prev = root.querySelector('#prevcv');
    if (imgs) drawMosaic(prev, n, seed, imgs, 'color', null, .72);
    else drawTargetColors(prev, n, seed);

    root.querySelector('#cta').addEventListener('click', () => {
      if (!free) { toast('결제는 준비 중입니다 — 100일 스트릭으로도 해금할 수 있어요'); return; }
      exportPNG();
    });
  };

  // 고해상도 포스터/엽서 PNG 저장
  const exportPNG = () => {
    const ek = EXPORT_KINDS[kind];
    const out = document.createElement('canvas');
    out.width = ek.w; out.height = ek.h;
    const g = out.getContext('2d');
    g.fillStyle = '#FBFFDF'; g.fillRect(0, 0, ek.w, ek.h);

    const margin = Math.round(ek.w * .08);
    const artW = ek.w - margin * 2;
    const art = document.createElement('canvas');
    const px = Math.max(8, Math.floor(artW / n));
    art.width = art.height = px * n;
    if (imgs) drawMosaic(art, n, seed, imgs, 'color', null, .72);
    else drawTargetColors(art, n, seed);
    g.imageSmoothingEnabled = false;
    g.drawImage(art, margin, margin, artW, artW);

    // 하단 메타 텍스트
    g.fillStyle = '#050503';
    const fs = Math.round(ek.w * .032);
    g.font = `700 ${fs}px 'JetBrains Mono', monospace`;
    let ty = margin + artW + Math.round(ek.w * .07);
    g.fillText('PIXEL IN YOU', margin, ty);
    g.font = `400 ${Math.round(fs * .62)}px 'JetBrains Mono', monospace`;
    g.fillStyle = '#5A5C46';
    ty += Math.round(fs * .95);
    g.fillText(`STAGE ${pad2(stage + 1)} · LEVEL ${pad2(level + 1)} · ${n}×${n} · ${n * n} CELLS`, margin, ty);
    ty += Math.round(fs * .8);
    g.fillText(`${dateRange} · ${comp?.cycles || '?'} CYCLES · OPERATOR ${p.operator || '—'}`, margin, ty);

    out.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pixel-in-you_S${stage + 1}L${level + 1}_${EXPORT_KINDS[kind].k.toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('EXPORT 완료 — 다운로드 폴더를 확인하세요');
    }, 'image/png');
  };

  draw();
  db.fetchCells(uid(), stage, level).then(cells => {
    const dates = cells.map(c => c.fill_date).filter(Boolean).sort();
    if (dates.length) {
      const f = d => d.replaceAll('-', '.');
      dateRange = `${f(dates[0])} — ${f(dates[dates.length - 1])}`;
    }
    return loadLevelImages(cells);
  }).then(loaded => {
    if (S.screen !== 'export') return;
    imgs = loaded;
    draw();
  }).catch(() => {});
}

// ── 테마 카드 (상점/설정 공용) ─────────────────────────────
function themeCardsHTML() {
  return `<div class="themes-scroll mt8">` + THEMES.map((t, ti) => {
    const owned = themeUnlocked(ti, S.profile);
    const active = (S.profile.theme || 0) === ti;
    const tag = active ? 'ACTIVE' : owned ? 'APPLY' : (t.unlock.tag || '');
    return `
    <div class="theme-card" data-theme="${ti}" style="background:${t.bg};border:1px solid ${active ? t.ink : t.dim};box-shadow:0 0 ${active ? '22px' : '10px'} ${t.ink}${active ? '44' : '1F'}">
      <div class="row gap8" style="align-items:flex-start">
        ${spriteHTML(t.char, 40, t.pal)}
        <div class="grow" style="min-width:0">
          <div class="tname" style="color:${t.bright}">${t.name}</div>
          <div class="swatches" style="margin-top:5px">${t.mix.map(c => `<i style="background:${c};box-shadow:0 0 7px ${c}66"></i>`).join('')}</div>
        </div>
      </div>
      <div style="font:400 10px var(--mono);letter-spacing:.06em;color:${t.dim}">${t.meta}</div>
      <div class="ttag" style="${active ? `background:${t.ink};color:${t.bg}` : `color:${t.ink};border:1px solid ${t.dim}`}">${tag}</div>
    </div>`;
  }).join('') + `</div>`;
}

function bindThemeCards(root, redraw) {
  root.querySelectorAll('[data-theme]').forEach(el => el.addEventListener('click', async () => {
    const ti = +el.dataset.theme;
    if (!themeUnlocked(ti, S.profile)) {
      const t = THEMES[ti];
      toast(t.unlock.type === 'streak'
        ? `${t.unlock.days}일 스트릭 달성 시 해금됩니다 (최고 ${S.profile.longest_streak || 0}일)`
        : '상점 결제 준비 중입니다');
      return;
    }
    S.profile = await db.updateProfile(uid(), { theme: ti });
    applyTheme();
    redraw();
    toast(`콘솔 테마 적용 — ${THEMES[ti].name}`);
  }));
}

// ── 보상 / 상점 ──────────────────────────────────────────
export function shopScreen() {
  const p = S.profile;
  const ms = p.settings?.ms || {};
  const streak = p.streak || 0;

  const milestones = [
    { days: 7, reward: '스트릭 방어권 ×1 + 한정 팔레트', icon: '◈' },
    { days: 30, reward: '명예의 전당 픽셀 프레임 + DEEP ORBIT 테마', icon: '◇' },
    { days: 100, reward: '프리미엄 EXPORT + CRT MAGENTA 테마', icon: '▫' },
  ].map(m => {
    const claimed = !!ms[String(m.days)];
    const pct = Math.min(100, Math.floor(streak / m.days * 100));
    return { ...m, claimed, pct, badge: claimed ? 'CLAIMED' : streak >= m.days ? 'READY' : `${streak} / ${m.days}` };
  });

  const root = renderScreen(`
    ${statusBar()}
    ${titleBar('REWARDS & SUPPLY', `STREAK ${streak}D`)}
    <div style="padding-bottom:8px">
      <div class="mx16 mt14 row panel" style="box-shadow:0 0 20px rgb(var(--ink-rgb)/.1)">
        <div class="grow pad" style="border-right:1px solid var(--line-soft)">
          <div class="label">COLOR INK</div>
          <div style="font:700 24px var(--mono);color:var(--bright);margin-top:6px;text-shadow:0 0 9px rgb(var(--ink-rgb)/.55)">◈ ${(p.ink || 0).toLocaleString()}</div>
          <div class="mono11 dim" style="margin-top:4px">+40 / CELL · 스트릭 유지 중</div>
        </div>
        <div class="pad" style="width:120px">
          <div class="label">DEFENCE</div>
          <div style="font:700 24px var(--mono);color:var(--bright);margin-top:6px">×${p.defense || 0}</div>
          <div class="mono11 dim" style="margin-top:4px">스트릭 방어권</div>
        </div>
      </div>

      <div class="mx16 mt12 label" style="letter-spacing:.24em">MILESTONE TRACK</div>
      <div class="mx16" style="margin-top:7px;display:flex;flex-direction:column;gap:7px">
        ${milestones.map(m => `
          <div class="lrow ${!m.claimed && streak < m.days ? '' : ''}" style="${streak < m.days && !m.claimed ? 'opacity:.72' : ''}">
            <div style="width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;font:400 13px var(--mono);border:1px solid var(--line);${m.claimed ? 'background:var(--ink);color:var(--bg)' : 'color:var(--ink)'}">${m.icon}</div>
            <div class="grow" style="min-width:0">
              <div class="row" style="justify-content:space-between;align-items:baseline">
                <span style="font:500 13px var(--mono);letter-spacing:.12em;color:var(--bright)">${m.days} CYCLES</span>
                <span class="badge ${m.claimed ? 'fill' : ''}">${m.badge}</span>
              </div>
              <div class="mono11 dim" style="margin-top:3px">${m.reward}</div>
              <div class="minibar" style="margin-top:6px"><i style="width:${m.pct}%"></i></div>
            </div>
          </div>`).join('')}
      </div>

      <div class="mx16 mt12 label" style="letter-spacing:.24em">SPEND INK</div>
      <div class="mx16" style="margin-top:7px;display:flex;flex-direction:column;gap:6px">
        <div class="lrow" style="align-items:center;gap:10px">
          <div class="grow" style="min-width:0">
            <div style="font:500 13px var(--mono);letter-spacing:.1em;color:var(--bright)">SPECIAL PIXEL · 특수 픽셀</div>
            <div class="mono11 dim" style="margin-top:2px">색상 판정을 1회 면제 (보유 ×${p.special_pixels || 0})</div>
          </div>
          <button class="badge" data-buy="special" style="cursor:pointer;padding:6px 9px;font-weight:500;color:var(--ink);border-color:var(--line-strong)">◈ 320</button>
        </div>
        <div class="lrow" style="align-items:center;gap:10px">
          <div class="grow" style="min-width:0">
            <div style="font:500 13px var(--mono);letter-spacing:.1em;color:var(--bright)">QUOTA +2 CELLS · 오늘</div>
            <div class="mono11 dim" style="margin-top:2px">오늘 제출 한도를 +2칸 확장</div>
          </div>
          <button class="badge" data-buy="quota" style="cursor:pointer;padding:6px 9px;font-weight:500;color:var(--ink);border-color:var(--line-strong)">◈ 480</button>
        </div>
      </div>

      <div class="mx16 mt12 label" style="letter-spacing:.24em">STORE · 결제</div>
      <div class="mx16" style="margin-top:7px;display:flex;flex-direction:column;gap:6px">
        <div class="lrow" style="align-items:center;gap:10px;border-color:var(--line-strong);box-shadow:0 0 14px rgb(var(--ink-rgb)/.1)">
          <div class="grow" style="min-width:0">
            <div style="font:500 13px var(--mono);letter-spacing:.1em;color:var(--bright)">PREMIUM EXPORT</div>
            <div class="mono11 dim" style="margin-top:2px">완성 아트워크 고화질 포스터·엽서 저장 (100일 달성 시 무료)</div>
          </div>
          <button class="badge fill" data-buy="paid" style="cursor:pointer;padding:7px 10px;font-weight:700">₩4,900</button>
        </div>
        <div class="lrow" style="align-items:center;gap:10px;border-color:var(--line-strong);box-shadow:0 0 14px rgb(var(--ink-rgb)/.1)">
          <div class="grow" style="min-width:0">
            <div style="font:500 13px var(--mono);letter-spacing:.1em;color:var(--bright)">THEME COLLECTION</div>
            <div class="mono11 dim" style="margin-top:2px">상점 전용 비트맵 테마 (AMBER DRIFT · AURORA GLASS)</div>
          </div>
          <button class="badge fill" data-buy="paid" style="cursor:pointer;padding:7px 10px;font-weight:700">₩3,900</button>
        </div>
      </div>

      <div class="mx16 mt14 row" style="justify-content:space-between;align-items:baseline">
        <span class="label" style="letter-spacing:.24em">CONSOLE THEMES · PREVIEW</span>
        <span class="mono11 dim">SWIPE ▸</span>
      </div>
      ${themeCardsHTML()}
      <div class="mx16 mono11 dim" style="margin-top:8px;font-size:8.5px;line-height:1.7">테마는 콘솔 전체 팔레트를 교체합니다. 스트릭 한정 테마와 상점 유료 테마는 라인업이 겹치지 않습니다.</div>
    </div>
    ${tabBar('shop')}
  `);

  bindThemeCards(root, shopScreen);
  root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', async () => {
    const kind = b.dataset.buy;
    if (kind === 'paid') { toast('결제는 준비 중입니다 — 100일 스트릭으로도 해금할 수 있어요'); return; }
    const price = kind === 'special' ? 320 : 480;
    if ((p.ink || 0) < price) { toast(`잉크가 부족합니다 (보유 ◈ ${p.ink || 0})`); return; }
    if (kind === 'special') {
      S.profile = await db.updateProfile(uid(), { ink: p.ink - price, special_pixels: (p.special_pixels || 0) + 1 });
      toast('SPECIAL PIXEL 획득 — 셀 채우기 반려 시 사용 가능');
    } else {
      const today = new Date();
      const key = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
      const cur = (p.quota_bonus?.date === key) ? (p.quota_bonus.extra || 0) : 0;
      S.profile = await db.updateProfile(uid(), { ink: p.ink - price, quota_bonus: { date: key, extra: cur + 2 } });
      toast('오늘 세션 한도 +2칸 확장 완료');
    }
    shopScreen();
  }));
}

// ── 설정 ─────────────────────────────────────────────────
export function settingsScreen() {
  const p = S.profile;
  const t = theme();
  const snd = { bgm: 3, sfx: 4, ...(p.settings?.snd || {}) };
  const tg = { vib: true, flicker: false, notify: true, streak: true, ...(p.settings?.tg || {}) };

  const saveSettings = async patch => {
    const settings = { ...(p.settings || {}), ...patch };
    S.profile = await db.updateProfile(uid(), { settings });
  };

  const sliderHTML = (id, label, val) => `
    <div class="panel pad" style="border-color:rgb(var(--ink-rgb)/.38)">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <span style="font:500 13px var(--mono);letter-spacing:.1em;color:var(--bright)">${label}</span>
        <span class="mono11 dim">${val * 20}%</span>
      </div>
      <div class="steps" style="margin-top:8px" data-slider="${id}">${[0, 1, 2, 3, 4].map(i => `<i data-v="${i + 1}" class="${i < val ? 'on' : ''}"></i>`).join('')}</div>
    </div>`;

  const toggleHTML = (id, label, desc) => `
    <div class="lrow" style="align-items:center;gap:11px;cursor:pointer" data-toggle="${id}">
      <div class="grow" style="min-width:0">
        <div style="font:500 13px var(--mono);letter-spacing:.1em;color:var(--bright)">${label}</div>
        <div class="mono11 dim" style="margin-top:3px">${desc}</div>
      </div>
      <div class="knob ${tg[id] ? 'on' : ''}"><i></i></div>
    </div>`;

  const root = renderScreen(`
    ${statusBar()}
    ${titleBar('SETTINGS', `OPERATOR ${p.operator || '—'}`)}
    <div class="mx16 mt14 row panel pad gap12" style="border-color:var(--ink);align-items:center;box-shadow:0 0 22px rgb(var(--ink-rgb)/.2)">
      ${spriteHTML(t.char, 52, t.pal)}
      <div class="grow" style="min-width:0">
        <div style="font:700 15px var(--mono);letter-spacing:.12em;color:var(--bright)">${t.name}</div>
        <div class="mono11 dim" style="margin-top:4px">${t.meta}</div>
        <div class="swatches" style="margin-top:8px">${t.mix.map(c => `<i style="width:16px;height:16px;background:${c};box-shadow:0 0 8px ${c}66"></i>`).join('')}</div>
      </div>
    </div>
    <div style="padding-bottom:8px">
      <div class="mx16 mt14 label" style="letter-spacing:.24em">CONSOLE THEME · 언제든 변경 가능</div>
      ${themeCardsHTML()}
      <div class="mx16 mt14 label" style="letter-spacing:.24em">SOUND</div>
      <div class="mx16" style="margin-top:7px;display:flex;flex-direction:column;gap:8px">
        ${sliderHTML('bgm', 'AMBIENT HUM · BGM', snd.bgm)}
        ${sliderHTML('sfx', 'CONSOLE SFX', snd.sfx)}
      </div>
      <div class="mx16 mt14 label" style="letter-spacing:.24em">DISPLAY &amp; ALERTS</div>
      <div class="mx16" style="margin-top:7px;display:flex;flex-direction:column;gap:6px">
        ${toggleHTML('vib', 'HAPTICS', '셀 정착 시 진동')}
        ${toggleHTML('flicker', 'CRT FLICKER', '대기 화면 미세 플리커')}
        ${toggleHTML('notify', 'SESSION ALERT', '자정 리셋 알림')}
        ${toggleHTML('streak', 'STREAK WARNING', '스트릭 끊기기 전 경고')}
      </div>
      <div class="mx16 mt12 danger" id="reset">
        <div style="font:700 12.5px var(--mono);letter-spacing:.16em">RESET PROGRESS</div>
        <div style="font:400 10px/1.7 var(--mono);margin-top:4px;opacity:.82">모든 스테이지 진행률과 복원된 조각이 삭제됩니다. 되돌릴 수 없습니다.</div>
      </div>
      <button class="link-btn mx16 mt12" id="signout" style="margin-bottom:14px">⏻ ${db.isGuest() ? 'EXIT GUEST · 게스트 종료' : 'SIGN OUT · 접속 종료'}</button>
    </div>
    ${tabBar('settings')}
  `);

  bindThemeCards(root, settingsScreen);

  root.querySelectorAll('[data-slider]').forEach(el => el.addEventListener('click', async e => {
    const v = e.target?.dataset?.v; if (!v) return;
    snd[el.dataset.slider] = +v;
    await saveSettings({ snd });
    settingsScreen();
  }));
  root.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.toggle;
    tg[id] = !tg[id];
    await saveSettings({ tg });
    settingsScreen();
  }));

  let armed = false;
  root.querySelector('#reset').addEventListener('click', async e => {
    if (!armed) {
      armed = true;
      e.currentTarget.querySelector('div').textContent = 'RESET PROGRESS — 한 번 더 누르면 실행';
      setTimeout(() => { armed = false; try { root.querySelector('#reset div').textContent = 'RESET PROGRESS'; } catch {} }, 4000);
      return;
    }
    toast('진행 초기화 중…');
    S.profile = await db.resetProgress(uid());
    S.cells = []; S.recentDates = []; S.completions = [];
    applyTheme();
    toast('모든 진행이 초기화되었습니다');
    S.nav('onboarding');
  });

  root.querySelector('#signout').addEventListener('click', async () => {
    const { sb, isGuest, exitGuestMode } = await import('../db.js');
    if (isGuest()) { exitGuestMode(); location.reload(); return; }
    await sb.auth.signOut();
  });
}
