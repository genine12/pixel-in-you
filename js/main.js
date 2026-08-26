// 앱 진입점 — 라우팅 · 인증 상태 · 서비스워커 등록
import { sb } from './db.js';
import { S, loadAll, levelDone } from './store.js';
import { applyTheme, renderScreen, statusBar, toast } from './ui.js';
import { bootScreen, onboardingScreen } from './screens/auth.js';
import { dashboardScreen, cellfillScreen, starmapScreen } from './screens/play.js';
import { archiveScreen, archiveViewScreen, shopScreen, settingsScreen } from './screens/meta.js';
import { revealScreen, promoScreen } from './screens/story.js';

const SCREENS = {
  boot: bootScreen,
  onboarding: onboardingScreen,
  dashboard: dashboardScreen,
  cellfill: cellfillScreen,
  starmap: starmapScreen,
  archive: archiveScreen,
  archiveView: archiveViewScreen,
  shop: shopScreen,
  settings: settingsScreen,
  reveal: revealScreen,
  promo: promoScreen,
};

S.nav = (screen, params = {}) => {
  S.screen = screen;
  S.params = params;
  applyTheme();
  (SCREENS[screen] || dashboardScreen)(params);
  window.scrollTo(0, 0);
};

function loadingScreen(msg) {
  renderScreen(`${statusBar('NO CARRIER · ▯▯▯▯')}
    <div class="grow" style="display:flex;align-items:center;justify-content:center">
      <div class="center mono12 dim flicker">${msg}<span class="blink">█</span></div>
    </div>`);
}

async function enter() {
  loadingScreen('ESTABLISHING LINK');
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    const root = renderScreen(`${statusBar('LINK FAILED')}
      <div class="grow" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 26px">
        <div class="h1 center" style="font-size:22px">LINK\nFAILED</div>
        <div class="center mono11 dim mt12" style="line-height:1.8">데이터베이스 연결에 실패했습니다.<br>Supabase 스키마(supabase/schema.sql)가 적용되었는지 확인하세요.<br><span class="alert">${(e && e.message) || e}</span></div>
        <button class="btn mt20" id="retry" style="width:auto;padding:12px 30px">RETRY ▸</button>
        <button class="link-btn mt12" id="signout">⏻ SIGN OUT · 접속 화면으로</button>
      </div>`);
    root.querySelector('#retry').addEventListener('click', enter);
    root.querySelector('#signout').addEventListener('click', () => sb.auth.signOut());
    return;
  }
  applyTheme();
  if (!S.profile.onboarded) S.nav('onboarding');
  else if (levelDone()) S.nav('reveal'); // 마지막 셀을 채우고 종료했던 경우 리빌 재진입
  else S.nav('dashboard');
}

async function init() {
  // 서비스워커 등록 (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const { data: { session } } = await sb.auth.getSession();
  S.session = session;

  sb.auth.onAuthStateChange((event, sess) => {
    const had = !!S.session;
    S.session = sess;
    if (event === 'SIGNED_IN' && !had) enter();
    if (event === 'SIGNED_OUT') { S.profile = null; S.cells = []; S.nav('boot'); }
  });

  if (session) enter();
  else S.nav('boot');
}

init();
