// 픽셀 스프라이트 · 콘솔 테마 정의 (디자인 캔버스에서 이식)
export const SPR = {
  buddy: ["...pppppp...", "..pwwwwwwp..", ".pwvvvvvvwp.", ".pwvkkkkvwp.", ".pwvkwwkvwp.", ".pwvkkkkvwp.", ".pwvvvvvvwp.", "..pwvvvvwp..", "...pwwwwp...", "...d.pp.d...", "..dd.pp.dd..", "...d....d..."],
  buddyHappy: ["...pppppp...", "..pwwwwwwp..", ".pwvvvvvvwp.", ".pwvkkkkvwp.", ".pwvwkkwvwp.", ".pwvkwwkvwp.", ".pwvvvvvvwp.", "..pwvvvvwp..", "...pwwwwp...", "...p.pp.p...", "..pp.pp.pp..", "...p....p..."],
  buddySad: ["...pppppp...", "..pwwwwwwp..", ".pwvvvvvvwp.", ".pwvkkkkvwp.", ".pwvkwwkvwp.", ".pwvkkkkvwp.", ".pwvvoovvwp.", "..pwvvvvwp..", "...pwwwwp...", "...d.dd.d...", "..dd.dd.dd..", "...d....d..."],
  planet: ["......pppp......", "....pp....pp....", "...p..vvvv..p...", "..p..vvvvvv..p..", ".p..vvkkvvvv..p.", ".p.vvvvvvvvvv.p.", "kkvvvvvvvvvvvvkk", ".pvvvvkkkkvvvvp.", ".pvvvvvvvvvvvvp.", "..pvvvvvvvvvvp..", "...pvvvvvvvvp...", "....pvvvvvvp....", ".....pppppp....."],
  moon: ["....pppp....", "..pp....pp..", ".p..wwww..p.", "p..wwwwww..p", "p.wwdwwwww.p", "p.wwwwwdww.p", "p.wwdwwwww.p", "p..wwwwww..p", ".p..wwww..p.", "..pp....pp..", "....pppp...."],
  stars: [".p....v...p.....", "....p...v....p..", "..v...p....v...p", ".....v...p...v..", "p...v....p....v."],
  porthole: ["....kkkkkkkk....", "..kkvvvvvvvvkk..", ".kvv........vvk.", "kvv..p.......vvk", "kv......v.....vk", "kv...ppp......vk", "kv..ppppp..v..vk", "kv..ppppp.....vk", "kv...ppp....v.vk", "kv......v.....vk", "kvv...p......vvk", ".kvv........vvk.", "..kkvvvvvvvvkk..", "....kkkkkkkk...."],
  disk: [".pppppppppp.", "p..vvvvvv..p", "p.vvwwwwvv.p", "p.vvwkkwvv.p", "p.vvwwwwvv.p", "p..vvvvvv..p", "p..........p", "p.pppppppp.p", "p.p......p.p", "p.pppppppp.p", "p..........p", ".pppppppppp."],
  orbit: ["......pppp......", "....pp....pp....", "...p........p...", "..p...vvvv...p..", ".p...vvvvvv...p.", "p...vvvvvvvv...p", "p...vvvvvvvv...p", ".p...vvvvvv...p.", "..p...vvvv...p..", "...p........p...", "....pp....pp....", "......pppp......"],
  probe: ["..p........p..", "..pvv....vvp..", "..pvv....vvp..", "...pv.ww.vp...", "....pwwwwp....", "....pwkkwp....", "....pwwwwp....", ".....pppp.....", "......pp......", ".....p..p....."],
  cat: ["..p......p..", ".pvp....pvp.", ".pvvp..pvvp.", "pvvvvvvvvvvp", "pvwwvvvvwwvp", "pvwkwvvwkwvp", "pvvvvoovvvvp", "pvvvwwwwvvvp", ".pvvvvvvvvp.", "..pvvvvvvp..", "...p.pp.p...", "..pp....pp.."],
  robot: ["..pppppppp..", ".pwwwwwwwwp.", "pwvkkvvkkvwp", "pwvkkvvkkvwp", "pwvvvvvvvvwp", "pwvvoooovvwp", "pwvvvvvvvvwp", ".pwwwwwwwwp.", "..p.pppp.p..", "..p.pvvp.p..", ".pp..pp..pp.", "p.........p"],
  alien: ["....pppp....", "..pvvvvvvp..", ".pvvvvvvvvp.", "pvvwwvvwwvvp", "pvwkkwwkkwvp", "pvvwwvvwwvvp", "pvvvvoovvvvp", ".pvvvvvvvvp.", "..pvvvvvvp..", "...pv..vp...", "..pv....vp..", ".p........p."],
  ghost: ["...pppppp...", "..pwwwwwwp..", ".pwwvvvvwwp.", "pwwvkkkkvwwp", "pwwvkwwkvwwp", "pwwvkkkkvwwp", "pwwvvoovvwwp", "pwwwvvvvwwwp", "pwwwwwwwwwwp", "pwwwwwwwwwwp", "p.pw.pw.pw.p", ".p.p..p..p.p"],
};

// 콘솔 테마 — 언락 조건 포함
export const THEMES = [
  {
    name: 'PHOSPHOR', meta: '기본 콘솔 · 단색 포스퍼', char: 'buddy',
    bg: '#050503', ink: '#EFFF9E', dim: '#BDCB84', bright: '#FBFFDF', alert: '#FF6E9C',
    pal: { p: '#EFFF9E', d: '#8E9A63', v: '#A594F9', k: '#6F5FC9', w: '#FBFFDF', o: '#FF6E9C' },
    mix: ['#EFFF9E', '#BDCB84', '#FBFFDF', '#A594F9'],
    unlock: { type: 'free' },
  },
  {
    name: 'DEEP ORBIT', meta: '스트릭 보상 · 캐릭터 ALIEN', char: 'alien',
    bg: '#07070E', ink: '#A594F9', dim: '#8B84C9', bright: '#EAE4FF', alert: '#FF8AD8',
    pal: { p: '#7ADFF2', d: '#4C6FC4', v: '#A594F9', k: '#4A3C9E', w: '#EAE4FF', o: '#FF8AD8' },
    mix: ['#A594F9', '#7ADFF2', '#FF8AD8', '#4C6FC4', '#EAE4FF'],
    unlock: { type: 'streak', days: 30, tag: '30D 한정' },
  },
  {
    name: 'AMBER DRIFT', meta: '상점 컬렉션 · 캐릭터 CAT', char: 'cat',
    bg: '#120A07', ink: '#FFB86B', dim: '#C79A74', bright: '#FFE9A8', alert: '#7ADFF2',
    pal: { p: '#FFB86B', d: '#A5643C', v: '#FF8E62', k: '#8E3F2E', w: '#FFE9A8', o: '#7ADFF2' },
    mix: ['#FFB86B', '#FF8E62', '#FFE9A8', '#A5643C', '#7ADFF2'],
    unlock: { type: 'paid', price: '₩3,900', tag: '₩3,900' },
  },
  {
    name: 'AURORA GLASS', meta: '상점 컬렉션 · 캐릭터 GHOST', char: 'ghost',
    bg: '#04100E', ink: '#8CF2C4', dim: '#6BB89F', bright: '#EAFFF7', alert: '#FFB0D8',
    pal: { p: '#8CF2C4', d: '#3E8C77', v: '#6FA8FF', k: '#3B5FA8', w: '#EAFFF7', o: '#FFB0D8' },
    mix: ['#8CF2C4', '#6FA8FF', '#FFB0D8', '#EAFFF7', '#3E8C77'],
    unlock: { type: 'paid', price: '₩3,900', tag: '₩3,900' },
  },
  {
    name: 'CRT MAGENTA', meta: '마일스톤 보상 · 캐릭터 ROBOT', char: 'robot',
    bg: '#0C0410', ink: '#FF8AD8', dim: '#C489BC', bright: '#FFEAF7', alert: '#FFD36E',
    pal: { p: '#FF8AD8', d: '#8E4183', v: '#C08CFF', k: '#5E2C86', w: '#FFEAF7', o: '#FFD36E' },
    mix: ['#FF8AD8', '#C08CFF', '#FFD36E', '#8E4183', '#FFEAF7'],
    unlock: { type: 'streak', days: 100, tag: '100D 한정' },
  },
];

// 스프라이트 → HTML (그리드 div)
export function spriteHTML(name, widthPx, pal) {
  const map = SPR[name] || SPR.buddy;
  const cols = map[0].length;
  const P = pal || THEMES[0].pal;
  let cells = '';
  for (const row of map) for (const ch of row) {
    const c = P[ch];
    cells += c
      ? `<i style="aspect-ratio:1;background:${c};box-shadow:0 0 3px ${c}55"></i>`
      : `<i style="aspect-ratio:1"></i>`;
  }
  return `<div class="spr" style="width:${widthPx}px;grid-template-columns:repeat(${cols},1fr)">${cells}</div>`;
}

// 테마 언락 여부
export function themeUnlocked(ti, profile) {
  const t = THEMES[ti];
  if (!t) return false;
  if (t.unlock.type === 'free') return true;
  if (t.unlock.type === 'streak') return (profile?.longest_streak || 0) >= t.unlock.days;
  if (t.unlock.type === 'paid') return !!profile?.settings?.paidThemes?.includes(t.name);
  return false;
}
