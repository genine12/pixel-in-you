// 리빌 · 스테이지 승급 · 엔딩 시퀀스
import { S, uid, theme, levelDone, levelCycles, reloadLevel } from '../store.js';
import * as db from '../db.js';
import { renderScreen, statusBar, titleBar, drawPromo, toast } from '../ui.js';
import { spriteHTML } from '../sprites.js';
import { gridOf, levelsOf, seedOf, targetHSL, STAGE_BONUS } from '../game.js';

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
export function drawMosaic(cv, n, seed, imgs, mode, sweepY = null) {
  const g = cv.getContext('2d');
  const px = cv.width / n;
  g.fillStyle = theme().bg;
  g.fillRect(0, 0, cv.width, cv.height);
  for (const { cell, img } of imgs) {
    const { x, y } = cell;
    const colored = mode !== 'sealed' && (sweepY === null || y / n <= sweepY);
    g.save();
    if (!colored) g.filter = SEAL_FILTER;
    if (img) {
      g.drawImage(img, x * px, y * px, Math.ceil(px), Math.ceil(px));
    } else {
      const c = targetHSL(x, y, n, seed);
      g.fillStyle = `hsl(${c.h.toFixed(0)} ${c.s.toFixed(0)}% ${c.l.toFixed(0)}%)`;
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
      S.nav('dashboard');
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

// ── 스테이지 승급 ─────────────────────────────────────────
export function promoScreen({ from = 0, to = 1 } = {}) {
  const oldN = gridOf(from), newN = gridOf(to);
  const est = [13, 51, 205, 820][to] || 820;
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
      <div>◈ EST. SPAN &nbsp;${est} CYCLES / LEVEL</div>
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
