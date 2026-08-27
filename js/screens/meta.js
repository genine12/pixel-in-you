// 아카이브 · 보상/상점 · 설정
import { S, uid, theme, levelCycles, nextMilestone } from '../store.js';
import * as db from '../db.js';
import { renderScreen, statusBar, titleBar, tabBar, drawTargetColors, applyTheme, toast } from '../ui.js';
import { spriteHTML, THEMES, themeUnlocked } from '../sprites.js';
import { gridOf, levelsOf, seedOf, STAGES } from '../game.js';
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

// ── 아카이브 상세 (완성 레벨 뷰어 + EXPORT) ────────────────
export function archiveViewScreen({ stage = 0, level = 0 } = {}) {
  const p = S.profile;
  const n = gridOf(stage);
  const seed = seedOf(stage, level);
  const exportUnlocked = (p.longest_streak || 0) >= 100 || !!p.settings?.premiumExport;
  let imgs = null;

  const root = renderScreen(`
    ${statusBar()}
    ${titleBar('RESTORED SIGNAL', `S${stage + 1} · L${level + 1} · ${n}×${n}`, 'back')}
    <div class="mosaic-wrap mt16 mx16">
      <canvas id="viewcv" class="gridcv" width="${Math.min(1024, n * 32)}" height="${Math.min(1024, n * 32)}"></canvas>
    </div>
    <div class="mx16 mt12 mono11 dim" id="status">FRAGMENT PHOTOS LOADING ▚</div>
    <div class="grow"></div>
    <button class="btn mx16" id="export" style="margin-bottom:10px;width:auto" ${exportUnlocked ? '' : 'disabled'}>${exportUnlocked ? '◈ EXPORT · 고화질 PNG 저장' : 'EXPORT LOCKED · 100일 스트릭 또는 프리미엄'}</button>
    ${tabBar('archive')}
  `);
  root.querySelector('.tb-back').addEventListener('click', () => S.nav('archive'));

  const cv = root.querySelector('#viewcv');
  drawTargetColors(cv, n, seed); // 사진 로드 전 임시

  db.fetchCells(uid(), stage, level).then(cells => loadLevelImages(cells)).then(loaded => {
    if (S.screen !== 'archiveView') return; // 화면 이탈 후 늦은 렌더 방지
    imgs = loaded;
    drawMosaic(cv, n, seed, imgs, 'color');
    root.querySelector('#status').textContent = `${imgs.length} FRAGMENTS · REVEALED`;
  }).catch(() => { root.querySelector('#status').textContent = 'PHOTO LOAD FAILED · 목표 색상으로 표시 중'; });

  root.querySelector('#export').addEventListener('click', () => {
    if (!exportUnlocked) return;
    const out = document.createElement('canvas');
    const px = Math.max(16, Math.floor(2048 / n));
    out.width = out.height = px * n;
    if (imgs) drawMosaic(out, n, seed, imgs, 'color');
    else drawTargetColors(out, n, seed);
    out.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pixel-in-you_S${stage + 1}L${level + 1}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('EXPORT 완료 — 다운로드 폴더를 확인하세요');
    }, 'image/png');
  });
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
    <div class="grow" style="min-height:0;overflow-y:auto;padding-bottom:8px">
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
    <div class="grow" style="min-height:0;overflow-y:auto;padding-bottom:8px">
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
      <button class="link-btn mx16 mt12" id="signout" style="margin-bottom:14px">⏻ SIGN OUT · 접속 종료</button>
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
    const { sb } = await import('../db.js');
    await sb.auth.signOut();
  });
}
