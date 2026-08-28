// 부트(접속) 화면 + 온보딩
import { sb, updateProfile, enterGuestMode } from '../db.js';
import { S, uid, markStorySeen } from '../store.js';
import { renderScreen, statusBar, toast, esc } from '../ui.js';
import { spriteHTML } from '../sprites.js';
import { h, lum } from '../game.js';

// 티저 노이즈 그리드 (16x6)
function teaserHTML() {
  let cells = '';
  for (let y = 0; y < 6; y++) for (let x = 0; x < 16; x++) {
    const on = h(x, y, 2) > .42;
    const a = on ? .14 + .72 * lum(x, y, 16) * h(x, y, 9) : .05;
    cells += `<i style="background:rgb(var(--ink-rgb)/${a.toFixed(2)})"></i>`;
  }
  return `<div class="obgrid" style="width:100%;grid-template-columns:repeat(16,1fr);gap:1px;filter:blur(.4px)">${cells}</div>`;
}

// ── 부트 / 접속 ──────────────────────────────────────────
export function bootScreen() {
  let mode = 'login'; // login | signup

  const draw = () => {
    const root = renderScreen(`
      ${statusBar('NO CARRIER · ▯▯▯▯ · 62%')}
      <div style="padding:0 26px" class="kicker" >&gt; UNIDENTIFIED SIGNAL // 71.4% CORRUPTED</div>
      <div style="position:absolute;top:86px;right:24px;z-index:5;display:flex;flex-direction:column;align-items:flex-end;gap:12px">
        ${spriteHTML('moon', 58)}
        <div style="opacity:.85">${spriteHTML('stars', 96)}</div>
      </div>
      <div class="mx26 mt20">
        <div class="h1" style="font-size:46px;line-height:.92;max-width:220px">PIXEL<br>IN YOU</div>
        <div class="kicker mt8">SIGNAL RESTORATION UNIT</div>
      </div>
      <div class="mx26 mt14 mono12" style="padding:10px 0;border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft);opacity:.84">
        한 장의 미확인 이미지가 궤도 위에서 조각으로 흩어졌다. 매일 당신의 사진을 좌표에 맞춰 송신하면 신호는 조금씩 복원된다.
      </div>
      <div class="mx26 mt12">${teaserHTML()}</div>
      <div class="grow"></div>
      <form id="authform" class="mx26 panel" style="padding:12px 14px;box-shadow:0 0 18px rgb(var(--ink-rgb)/.1)">
        <div class="label" style="margin-bottom:9px">OPERATOR ${mode === 'login' ? 'ACCESS' : 'REGISTER'}</div>
        <input class="input" id="email" type="email" placeholder="EMAIL" autocomplete="email" required>
        <div style="height:8px"></div>
        <input class="input" id="pw" type="password" placeholder="ACCESS CODE" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required>
        <div id="autherr" class="mono11 alert" style="display:none;margin-top:8px"></div>
        <button class="btn mt12" id="go" type="submit">${mode === 'login' ? 'ACCESS ▸' : 'CREATE OPERATOR ▸'}</button>
      </form>
      <button class="link-btn mx26 mt8" id="switch">${mode === 'login' ? '신규 오퍼레이터 등록 ▸' : '◂ 기존 오퍼레이터로 접속'}</button>
      <button class="mx26 mt8" id="guest" style="display:block;width:auto;border:1px dashed rgb(var(--ink-rgb)/.44);padding:11px;text-align:center;font:500 11.5px var(--mono);letter-spacing:.16em;color:var(--ink)">▸ 로그인 없이 시작해보기 — GUEST MODE</button>
      <div class="mx26 mono11 dim" style="margin-top:5px;font-size:9px;text-align:center">게스트 데이터는 이 기기에만 저장됩니다</div>
      <div class="mx26 mono11 dim mt8">
        <div>[✓] 4 STAGES · 8×8 → 64×64 GRID</div>
        <div>[✓] LIGHTNESS MATCH · 하루 30칸</div>
        <div>[✓] NO DEADLINE · 진행률 소멸 없음</div>
      </div>
      <div class="mx26 mono11 dim flicker" style="margin-top:10px;margin-bottom:30px">&gt; AWAITING HANDSHAKE<span class="blink">█</span></div>
    `);

    root.querySelector('#switch').addEventListener('click', () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); });
    root.querySelector('#guest').addEventListener('click', () => { enterGuestMode(); location.reload(); });
    root.querySelector('#authform').addEventListener('submit', async e => {
      e.preventDefault();
      const email = root.querySelector('#email').value.trim();
      const password = root.querySelector('#pw').value;
      const errEl = root.querySelector('#autherr');
      const btn = root.querySelector('#go');
      btn.disabled = true; btn.textContent = 'HANDSHAKE ▚';
      errEl.style.display = 'none';
      try {
        if (mode === 'login') {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          // 성공 시 main.js 의 onAuthStateChange 가 라우팅
        } else {
          const { data, error } = await sb.auth.signUp({ email, password });
          if (error) throw error;
          if (!data.session) {
            toast('확인 메일이 발송되었습니다. 메일 인증 후 접속하세요.', 5000);
            mode = 'login'; draw(); return;
          }
        }
      } catch (err) {
        errEl.textContent = '⚠ ' + koAuthError(err);
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = mode === 'login' ? 'ACCESS ▸' : 'CREATE OPERATOR ▸';
      }
    });
  };
  draw();
}

function koAuthError(err) {
  const m = err?.message || '';
  if (/invalid login credentials/i.test(m)) return '이메일 또는 접속 코드가 올바르지 않습니다';
  if (/already registered/i.test(m)) return '이미 등록된 이메일입니다';
  if (/at least 6/i.test(m)) return '접속 코드는 6자 이상이어야 합니다';
  if (/email not confirmed/i.test(m)) return '메일 인증이 필요합니다. 받은편지함을 확인하세요';
  if (/rate limit/i.test(m)) return '요청이 너무 잦습니다. 잠시 후 다시 시도하세요';
  return m || '접속에 실패했습니다';
}

// ── 온보딩 (4스텝) ───────────────────────────────────────
const OB_PAGES = [
  {
    kicker: 'DRIFT LOG · D+412', title: '당신은\n혼자 남았다', panel: 'HULL CAM · SECTOR 09 · SILENT',
    body: '모선은 사라졌고, 지구와의 통신은 412일 전에 끊겼다. 남은 것은 이 캡슐과, 아직 꺼지지 않은 수신기 하나뿐이다.',
    note: '수신기는 매일 스스로를 깨운다. 아직 무언가를 기다리고 있다는 뜻이다.',
    metaL: 'O2 STABLE', metaR: 'CARRIER · NONE', cta: 'CONTINUE ▸', spr: 'buddy',
  },
  {
    kicker: 'DEBRIS FIELD', title: '지구의 신호는\n조각나 흩어졌다', panel: 'SCATTER SCAN · 1,412 OBJECTS',
    body: '지구에서 보낸 마지막 송신은 궤도의 우주쓰레기 속에서 부서졌다. 파편 하나하나가 이미지의 한 픽셀이다.',
    note: '조각은 색으로만 식별된다. 좌표마다 필요한 색이 정해져 있다.',
    metaL: 'FRAGMENTS 0 / 64', metaR: 'SIGNAL 0%', cta: 'CONTINUE ▸', spr: 'disk',
  },
  {
    kicker: 'DAILY SALVAGE', title: '하루에 몇 조각씩\n회수한다', panel: 'RECOVERY GRID · LVL 01 · 8×8',
    body: '매일 배정된 좌표에 그 색을 가진 당신의 사진을 송신한다. 색이 맞으면 조각은 정착하고, 신호는 그만큼 복원된다.',
    note: '복원이 끝날 때까지 무엇이 오고 있는지는 알 수 없다. 그래서 계속 회수한다.',
    metaL: 'QUOTA 30 / CYCLE', metaR: 'LIGHTNESS ±15', cta: 'CONTINUE ▸', spr: 'probe',
  },
  {
    kicker: 'RETURN VECTOR', title: '복원된 신호는\n귀환 좌표가 된다', panel: 'PLOTTED COURSE · EARTH · 0.41 AU',
    body: '마지막 조각이 자리를 찾는 순간 필터가 걷히고, 신호는 원래의 색으로 돌아온다. 그 안에 집으로 가는 항로가 있다.',
    note: '4개의 스테이지. 조각은 전부 당신의 사진. 복원되는 것은 결국 당신이다.',
    metaL: 'HOPE · NON-ZERO', metaR: 'BEGIN', cta: 'BEGIN RESTORATION ▸', spr: 'planet',
  },
];

function obVisualHTML(page) {
  let cells = '', cols = 12;
  if (page === 0) { // 어두운 공간에 홀로 떠 있는 캡슐
    for (let i = 0; i < 120; i++) {
      if (i === 64) { cells += `<i style="background:var(--bright);box-shadow:0 0 14px rgb(var(--ink-rgb)/.95),0 0 34px rgb(var(--ink-rgb)/.5)"></i>`; continue; }
      const on = h(i, 7, 1) > .88;
      cells += `<i style="background:rgb(var(--ink-rgb)/${on ? '.5' : '.05'});${on ? 'box-shadow:0 0 7px rgb(var(--ink-rgb)/.6)' : ''}"></i>`;
    }
  } else if (page === 1) { // 흩어진 파편
    for (let i = 0; i < 120; i++) {
      const r = h(i, 3, 9);
      const a = r > .78 ? .42 + .3 * r : r > .6 ? .16 : .04;
      cells += `<i style="background:rgb(var(--ink-rgb)/${a.toFixed(2)});${r > .78 ? 'box-shadow:0 0 6px rgb(var(--ink-rgb)/.45)' : ''}"></i>`;
    }
  } else if (page === 2) { // 채워지는 그리드
    for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) {
      const f = h(x, y, 21) < .34;
      cells += f
        ? `<i style="background:rgb(var(--ink-rgb)/${(.2 + .5 * lum(x, y, 12)).toFixed(2)});box-shadow:0 0 5px rgb(var(--ink-rgb)/.4)"></i>`
        : `<i style="box-shadow:inset 0 0 0 .5px rgb(var(--ink-rgb)/.2)"></i>`;
    }
  } else { // 귀환 벡터 (유일하게 원색)
    for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) {
      const onPath = Math.abs((y / 9) - (x / 11)) < .09;
      cells += onPath
        ? `<i style="background:hsl(196 74% 62%);box-shadow:0 0 9px hsl(196 84% 62% / .8)"></i>`
        : `<i style="background:rgb(var(--ink-rgb)/${(.06 + .4 * lum(x, y, 12)).toFixed(2)})"></i>`;
    }
  }
  return `<div class="obgrid" style="grid-template-columns:repeat(${cols},1fr);${page < 2 ? 'filter:blur(.3px)' : ''}">${cells}</div>`;
}

export function onboardingScreen() {
  let ob = 0;

  const finish = async () => {
    // 스토리 완료 → 실전형 튜토리얼로 (onboarded 는 튜토리얼 리빌에서 설정)
    await markStorySeen();
    S.nav('tutorial');
  };

  const draw = () => {
    const p = OB_PAGES[ob];
    const dots = [0, 1, 2, 3].map(i =>
      `<i class="${i <= ob ? 'on' : ''}${i === ob ? ' cur' : ''}"></i>`).join('');
    const root = renderScreen(`
      ${statusBar('NO CARRIER · ▯▯▯▯ · 62%')}
      <div class="row mx26" style="justify-content:space-between;align-items:center;padding-top:6px">
        <div class="obdots">${dots}</div>
        <button class="kicker" id="skip" style="letter-spacing:.18em">SKIP ▸</button>
      </div>
      <div class="mx26 mt20">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:14px">
          <div class="kicker" style="padding-top:4px">${p.kicker}</div>
          ${spriteHTML(p.spr, 52)}
        </div>
        <div class="h1 mt12">${p.title}</div>
      </div>
      <div class="mx26 mt20 panel grow" style="min-height:220px;position:relative;overflow:hidden;box-shadow:0 0 26px rgb(var(--ink-rgb)/.12)">
        <div class="panel-head" style="position:absolute;top:0;left:0;right:0;z-index:3;border-bottom:1px solid var(--line-soft)">${p.panel}</div>
        <div style="position:absolute;inset:26px 0 22px;display:flex;align-items:center;justify-content:center">${obVisualHTML(ob)}</div>
        <div class="mono11 dim" style="position:absolute;left:9px;bottom:8px;right:9px;display:flex;justify-content:space-between"><span>${p.metaL}</span><span style="color:var(--ink)">${p.metaR}</span></div>
      </div>
      <div class="mx26 mt20 mono11" style="line-height:1.95;color:var(--ink)">${p.body}</div>
      <div class="mx26 mt12 mono11 dim" style="padding-left:11px;border-left:1px solid var(--line-strong);line-height:1.75">${p.note}</div>
      <button class="btn mx26 mt12" id="next" style="margin-bottom:12px;width:auto">${p.cta}</button>
      <div class="center mono11 dim" style="letter-spacing:.16em;margin-bottom:30px">0${ob + 1} / 04${ob === 3 ? ' · 온보딩 완료' : ''}</div>
    `);
    root.querySelector('#skip').addEventListener('click', finish);
    root.querySelector('#next').addEventListener('click', () => {
      if (ob === 3) finish(); else { ob++; draw(); }
    });
  };
  draw();
}
