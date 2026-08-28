// 미션 컨트롤(대시보드) · 셀 채우기 · 스타맵
import { S, uid, theme, quotaInfo, ensureAssignment, commitCell, levelDone, nextMilestone, bumpRejects } from '../store.js';
import * as db from '../db.js';
import { renderScreen, statusBar, titleBar, tabBar, drawMasked, toast } from '../ui.js';
import { spriteHTML, THEMES } from '../sprites.js';
import { gridOf, levelsOf, seedOf, targetHSL, hslToHex, analyzePhoto, todayStr, untilMidnight, L_TOLERANCE, INK_PER_CELL, colorMatch, COLOR_SYNC_BONUS_AT, COLOR_BONUS_INK, lum } from '../game.js';

const pad2 = v => String(v).padStart(2, '0');

function stardate() {
  const d = new Date();
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return `SD.${String(d.getFullYear()).slice(2)}.${pad2(d.getMonth() + 1)}.${String(doy).padStart(3, '0')}`;
}

// 최근 14일 스트릭 셀
function streakCellsHTML() {
  const days = new Set(S.recentDates);
  let out = '';
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    out += `<i class="${days.has(key) ? 'on' : ''}"></i>`;
  }
  return out;
}

// ── 미션 컨트롤 (대시보드) ────────────────────────────────
export function dashboardScreen() {
  const p = S.profile;
  const n = gridOf(p.stage);
  const total = n * n, filled = S.cells.length;
  const pct = Math.floor(filled / total * 100);
  const q = quotaInfo();
  const ms = nextMilestone();
  const done = levelDone();
  const cleared = p.stage === 3 && p.level > 0; // 최종 스테이지 반복 플레이 상태

  const root = renderScreen(`
    ${statusBar()}
    ${titleBar('MISSION CONTROL', stardate())}
    <div style="padding:16px 16px 0">
      <div class="row label" style="align-items:baseline;gap:10px">
        <span>STAGE ${pad2(p.stage + 1)} · LVL ${pad2(p.level + 1)}${p.stage === 3 && p.level > 0 ? '' : ' / ' + pad2(levelsOf(p.stage))}</span>
        <span class="grow" style="height:1px;background:var(--line-soft)"></span><span>GRID ${n}×${n}</span>
      </div>
      <div class="row" style="align-items:flex-end;gap:14px;margin-top:10px">
        <div style="font:700 54px/.86 var(--mono);color:var(--bright);text-shadow:0 0 9px rgb(var(--ink-rgb)/.6),0 0 34px rgb(var(--ink-rgb)/.38)">${pct}<span style="font-size:19px;opacity:.6">%</span></div>
        <div class="grow" style="padding-bottom:8px">
          <div class="pbar">
            <div class="track"></div>
            <div class="fill" style="width:${pct}%"></div>
            <div class="marker" style="left:${pct}%">▼</div>
          </div>
          <div class="pbar-scale"><span>0</span><span>50</span><span>100</span></div>
          <div class="mono11 dim" style="margin-top:4px">${filled} / ${total} CELLS · SIGNAL ${pct}%</div>
        </div>
      </div>
    </div>

    <div class="mx16 mt16" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="panel pad">
        <div class="label">SESSION QUOTA</div>
        <div style="margin:9px 0 7px;height:13px;border:1px solid rgb(var(--ink-rgb)/.54);position:relative">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${Math.min(100, q.used / q.total * 100).toFixed(1)}%;background:var(--ink);box-shadow:0 0 9px rgb(var(--ink-rgb)/.6)"></div>
        </div>
        <div class="glow" style="font:500 15px var(--mono)">${q.left}<span style="font-size:11px;color:var(--dim)"> / ${q.total} CELLS</span></div>
        <div class="mono11 dim" style="margin-top:3px">RESET AT MIDNIGHT · ${untilMidnight()}</div>
      </div>
      <div class="panel pad">
        <div class="label">TRANSMIT STREAK</div>
        <div class="glow" style="font:500 15px var(--mono);margin:9px 0 6px">${p.streak}<span style="font-size:11px;color:var(--dim)"> DAYS</span></div>
        <div class="scells">${streakCellsHTML()}</div>
        <div class="mono11 dim" style="margin-top:6px">LAST 14 CYCLES</div>
      </div>
    </div>

    <div class="mx16 mt8 row panel">
      <div class="grow pad" style="border-right:1px solid var(--line-soft)">
        <div class="label">COLOR INK</div>
        <div class="glow" style="font:500 14px var(--mono);margin-top:4px">◈ ${(p.ink || 0).toLocaleString()}<span style="font-size:11px;color:var(--dim)"> +${INK_PER_CELL} / CELL</span></div>
      </div>
      <div class="grow pad">
        <div class="label">NEXT MILESTONE</div>
        <div style="font:500 14px var(--mono);margin-top:4px">${ms ? `${ms.days}D<span style="font-size:11px;color:var(--dim)"> IN ${ms.left} CYCLES</span>` : `<span style="font-size:12px">ALL CLAIMED</span>`}</div>
      </div>
    </div>

    <div class="mx16 mt8 panel">
      <div class="panel-head">SIGNAL MAP · STAGE ${pad2(p.stage + 1)} · MASKED</div>
      <div class="pad row gap12" style="align-items:center">
        <canvas id="minimap" class="gridcv" width="256" height="256" style="width:128px;height:128px;flex:none;filter:blur(.3px)"></canvas>
        <div class="grow mono11 dim" style="line-height:1.8">
          <div style="color:var(--ink)">▪ FILLED &nbsp;&nbsp;${filled}</div>
          <div>▫ EMPTY &nbsp;&nbsp;${total - filled}</div>
          <div style="margin-top:8px">TARGET SOURCE<br>CURATED · SEALED</div>
          <div class="flicker" style="margin-top:8px;color:var(--ink)">DUOTONE LOCK ON</div>
        </div>
      </div>
    </div>

    <div class="grow"></div>

    <button id="cta" class="mx16 row" style="margin-bottom:10px;border:1px solid var(--ink);padding:12px 14px;align-items:center;gap:13px;box-shadow:0 0 20px rgb(var(--ink-rgb)/.22);text-align:left">
      ${spriteHTML(done ? 'buddyHappy' : 'buddy', 44, theme().pal)}
      <div class="grow">
        <div style="font:700 13px var(--mono);letter-spacing:.2em;color:var(--bright);text-shadow:0 0 10px rgb(var(--ink-rgb)/.6)">${done ? '신호 복원 완료 — REVEAL ▸' : cleared ? '반복 복원 계속하기 ▸' : '오늘의 셀 채우기 ▸'}</div>
        <div class="mono11 dim" style="letter-spacing:.14em;margin-top:5px">${done ? 'COLOR LOCK RELEASE READY' : `${q.left} CELLS AVAILABLE · MIDNIGHT RESET`}</div>
      </div>
    </button>
    ${tabBar('dashboard')}
  `);

  const filledSet = new Set(S.cells.map(c => c.y * 10000 + c.x));
  drawMasked(root.querySelector('#minimap'), n, seedOf(p.stage, p.level), filledSet);
  root.querySelector('#cta').addEventListener('click', () => S.nav(done ? 'reveal' : 'cellfill'));
}

// ── 셀 채우기 ────────────────────────────────────────────
export function cellfillScreen() {
  if (levelDone()) { S.nav('reveal'); return; }

  let step = 0;          // 0 대기 1 분석 2 반려 3 통과
  let assignment = null; // {date,x,y}
  let analysis = null;   // analyzePhoto 결과
  let previewURL = null;
  let deltaDir = null;   // 'dark' | 'bright'
  let busy = false;

  const p = S.profile;
  const n = gridOf(p.stage);
  const seed = seedOf(p.stage, p.level);

  const draw = () => {
    if (S.screen !== 'cellfill') return; // 화면 이탈 후 늦은 draw 방지
    const q = quotaInfo();
    if (q.left <= 0 && step !== 3) { drawDepleted(q); return; }
    if (!assignment) {
      renderScreen(`${statusBar()}${titleBar('CELL ASSIGNMENT', '', 'back')}
        <div class="center dim mono12" style="padding:60px 26px">좌표 배정 중<span class="blink">█</span></div>`)
        .querySelector('.tb-back').addEventListener('click', () => S.nav('dashboard'));
      return;
    }

    const t = targetHSL(assignment.x, assignment.y, n, seed);
    const hex = hslToHex(t.h, t.s, t.l).toUpperCase();
    const coord = `R${pad2(assignment.y + 1)}·C${pad2(assignment.x + 1)}`;

    // 색상 근접도 (분석 완료 후에만) — 통과와 무관한 소프트 지표
    const sync = analysis ? colorMatch(analysis.hsl, t) : null;
    const perfectSync = sync != null && sync >= COLOR_SYNC_BONUS_AT;
    const syncLabel = step < 2 ? '—'
      : sync == null ? 'N/A · 저채도'
      : `${sync}%${perfectSync ? ' ◈ PERFECT' : ''}`;

    const intake = [
      ['DROP TODAY\'S PHOTO', '▸ TAP TO TRANSMIT'],
      ['EXTRACTING DOMINANT COLOR', '▚ SCANNING…'],
      [`SPECIMEN · ${analysis?.sizeMB || '?'}MB`, '◇ COLOR MISMATCH'],
      [`SPECIMEN · ${analysis?.sizeMB || '?'}MB`, '◈ MATCH LOCKED · 재터치로 교체 가능'],
    ][step];
    const sampled = ['NONE', 'ANALYSING…', 'RECEIVED', 'RECEIVED'][step];
    const delta = ['AWAITING', 'SAMPLING…', deltaDir === 'dark' ? 'TOO DARK ▼' : 'TOO BRIGHT ▲', 'IN RANGE ✓'][step];
    const verdict = [
      ['STANDBY', `목표 명도에 가까우면 통과 · 색조까지 맞추면 INK +${COLOR_BONUS_INK} 보너스. 오늘 남은 셀 ${q.left}칸.`],
      ['ANALYSING', '대표 색상 추출 중 — 이동하지 마시오.'],
      [deltaDir === 'dark' ? 'TOO DARK' : 'TOO BRIGHT', deltaDir === 'dark' ? '사진이 너무 어두워요. 조금 더 밝은 사진으로 다시 송신해 주세요.' : '사진이 너무 밝아요. 조금 더 어두운 사진으로 다시 송신해 주세요.'],
      ['ACCEPTED', `${coord} 에 정착 준비 완료. 확정 시 듀오톤 봉인 적용, INK +${INK_PER_CELL}${perfectSync ? ` +${COLOR_BONUS_INK} (COLOR SYNC ${sync}%)` : ''} 지급.`],
    ][step];
    const cta = ['TRANSMIT SPECIMEN ▸', 'ANALYSING ▚', 'RE-TRANSMIT ↺', 'CONFIRM & FILL CELL ▸'][step];
    const sprName = step === 2 ? 'buddySad' : step === 3 ? 'buddyHappy' : 'buddy';

    const root = renderScreen(`
      ${statusBar()}
      ${titleBar('CELL ASSIGNMENT', '', 'back')}
      <div style="padding:16px 16px 0" class="row gap12">
        <div class="grow panel pad">
          <div class="label">ASSIGNED COORD</div>
          <div style="font:700 26px var(--mono);color:var(--bright);margin-top:7px;text-shadow:0 0 9px rgb(var(--ink-rgb)/.55)">${coord}</div>
          <div class="mono11 dim" style="margin-top:5px">RANDOM ALLOCATION · STAGE ${pad2(p.stage + 1)}</div>
        </div>
        <div class="panel pad" style="width:118px">
          <div class="label">TARGET COLOR</div>
          <div style="height:36px;margin:7px 0;border:1px solid rgb(var(--ink-rgb)/.54);background:${hex}"></div>
          <div style="font:500 13px var(--mono)">${hex}</div>
          <div class="dim" style="margin-top:5px;font:400 8.5px/1.5 var(--mono)">명도 = 통과<br>색조 = 잉크 보너스</div>
        </div>
      </div>

      <div class="mx16 mt12 panel grow" style="display:flex;flex-direction:column;min-height:0">
        <div class="panel-head">SPECIMEN INTAKE</div>
        <div class="intake" id="intake">
          ${previewURL ? `<div class="preview ${step >= 2 ? 'sealed' : ''}" style="background-image:url('${previewURL}')"></div>` : ''}
          ${step === 1 ? '<div class="sweepline"></div>' : ''}
          <div style="position:relative;text-align:center;font:400 10px/1.9 var(--mono);color:var(--dim);padding:14px">
            <div style="display:flex;justify-content:center;margin-bottom:8px">${spriteHTML(sprName, 60, theme().pal)}</div>
            <div>${intake[0]}</div>
            <div style="color:var(--ink)">${intake[1]}</div>
          </div>
        </div>
        <div class="mono11 dim" style="padding:0 11px 11px;line-height:1.75">
          <div>SPECIMEN &nbsp;${sampled}</div>
          <div>MATCH &nbsp;&nbsp;&nbsp;&nbsp;${delta}</div>
          <div>C-SYNC &nbsp;&nbsp;<span style="${perfectSync ? 'color:var(--ink)' : ''}">${syncLabel}</span></div>
          ${sync != null ? `<div class="minibar" style="margin-top:5px"><i style="width:${sync}%"></i></div>` : ''}
        </div>
      </div>

      <div class="verdict ${step === 2 ? 'bad' : ''}">
        <div class="v-title">${verdict[0]}</div>
        <div class="v-body">${verdict[1]}</div>
      </div>

      ${step === 2 && (p.special_pixels || 0) > 0 ? `<button class="btn mx16 mt8" id="special" style="width:auto;padding:11px;font-size:11.5px">◈ SPECIAL PIXEL 사용 (보유 ${p.special_pixels}) — 판정 면제</button>` : ''}
      <button class="btn ${step === 2 ? 'alert-btn' : ''}" id="cta" style="margin:12px 16px 8px;width:auto" ${step === 1 ? 'disabled' : ''}>${cta}</button>
      <button class="link-btn" id="reset" style="margin-bottom:18px">↺ RESET SEQUENCE</button>
      <input type="file" id="file" accept="image/*" style="display:none">
    `);

    root.querySelector('.tb-back').addEventListener('click', () => S.nav('dashboard'));
    const fileEl = root.querySelector('#file');
    // 통과(3) 상태에서도 인테이크 재터치로 재선택 허용 — 컨펌 전 교체 기회
    const pick = () => { if (!busy && step !== 1) fileEl.click(); };
    root.querySelector('#intake').addEventListener('click', pick);
    root.querySelector('#reset').addEventListener('click', () => {
      if (busy) return;
      step = 0; analysis = null; deltaDir = null;
      if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
      draw();
    });
    root.querySelector('#special')?.addEventListener('click', async () => {
      if (busy) return;
      step = 3;
      S.profile = await db.updateProfile(uid(), { special_pixels: p.special_pixels - 1 });
      toast('SPECIAL PIXEL 사용 — 판정이 면제되었습니다');
      draw();
    });

    fileEl.addEventListener('change', async () => {
      const file = fileEl.files?.[0];
      if (!file) return;
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(file);
      step = 1; draw();
      try {
        const res = await analyzePhoto(file);
        analysis = res;
        // 판정: HSL 명도 ±15
        const diff = res.hsl.l - t.l;
        if (Math.abs(diff) <= L_TOLERANCE) { step = 3; }
        else {
          step = 2;
          deltaDir = diff < 0 ? 'dark' : 'bright';
          bumpRejects().catch(() => {});
        }
      } catch (e) {
        step = 0; toast('이미지를 분석할 수 없습니다: ' + (e.message || e));
      }
      // 최소 스캔 연출 시간
      setTimeout(draw, 900);
    });

    root.querySelector('#cta').addEventListener('click', async () => {
      if (busy) return;
      if (step === 0 || step === 2) { pick(); return; }
      if (step !== 3) return;
      busy = true;
      const btn = root.querySelector('#cta');
      btn.disabled = true; btn.textContent = 'TRANSMITTING ▚';
      try {
        const path = `${uid()}/${p.stage}-${p.level}-${assignment.x}-${assignment.y}.jpg`;
        if (analysis?.blob) await db.uploadPhoto(path, analysis.blob);
        const { grants, note, bonus, milestone } = await commitCell({
          x: assignment.x, y: assignment.y, targetHex: hex,
          photoPath: analysis?.blob ? path : null,
          colorSync: sync,
        });
        if (note) toast(note);
        if (bonus) setTimeout(() => toast(`◈ PERFECT COLOR SYNC ${sync}% · INK +${bonus}`), 700);
        grants.forEach((g, i) => setTimeout(() => toast('◈ ' + g), 800 * (i + 2)));

        if (levelDone()) { S.nav('reveal'); return; }
        if (milestone) showMilestone(milestone, n, seed);
        toast(`${coord} 정착 완료 · INK +${INK_PER_CELL}${bonus ? ` +${bonus}` : ''}`);
        // 다음 셀 준비
        step = 0; analysis = null; deltaDir = null;
        if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
        assignment = null; busy = false;
        assignment = await ensureAssignment();
        draw();
      } catch (e) {
        busy = false;
        toast('전송 실패: ' + (e.message || e), 4000);
        btn.disabled = false; btn.textContent = 'CONFIRM & FILL CELL ▸';
      }
    });
  };

  const drawDepleted = q => {
    const root = renderScreen(`
      ${statusBar()}
      ${titleBar('CELL ASSIGNMENT', '', 'back')}
      <div class="grow" style="display:flex;flex-direction:column;justify-content:center;padding:0 26px">
        <div style="display:flex;justify-content:center;margin-bottom:16px">${spriteHTML('buddySad', 72, theme().pal)}</div>
        <div class="h1 center" style="font-size:24px">QUOTA<br>DEPLETED</div>
        <div class="center mono12 dim mt12">오늘의 세션 한도 ${q.total}칸을 모두 사용했습니다.<br>자정에 리셋됩니다 · ${untilMidnight()} 남음</div>
        <button class="btn mt20" id="shop">SHOP 에서 한도 확장 ▸</button>
      </div>
      ${tabBar('dashboard')}
    `);
    root.querySelector('.tb-back').addEventListener('click', () => S.nav('dashboard'));
    root.querySelector('#shop').addEventListener('click', () => S.nav('shop'));
  };

  ensureAssignment().then(a => { assignment = a; draw(); }).catch(e => toast('배정 실패: ' + e.message));
  draw();
}

// ── 중간 마일스톤 오버레이 (디자인 2e) — 25/50/75% 도달 시 ──
const MS_COPY = {
  25: '신호의 4분의 1이\n복원되었다',
  50: '신호의 절반이\n복원되었다',
  75: '신호의 4분의 3이\n복원되었다',
};

function showMilestone(ms, n, seed) {
  const dim = document.createElement('div');
  dim.className = 'ms-dim';
  const modal = document.createElement('div');
  modal.className = 'ms-modal';
  modal.innerHTML = `
    <div class="ms-head"><span>MILESTONE · ${ms.pct}%</span><span>◈ +${ms.ink}</span></div>
    <div style="padding:16px 14px">
      <div style="font:700 20px/1.25 var(--mono);letter-spacing:.02em;color:var(--bright);white-space:pre-line;text-shadow:0 0 10px rgb(var(--ink-rgb)/.5)">${MS_COPY[ms.pct] || ''}</div>
      <div class="mono11 dim" style="margin-top:9px;line-height:1.8">노이즈가 한 겹 걷혔습니다. 형체가 조금 더 또렷해집니다. · ${ms.filled} / ${ms.total} CELLS</div>
      <div style="margin-top:13px;display:flex;gap:10px;align-items:center">
        <canvas id="msBlur" width="96" height="96" style="width:80px;height:80px;flex:none;filter:blur(1.4px);image-rendering:pixelated;box-shadow:inset 0 0 0 1px rgb(var(--ink-rgb)/.2)"></canvas>
        <div style="font:400 12px var(--mono);color:var(--ink)">▸</div>
        <canvas id="msSharp" width="96" height="96" style="width:80px;height:80px;flex:none;image-rendering:pixelated;box-shadow:0 0 18px rgb(var(--ink-rgb)/.3)"></canvas>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;align-items:center">
        <button class="btn grow" id="msOk" style="padding:11px;width:auto">확인</button>
        <span class="mono11 dim">3초 후 닫힘</span>
      </div>
    </div>`;
  document.body.appendChild(dim);
  document.body.appendChild(modal);

  // 흐림 → 또렷 프리뷰 (여전히 명도 블록 — 원본은 리빌 전까지 봉인)
  const filled = new Set(S.cells.map(c => c.y * 10000 + c.x));
  const blurCv = modal.querySelector('#msBlur');
  const sharpCv = modal.querySelector('#msSharp');
  drawMasked(blurCv, n, seed, filled);
  const g = sharpCv.getContext('2d');
  const t = theme();
  const [ir, ig, ib] = t.ink.replace('#', '').match(/../g).map(v => parseInt(v, 16));
  g.fillStyle = t.bg; g.fillRect(0, 0, 96, 96);
  const px = 96 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    // 전체 실루엣을 살짝 더 또렷하게 보여주는 보상 프리뷰 (여전히 단색 봉인)
    const a = .12 + .66 * lum(x, y, n, seed);
    g.fillStyle = `rgba(${ir},${ig},${ib},${a.toFixed(3)})`;
    g.fillRect(x * px, y * px, Math.ceil(px), Math.ceil(px));
  }

  const close = () => { dim.remove(); modal.remove(); };
  modal.querySelector('#msOk').addEventListener('click', close);
  dim.addEventListener('click', close);
  setTimeout(close, 3000);
}

// ── 스타맵 ───────────────────────────────────────────────
export function starmapScreen() {
  const p = S.profile;
  const n = gridOf(p.stage);
  const seed = seedOf(p.stage, p.level);
  const filled = new Set(S.cells.map(c => c.y * 10000 + c.x));
  let sel = null;

  const inspectorHTML = () => {
    const isF = sel && filled.has(sel.y * 10000 + sel.x);
    return `
      <div class="label">CELL INSPECTOR</div>
      <div class="row gap12" style="margin-top:10px;align-items:flex-start">
        <div style="width:52px;height:52px;flex:none;border:1px solid rgb(var(--ink-rgb)/.48);background:${sel && isF ? `rgb(var(--ink-rgb)/${(.18 + .5 * (sel ? 0.5 : 0)).toFixed(2)})` : 'transparent'};box-shadow:0 0 14px rgb(var(--ink-rgb)/.22)"></div>
        <div class="grow" style="font:400 10px/1.9 var(--mono);color:var(--dim)">
          <div style="color:var(--bright);font-weight:500;letter-spacing:.1em">${sel ? `R${pad2(sel.y + 1)}·C${pad2(sel.x + 1)}` : 'NO CELL SELECTED'}</div>
          <div>STATUS &nbsp;&nbsp;${sel ? (isF ? 'FILLED · SEALED' : 'EMPTY · AWAITING') : '—'}</div>
          <div>SOURCE &nbsp;&nbsp;${sel ? (isF ? 'OPERATOR SPECIMEN' : 'UNASSIGNED') : '—'}</div>
          <div>PREVIEW &nbsp;LOCKED UNTIL REVEAL</div>
        </div>
      </div>`;
  };

  const root = renderScreen(`
    ${statusBar()}
    ${titleBar('STARMAP', `STAGE ${pad2(p.stage + 1)} · ${n}×${n} · MASKED`)}
    <div style="padding:14px 16px 0" class="row gap12" >
      ${spriteHTML('orbit', 64)}
      <div class="grow mono11 dim" style="line-height:1.7;align-self:center">모든 셀은 듀오톤으로 봉인되어 있다. 좌표와 채움 상태만 조회 가능.</div>
    </div>
    <div class="mx16 mt14 panel" style="padding:9px;box-shadow:0 0 22px rgb(var(--ink-rgb)/.1)">
      <canvas id="map" class="gridcv" width="768" height="768"></canvas>
    </div>
    <div class="mx16 mt12 row" style="gap:16px" >
      <span class="mono11" style="color:var(--ink)">▪ FILLED ${S.cells.length}</span>
      <span class="mono11 dim">▫ EMPTY ${n * n - S.cells.length}</span>
      <span class="mono11 dim">◻ SELECTED</span>
    </div>
    <div class="mx16 mt12 panel pad" id="inspector">${inspectorHTML()}</div>
    <div class="grow"></div>
    <div class="mx16 mono11 dim flicker" style="margin-bottom:12px">&gt; ${n * n - S.cells.length} FRAGMENTS STILL DARK. 신호는 기다린다.</div>
    ${tabBar('starmap')}
  `);

  const cv = root.querySelector('#map');
  const redraw = () => drawMasked(cv, n, seed, filled, { sel });
  redraw();
  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * n);
    const y = Math.floor((e.clientY - r.top) / r.height * n);
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    sel = { x, y };
    redraw();
    root.querySelector('#inspector').innerHTML = inspectorHTML();
  });
}
