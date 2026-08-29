// 리빌 · 스테이지 승급 · 엔딩 시퀀스
import { S, uid, theme, levelDone, levelCycles, reloadLevel } from '../store.js';
import * as db from '../db.js';
import { renderScreen, statusBar, titleBar, drawPromo, toast } from '../ui.js';
import { spriteHTML } from '../sprites.js';
import { gridOf, levelsOf, seedOf, targetHSL, STAGE_BONUS, h, lum } from '../game.js';
import { sfx } from '../audio.js';

const pad2 = v => String(v).padStart(2, '0');
const SEAL_FILTER = 'grayscale(1) sepia(.62) hue-rotate(14deg) brightness(.72) contrast(.95)';

// ── 사진 로더: 레벨의 모든 셀 이미지를 로드 ────────────────
export async function loadLevelImages(cells) {
  const paths = cells.filter(c => c.photo_path).map(c => c.photo_path);
  const urls = await db.signedUrls(paths);
  const imgs = await Promise.all(cells.map(c => new Promise(res => {
    const url = c.photo_path && urls[c.photo_path];
    if (!url) return res({ cell: c, img: null });
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res({ cell: c, img });
    img.onerror = () => res({ cell: c, img: null });
    img.src = url;
  })));
  return imgs;
}

// ── 모자이크 캔버스 드로잉 ────────────────────────────────
// mode: 'sealed' | 'color', sweepY: 0~1 (해당 y 비율까지 원색)
// tint: 0~1 — 사진 위에 목표 색을 덮는 비율 (1=순수 그림, 0=사진 그대로)
export function drawMosaic(cv, n, seed, imgs, mode, sweepY = null, tint = 0.7) {
  const g = cv.getContext('2d');
  const px = cv.width / n;
  g.fillStyle = theme().bg;
  g.fillRect(0, 0, cv.width, cv.height);
  for (const { cell, img } of imgs) {
    const { x, y } = cell;
    const colored = mode !== 'sealed' && (sweepY === null || y / n <= sweepY);
    const c = targetHSL(x, y, n, seed);
    const targetCss = `hsl(${c.h.toFixed(0)} ${c.s.toFixed(0)}% ${c.l.toFixed(0)}%)`;
    g.save();
    if (!colored) g.filter = SEAL_FILTER;
    if (img) {
      g.drawImage(img, x * px, y * px, Math.ceil(px), Math.ceil(px));
      if (colored && tint > 0) {
        // 목표 색 틴트 오버레이 — 멀리서는 그림, 가까이서는 사진 (포토모자이크)
        g.globalAlpha = tint;
        g.fillStyle = targetCss;
        g.fillRect(x * px, y * px, Math.ceil(px), Math.ceil(px));
        g.globalAlpha = 1;
      }
    } else {
      g.fillStyle = targetCss;
      g.fillRect(x * px, y * px, Math.ceil(px), Math.ceil(px));
    }
    g.restore();
  }
}

// ── 리빌 ─────────────────────────────────────────────────
export function revealScreen() {
  if (!levelDone()) { S.nav('dashboard'); return; }
  const p = S.profile;
  const n = gridOf(p.stage);
  const seed = seedOf(p.stage, p.level);
  const cycles = levelCycles();
  const rejects = p.settings?.rejects || 0;

  let imgs = null;
  let revealed = false;
  let animating = false;

  const draw = () => {
    if (S.screen !== 'reveal') return; // 다른 화면으로 이동한 뒤의 늦은 draw 방지
    const root = renderScreen(`
      ${statusBar('ORBIT · ▮▮▮▮ · 61%')}
      ${titleBar(revealed ? 'SIGNAL RESTORED' : 'REVEAL SEQUENCE', `STAGE ${pad2(p.stage + 1)} · LVL ${pad2(p.level + 1)}`)}
      <div style="position:absolute;top:82px;right:22px;z-index:5">${spriteHTML('planet', 66, theme().pal)}</div>
      <div style="padding:20px 20px 0">
        <div class="h1" style="font-size:30px">${revealed ? `LEVEL ${pad2(p.level + 1)}\nRESTORED` : `100%\nFRAGMENTS IN`}</div>
        <div class="mono11 dim" style="margin-top:8px">${revealed ? `${n * n}개의 당신의 사진이 하나의 이미지가 되었다. 지구가 보낸 신호, 원색 해제 완료.` : '복원이 끝났다. 필터를 걷어낼 준비가 되었다.'}</div>
      </div>
      <div class="mosaic-wrap mt16" style="margin-left:20px;margin-right:20px">
        <canvas id="mosaic" class="gridcv" width="${Math.min(1024, n * 32)}" height="${Math.min(1024, n * 32)}"></canvas>
        <div id="sweep" style="display:none" class="sweep-once"></div>
      </div>
      <div class="mono11 dim mt14" style="margin-left:20px;margin-right:20px;line-height:1.75">
        <div>FRAGMENTS &nbsp;&nbsp;${n * n} / ${n * n}</div>
        <div>SPAN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${cycles} CYCLES</div>
        <div>REJECTED &nbsp;&nbsp;${rejects} SPECIMENS</div>
        <div style="color:var(--ink);margin-top:6px">${revealed ? '▸ COLOR LOCK RELEASED' : '▸ DUOTONE SEAL ACTIVE'}</div>
      </div>
      <div class="grow"></div>
      <button class="btn" id="go" style="margin:0 20px 10px;width:auto" ${imgs ? '' : 'disabled'}>${imgs ? (revealed ? nextLabel(p) : 'RELEASE COLOR LOCK ▸') : 'LOADING FRAGMENTS ▚'}</button>
      <div class="center mono11 dim" style="letter-spacing:.14em;margin-bottom:22px">${revealed ? 'ARCHIVED TO RESTORATION LOG' : '이 연출은 레벨당 단 한 번'}</div>
    `);

    const cv = root.querySelector('#mosaic');
    if (imgs) drawMosaic(cv, n, seed, imgs, revealed ? 'color' : 'sealed');

    root.querySelector('#go').addEventListener('click', async () => {
      if (!imgs || animating) return;
      if (!revealed) {
        // 리빌 애니메이션: 빛이 위→아래로 훑고 지나가며 원색 전환
        animating = true;
        sfx.play('reveal');
        root.querySelector('#sweep').style.display = 'block';
        const dur = 2400, t0 = performance.now();
        const tick = now => {
          const k = Math.min(1, (now - t0) / dur);
          drawMosaic(cv, n, seed, imgs, 'color', k * 1.15);
          if (k < 1) requestAnimationFrame(tick);
          else { revealed = true; animating = false; draw(); }
        };
        requestAnimationFrame(tick);
      } else {
        await advance();
      }
    });
  };

  const advance = async () => {
    await db.insertCompletion(uid(), p.stage, p.level, cycles);
    S.completions = await db.fetchCompletions(uid());
    const settings = { ...(p.settings || {}), rejects: 0 };

    if (p.stage === 3) {
      // 엔드게임: 무한 반복 (엔딩 시퀀스는 추후 별도 컨셉으로 재구현 예정)
      S.profile = await db.updateProfile(uid(), { level: p.level + 1, assignment: null, settings });
      await reloadLevel();
      toast('새로운 신호가 잡혔다 — 반복 복원 계속');
      S.nav('dashboard');
    } else if (p.level + 1 < levelsOf(p.stage)) {
      S.profile = await db.updateProfile(uid(), { level: p.level + 1, assignment: null, settings });
      await reloadLevel();
      toast(`LEVEL ${pad2(p.level + 2)} 시작 — 새로운 미스터리 신호`);
      // 8x8 레벨 리빌 직후엔 다음 스테이지 티저로 견인 (PRD 2.2)
      if (gridOf(p.stage) === 8) S.nav('teaser', { to: p.stage + 1 });
      else S.nav('dashboard');
    } else {
      // 스테이지 승급
      S.profile = await db.updateProfile(uid(), {
        stage: p.stage + 1, level: 0, assignment: null, settings,
        ink: (p.ink || 0) + STAGE_BONUS,
      });
      await reloadLevel();
      S.nav('promo', { from: p.stage, to: p.stage + 1 });
    }
  };

  draw();
  loadLevelImages(S.cells).then(loaded => { imgs = loaded; draw(); })
    .catch(e => toast('사진 로드 실패: ' + (e.message || e), 4000));
}

function nextLabel(p) {
  if (p.stage === 3) return 'NEXT SIGNAL ▸';
  if (p.level + 1 < levelsOf(p.stage)) return `NEXT LEVEL · ${pad2(p.level + 2)} / ${pad2(levelsOf(p.stage))} ▸`;
  return 'STAGE CLEARED ▸';
}

// ── 다음 스테이지 티저 (PRD 2.2 · 디자인 2c) ───────────────
// 8x8 레벨 리빌 직후 노출 — 다음 스테이지(16x16)의 실루엣만 보여주고 호기심 견인
export function teaserScreen({ to = 1 } = {}) {
  const n = gridOf(to);
  const seed = seedOf(to, 0);
  const est = EST_SPAN[to] || EST_SPAN[3];

  // 글리치 실루엣 셀 — 보라 계열 노이즈, 원본 유추 불가 수준
  let glitch = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = lumOf(x, y, n, seed);
    const jitter = jhash((x * 3) | 0, (y * 7) | 0, 17);
    const band = (y % 3 === 0) ? .35 : 1;
    const bg = jitter > .5
      ? `rgba(165,148,249,${(.14 + .5 * l * band).toFixed(2)})`
      : `rgb(var(--ink-rgb)/${(.05 + .3 * l * band).toFixed(2)})`;
    glitch += `<i style="background:${bg};${jitter > .94 ? 'transform:translateX(28%)' : ''}"></i>`;
  }

  const root = renderScreen(`
    ${statusBar('SCAN · ▮▮▮▯ · 61%')}
    ${titleBar('INBOUND SIGNAL', `STAGE ${pad2(to + 1)} · ${n}×${n}`)}
    <div style="padding:22px 22px 0">
      <div class="kicker" style="color:#A594F9">DETECTED · ${n * n} FRAGMENTS</div>
      <div class="h1 mt12" style="font-size:29px;text-shadow:0 0 8px rgba(165,148,249,.6),0 0 30px rgba(165,148,249,.3)">더 복잡한 신호가\n감지되었다</div>
    </div>
    <div class="mx16 mt20 teaser-wrap">
      <div style="display:grid;grid-template-columns:repeat(${n},1fr);gap:1px;filter:blur(1.6px) contrast(1.15)">${glitch}</div>
      <div class="bands"></div>
      <div class="overlay-label">SILHOUETTE ONLY</div>
    </div>
    <div class="mx16 mt16 mono12" style="line-height:1.9">해상도가 네 배로 촘촘해졌다. 이 형체가 무엇인지 알아보려면, ${n * n}칸을 전부 채워야 한다.</div>
    <div class="mx16 mt14 panel pad mono11 dim" style="line-height:1.85">
      <div style="color:var(--ink);letter-spacing:.14em;font-weight:500">SCAN REPORT</div>
      <div>GRID &nbsp;&nbsp;&nbsp;&nbsp;${n}×${n} · ${n * n} CELLS</div>
      <div>PALETTE &nbsp;${n * n > 200 ? '168' : '96'} HEX · 봉인됨</div>
      <div>EST. SPAN &nbsp;${est[0]}일 (최대 페이스) / ${est[1]}일 (라이트)</div>
      <div>PREVIEW &nbsp;노이즈 92% · 원본 유추 불가</div>
    </div>
    <div class="grow"></div>
    <button class="btn mx16" id="go" style="margin-bottom:9px;width:auto;border-color:#A594F9;box-shadow:0 0 24px rgba(165,148,249,.34)">남은 신호 복원 계속하기 ▸</button>
    <button class="link-btn" id="dash" style="margin-bottom:26px;text-decoration:underline">대시보드로 돌아가기</button>
  `);
  root.querySelector('#go').addEventListener('click', () => S.nav('cellfill'));
  root.querySelector('#dash').addEventListener('click', () => S.nav('dashboard'));
}

// 스테이지별 예상 소요일 [최대 페이스(30칸), 라이트(5칸)] — PRD 2.2
const EST_SPAN = [[3, 13], [9, 52], [35, 205], [137, 820]];
const jhash = h, lumOf = lum;

// ── 스테이지 승급 ─────────────────────────────────────────
export function promoScreen({ from = 0, to = 1 } = {}) {
  const oldN = gridOf(from), newN = gridOf(to);
  const est = (EST_SPAN[to] || EST_SPAN[3]).join(' / ');
  const root = renderScreen(`
    ${statusBar('ORBIT · ▮▮▮▮ · 60%')}
    ${titleBar('STAGE CLEARED', `STAGE ${pad2(from + 1)} → ${pad2(to + 1)}`)}
    <div style="position:absolute;top:88px;right:24px;z-index:5">${spriteHTML('probe', 66, theme().pal)}</div>
    <div style="padding:26px 26px 0">
      <div class="kicker" style="max-width:250px;letter-spacing:.3em;line-height:1.6">PROMOTION · ${levelsOf(from)} / ${levelsOf(from)} LEVELS RESTORED</div>
      <div class="h1 mt12" style="font-size:33px">STAGE ${pad2(to + 1)}<br>UNLOCKED</div>
      <div class="mono12 mt12" style="color:var(--ink)">신호가 네 배로 촘촘해졌다. 더 오래 걸리지만, 그만큼 지구에 가까워졌다는 뜻이다.</div>
    </div>
    <div class="mx26 mt20 row" style="align-items:center;gap:14px">
      <div style="flex:none;text-align:center">
        <canvas id="old" class="gridcv" width="208" height="208" style="width:104px;height:104px;border:1px solid var(--line)"></canvas>
        <div class="mono11 dim" style="margin-top:6px">${oldN}×${oldN} · ${oldN * oldN}</div>
      </div>
      <div class="grow center" style="font:400 16px var(--mono);color:var(--ink);text-shadow:0 0 12px rgb(var(--ink-rgb)/.7)">▸▸</div>
      <div style="flex:none;text-align:center">
        <canvas id="new" class="gridcv" width="264" height="264" style="width:132px;height:132px;border:1px solid rgb(var(--ink-rgb)/.56);box-shadow:0 0 22px rgb(var(--ink-rgb)/.24)"></canvas>
        <div class="mono11" style="margin-top:6px;color:var(--ink)">${newN}×${newN} · ${newN * newN}</div>
      </div>
    </div>
    <div class="mx26 mt20 panel" style="padding:12px;font:400 11.5px/1.75 var(--mono);color:var(--dim)">
      <div style="color:var(--ink);letter-spacing:.14em;font-weight:500">GRANTED</div>
      <div>◈ INK &nbsp;&nbsp;+${STAGE_BONUS} &nbsp;STAGE CLEAR BONUS</div>
      <div>◈ LEVELS &nbsp;&nbsp;${levelsOf(to)} IN THIS STAGE</div>
      <div>◈ EST. SPAN &nbsp;${est} CYCLES / LEVEL (MAX / LIGHT)</div>
    </div>
    <div class="grow"></div>
    <button class="btn mx26" id="enter" style="margin-bottom:12px;width:auto">ENTER STAGE ${pad2(to + 1)} ▸</button>
    <div class="center mono11 dim" style="letter-spacing:.14em;margin-bottom:30px">진행률과 스트릭은 그대로 유지됩니다</div>
  `);
  drawPromo(root.querySelector('#old'), oldN, seedOf(from, levelsOf(from) - 1), false);
  drawPromo(root.querySelector('#new'), newN, seedOf(to, 0), true);
  root.querySelector('#enter').addEventListener('click', () => S.nav('dashboard'));
}

// (엔딩 시퀀스는 제거됨 — 추후 다른 컨셉으로 재구현 예정.
//  엔딩 카피는 supabase/ending-content.sql 로 분리 보관, 저장소에는 커밋되지 않음)
