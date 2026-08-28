// 실전형 튜토리얼 (PRD 2.2 / 3.1) — 54칸 선채움 8x8의 마지막 10칸 채우기 + 튜토리얼 리빌
import { S, uid, tutState, commitTutCell } from '../store.js';
import * as db from '../db.js';
import { renderScreen, statusBar, titleBar, toast } from '../ui.js';
import { hslToHex, analyzePhoto, tutCellHSL, TUT_HOLES, TUT_TOLERANCE } from '../game.js';

const pad2 = v => String(v).padStart(2, '0');
const holeOrder = i => TUT_HOLES.indexOf(i);
const tutLum = (x, y) => tutCellHSL(x, y).l / 100; // 봉인 상태 명도 셰이딩용

// n번째 구멍의 목표 색 = 완성 그림(하트)에서 그 칸이 실제로 갖는 색 (싱크 보장)
function holeTarget(order) {
  const i = TUT_HOLES[Math.min(order, TUT_HOLES.length - 1)];
  const x = i % 8, y = (i / 8) | 0;
  const c = tutCellHSL(x, y);
  return { x, y, hex: hslToHex(c.h, c.s, c.l).toUpperCase(), l: c.l, name: colorName(c) };
}

// HSL → 한국어 색 이름 (안내용)
function colorName({ h, l }) {
  const tone = l < 30 ? '깊은 ' : l > 62 ? '옅은 ' : '';
  const hue = h < 15 || h >= 345 ? '붉은빛' : h < 45 ? '주황빛' : h < 70 ? '노란빛'
    : h < 160 ? '초록빛' : h < 200 ? '청록빛' : h < 250 ? '푸른빛'
    : h < 290 ? '보랏빛' : '분홍빛';
  return tone + hue;
}

// ── 튜토리얼 그리드 HTML (2a) ─────────────────────────────
function tutGridHTML(done) {
  const target = holeTarget(done);
  let cells = '';
  for (let i = 0; i < 64; i++) {
    const x = i % 8, y = (i / 8) | 0;
    const o = holeOrder(i);
    if (o >= 0) {
      if (o < done)       // 내가 채운 칸
        cells += `<i style="background:rgb(var(--ink-rgb)/${(.3 + .5 * tutLum(x, y)).toFixed(2)});box-shadow:0 0 7px rgb(var(--ink-rgb)/.55)"></i>`;
      else if (o === done) // 지금 배정된 칸
        cells += `<i class="flicker" style="background:${target.hex};box-shadow:0 0 0 2px var(--bright),0 0 16px rgb(var(--bright-rgb)/.8)"></i>`;
      else                 // 아직 남은 칸
        cells += `<i style="background:var(--panel);box-shadow:inset 0 0 0 1px rgb(var(--bright-rgb)/.55)"></i>`;
    } else {               // 누군가 채워둔 54칸 (선채움)
      cells += `<i style="background:rgb(var(--ink-rgb)/${(.06 + .34 * tutLum(x, y)).toFixed(2)});opacity:.5"></i>`;
    }
  }
  return `<div class="tutgrid">${cells}</div>`;
}

// ── 튜토리얼 본 화면 (2a) ─────────────────────────────────
export function tutorialScreen() {
  const t = tutState();
  if (t.done >= 10) { S.nav('tutorialReveal'); return; }

  let step = 0;          // 0 대기 1 분석 2 반려 3 통과
  let analysis = null;
  let previewURL = null;
  let deltaDir = null;
  let busy = false;

  const draw = () => {
    if (S.screen !== 'tutorial') return;
    const done = tutState().done;
    const left = 10 - done;
    const target = holeTarget(done);
    const tL = target.l;

    const statusLine = step === 2
      ? (deltaDir === 'dark' ? '신호가 너무 어두워요 — 더 밝은 사진으로' : '신호가 너무 밝아요 — 더 어두운 사진으로')
      : step === 3 ? 'MATCH LOCKED — 정착 준비 완료'
      : `REMAINING ${pad2(left)} FRAGMENTS`;
    const cta = ['사진 올려서 이 칸 채우기 ▸', 'ANALYSING ▚', 'RE-TRANSMIT ↺', 'CONFIRM & FILL ▸'][step];

    const root = renderScreen(`
      ${statusBar()}
      ${titleBar('TUTORIAL SIGNAL', `잔여 ${pad2(left)} / 10 · 8×8`)}
      <div class="mx16 mt6 mono11" style="line-height:1.7">누군가 이 신호를 54칸까지 복원해두고 떠났다. 남은 조각은 열 개. 이제 당신 차례다.</div>

      <div class="panel" style="padding:8px;max-width:min(264px, 30vh);width:calc(100% - 32px);margin:8px auto 0;box-shadow:0 0 24px rgb(var(--ink-rgb)/.12)">${tutGridHTML(done)}</div>
      <div class="row" style="gap:12px;justify-content:center;margin-top:4px">
        <span class="mono11 dim" style="opacity:.6">▪ 선채움 54</span>
        <span class="mono11" style="color:var(--ink)">▪ 내가 채운 ${done}</span>
        <span class="mono11" style="color:var(--bright)">◻ 남은 칸</span>
      </div>

      <div class="mx16 mt8 panel">
        <div class="panel-head" style="padding:5px 11px">배정된 칸 · 목표 색상</div>
        <div style="padding:9px 12px">
          <div id="swatch" style="cursor:pointer">
          ${previewURL
            ? `<div style="height:46px;background-image:url('${previewURL}');background-size:cover;background-position:center;border:1px solid rgb(var(--bright-rgb)/.5);${step === 2 ? 'filter:grayscale(.6) brightness(.7)' : ''}"></div>`
            : `<div style="height:32px;background:${target.hex};box-shadow:0 0 18px ${target.hex}88;border:1px solid rgb(var(--bright-rgb)/.5)"></div>`}
          </div>
          <div class="row" style="justify-content:space-between;align-items:baseline;margin-top:7px">
            <span style="font:500 12px var(--mono);letter-spacing:.08em;color:var(--bright)">${target.name} · R${pad2(target.y + 1)}·C${pad2(target.x + 1)}</span>
            <span class="mono11 dim">${target.hex} · L ${Math.round(tL)}</span>
          </div>
          <div class="mono11 dim" style="margin-top:4px;line-height:1.6">${step === 3
            ? '정착 전에 미리보기를 다시 터치하면 사진을 교체할 수 있습니다.'
            : '이 색과 비슷한 밝기의 사진을 송신하세요. 조금 달라도 됩니다.'}</div>
        </div>
      </div>

      <div class="grow"></div>
      <div class="mx16 mono11 dim" style="margin-bottom:5px;letter-spacing:.14em">▸ ${statusLine} · 쿼터 미적용</div>
      <button class="btn mx16 ${step === 2 ? 'alert-btn' : ''}" id="cta" style="margin-bottom:10px;width:auto;padding:12px" ${step === 1 ? 'disabled' : ''}>${cta}</button>
      <input type="file" id="file" accept="image/*" style="display:none">
    `);

    const fileEl = root.querySelector('#file');
    // 통과(3) 상태에서도 재선택 허용 — 컨펌 전 교체 기회
    const pick = () => { if (!busy && step !== 1) fileEl.click(); };
    root.querySelector('#swatch').addEventListener('click', pick);

    fileEl.addEventListener('change', async () => {
      const file = fileEl.files?.[0];
      if (!file) return;
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(file);
      step = 1; draw();
      try {
        analysis = await analyzePhoto(file);
        const diff = analysis.hsl.l - tL;
        if (Math.abs(diff) <= TUT_TOLERANCE) step = 3;
        else { step = 2; deltaDir = diff < 0 ? 'dark' : 'bright'; }
      } catch (e) {
        step = 0; toast('이미지를 분석할 수 없습니다: ' + (e.message || e));
      }
      setTimeout(draw, 700);
    });

    root.querySelector('#cta').addEventListener('click', async () => {
      if (busy) return;
      if (step === 0 || step === 2) { pick(); return; }
      if (step !== 3) return;
      busy = true;
      const btn = root.querySelector('#cta');
      btn.disabled = true; btn.textContent = 'TRANSMITTING ▚';
      try {
        const path = `${uid()}/tut-${done}.jpg`;
        if (analysis?.blob) await db.uploadPhoto(path, analysis.blob);
        const tut = await commitTutCell(analysis?.blob ? path : null);
        if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
        step = 0; analysis = null; deltaDir = null; busy = false;
        if (tut.done >= 10) { S.nav('tutorialReveal'); return; }
        toast(`조각 정착 완료 · ${10 - tut.done}칸 남음`);
        draw();
      } catch (e) {
        busy = false;
        toast('전송 실패: ' + (e.message || e), 4000);
        btn.disabled = false; btn.textContent = 'CONFIRM & FILL ▸';
      }
    });
  };
  draw();
}

// ── 튜토리얼 리빌 (2b) ────────────────────────────────────
export function tutorialRevealScreen() {
  const t = tutState();
  if (t.done < 10) { S.nav('tutorial'); return; }

  let revealed = false;
  let photoUrls = null; // hole order → signed url

  // 셀별 최종(리빌) 스타일 — 선채움 54칸은 목표 색, 내 10칸은 사진 원본 (틴트 없음)
  const cellFinal = i => {
    const x = i % 8, y = (i / 8) | 0;
    const c = tutCellHSL(x, y);
    const hex = hslToHex(c.h, c.s, c.l);
    const o = holeOrder(i);
    const url = o >= 0 && photoUrls ? photoUrls[o] : null;
    return url
      ? `background-image:url('${url}');background-size:cover;background-position:center`
      : `background:${hex}`;
  };

  const gridHTML = () => {
    let cells = '';
    for (let i = 0; i < 64; i++) {
      const x = i % 8, y = (i / 8) | 0;
      const sealed = `background:rgb(var(--ink-rgb)/${(.08 + .5 * tutLum(x, y)).toFixed(2)})`;
      cells += `<i style="${revealed ? cellFinal(i) : sealed};transition:all .9s ease"></i>`;
    }
    return `<div class="tutgrid" style="gap:2px">${cells}</div>`;
  };

  // 내가 채운 10칸의 무게중심 (줌 초점) — 그리드 % 좌표
  const FOCUS = (() => {
    let sx = 0, sy = 0;
    TUT_HOLES.forEach(i => { sx += (i % 8) + .5; sy += ((i / 8) | 0) + .5; });
    return { x: sx / TUT_HOLES.length / 8 * 100, y: sy / TUT_HOLES.length / 8 * 100 };
  })();

  // 기존 셀 요소의 스타일만 갱신 (트랜지션 발동, 재렌더 없음)
  const applyFinal = idxs => {
    const grid = document.querySelector('#grid .tutgrid');
    if (!grid) return;
    idxs.forEach(i => { grid.children[i].style.cssText += ';' + cellFinal(i); });
  };

  // 리빌 모션: 내 픽셀 영역으로 줌인 → 내 10칸 공개 → 전체로 줌아웃하며 완성본 공개
  const animateReveal = () => {
    const grid = document.querySelector('#grid .tutgrid');
    if (!grid) return;
    grid.style.transformOrigin = `${FOCUS.x.toFixed(1)}% ${FOCUS.y.toFixed(1)}%`;
    grid.style.transition = 'transform .9s cubic-bezier(.3,0,.2,1)';
    grid.style.transform = 'scale(2.1)';
    // 1) 내가 채운 칸부터 순서대로 공개
    TUT_HOLES.forEach((idx, k) => setTimeout(() => applyFinal([idx]), 350 + k * 130));
    // 2) 전체로 줌아웃 — 나머지 칸이 중심에서 바깥으로 퍼지며 공개
    setTimeout(() => {
      grid.style.transition = 'transform 1.6s cubic-bezier(.3,0,.2,1)';
      grid.style.transform = 'scale(1)';
      const cx = FOCUS.x / 100 * 8, cy = FOCUS.y / 100 * 8;
      for (let i = 0; i < 64; i++) {
        if (holeOrder(i) >= 0) continue;
        const d = Math.hypot((i % 8) + .5 - cx, ((i / 8) | 0) + .5 - cy);
        setTimeout(() => applyFinal([i]), d * 150);
      }
    }, 2100);
  };

  const draw = () => {
    if (S.screen !== 'tutorialReveal') return;
    const root = renderScreen(`
      ${statusBar(revealed ? 'LINK · ▮▮▮▮ · 63%' : 'SCAN · ▮▮▮▯ · 63%')}
      <div style="padding:24px 24px 0">
        <div class="kicker">${revealed ? 'TUTORIAL SIGNAL · 64 / 64' : 'DENOISE SEQUENCE · STANDBY'}</div>
        <div class="h1 mt12" style="font-size:31px">${revealed ? '누군가의 신호가\n복원되었다' : '마지막 조각이\n자리를 찾았다'}</div>
      </div>
      <div class="mx16 mt20" style="border:1px solid rgb(var(--ink-rgb)/.5);padding:6px;box-shadow:0 0 34px rgb(var(--ink-rgb)/.18);overflow:hidden" id="grid">${gridHTML()}</div>
      <div class="mx16 mt16 mono12" style="line-height:1.9">${revealed
        ? '당신보다 먼저 이곳을 지나간 누군가가 54칸을 채워두고 떠났다. 마지막 10칸은 당신의 사진으로 채워졌다. 이제 이 신호는 두 사람의 것이다.'
        : '노이즈를 걷어낼 준비가 되었다. 이 그림이 무엇인지는 아직 아무도 모른다.'}</div>
      <div class="mx16 mt12 mono11 dim" style="padding-left:12px;border-left:1px solid var(--line-strong);line-height:1.85">${revealed
        ? '이제 당신의 신호를 복원할 차례다. 스테이지 1 — 8×8, 64칸 전부 당신의 것.'
        : 'LINK 복원 중… 잔여 노이즈 0.4%'}</div>
      <div class="grow"></div>
      <button class="btn mx16" id="go" style="margin-bottom:12px;width:auto;${revealed ? '' : 'border-color:#A594F9;box-shadow:0 0 24px rgba(165,148,249,.4)'}">${revealed ? '스테이지 1 시작하기 ▸' : 'RELEASE NOISE FILTER ▸'}</button>
      <div class="center mono11 dim" style="letter-spacing:.14em;margin-bottom:26px">${revealed ? '이후 모든 레벨은 쿼터가 적용됩니다 · 하루 30칸' : '튜토리얼 전용 연출 · 1회 노출'}</div>
    `);

    root.querySelector('#go').addEventListener('click', async () => {
      if (!revealed) {
        revealed = true;
        root.querySelector('#go').disabled = true;
        animateReveal(); // 줌인 → 내 칸 공개 → 줌아웃 전체 공개
        setTimeout(draw, 4300);
      } else {
        S.profile = await db.updateProfile(uid(), { onboarded: true });
        toast('TUTORIAL COMPLETE — 당신의 첫 신호가 기다립니다');
        S.nav('dashboard');
      }
    });
  };

  draw();
  // 유저가 채운 10칸의 사진 서명 URL 로드
  const paths = t.photos.filter(Boolean);
  db.signedUrls(paths).then(map => {
    photoUrls = t.photos.map(p => (p && map[p]) || null);
    if (revealed) applyFinal(TUT_HOLES); // 이미 리빌된 상태라면 사진만 반영
  }).catch(() => {});
}
