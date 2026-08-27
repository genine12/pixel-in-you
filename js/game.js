// 게임 규칙 · 프로시저럴 타깃 이미지 · 색상 유틸
export const STAGES = [
  { grid: 8,  levels: 3 },   // 스테이지 1
  { grid: 16, levels: 2 },   // 스테이지 2
  { grid: 32, levels: 1 },   // 스테이지 3
  { grid: 64, levels: 1 },   // 스테이지 4 (엔드게임, 클리어 후 반복)
];
export const QUOTA_BASE = 5;      // 하루 기본 제출 한도
export const INK_PER_CELL = 40;   // 셀 정착 시 잉크
export const STAGE_BONUS = 600;   // 스테이지 클리어 보너스
export const L_TOLERANCE = 15;    // 명도 허용 오차 (HSL L, 0~100) — 통과 판정의 유일한 게이트

// ── 소프트 색상 보너스 (통과에는 영향 없음, 잉크 보너스만) ──────
export const COLOR_SYNC_MIN_SAT = 22;   // 사진·목표 둘 다 이 채도 이상일 때만 색조 근접도 계산
export const COLOR_SYNC_BONUS_AT = 68;  // 이 % 이상이면 PERFECT SYNC
export const COLOR_BONUS_INK = 20;      // PERFECT SYNC 시 추가 잉크

// 사진 대표색(a)과 목표색(b)의 색상 근접도 0~100. 채도가 부족하면 null (색조가 불안정하므로 판정 제외)
export function colorMatch(a, b) {
  if (!a || !b || a.s < COLOR_SYNC_MIN_SAT || b.s < COLOR_SYNC_MIN_SAT) return null;
  let dh = Math.abs(a.h - b.h) % 360;
  if (dh > 180) dh = 360 - dh;
  const hueSim = Math.max(0, 1 - dh / 90);              // 색조 0°→1.0, 90°+→0
  const satSim = 1 - Math.min(Math.abs(a.s - b.s) / 60, 1);
  return Math.round(100 * (0.82 * hueSim + 0.18 * satSim));
}

export const gridOf = stage => (STAGES[stage] || STAGES[3]).grid;
export const levelsOf = stage => (STAGES[stage] || STAGES[3]).levels;
export const seedOf = (stage, level) => (stage + 1) * 37 + (level + 1) * 101;

// ── 디자인 캔버스의 프로시저럴 "숨은 사진" 필드 ──────────────
export function h(x, y, s) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + s) * 43758.5453;
  return n - Math.floor(n);
}

export function lum(x, y, n, seed = 3) {
  const ox = (h(seed, 1, 7) - .5) * .36, oy = (h(seed, 2, 9) - .5) * .36;
  const cx = (x / (n - 1) - .5 + ox), cy = (y / (n - 1) - .5 + oy);
  const r = Math.sqrt(cx * cx * 1.4 + cy * cy);
  let v = .72 - r * 1.15 + .16 * Math.sin(cx * 9 + cy * 4 + seed) + .1 * Math.cos(cy * 13 + seed * .7);
  v += .06 * (h(x, y, seed) - .5);
  return Math.max(0, Math.min(1, v));
}

// 셀 목표 색상 (HSL)
export function targetHSL(x, y, n, seed) {
  const l = lum(x, y, n, seed);
  const hue = (196 + 118 * (.5 + .5 * Math.sin(x / n * 5.2 + y / n * 2.1 + seed))) % 360;
  return { h: hue, s: 30 + 42 * l, l: 16 + 62 * l };
}

// ── 색상 변환 ────────────────────────────────────────────
export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + to(f(0)) + to(f(8)) + to(f(4));
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > .5 ? d / (2 - max - min) : d / (max + min);
  let hh;
  if (max === r) hh = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hh = (b - r) / d + 2;
  else hh = (r - g) / d + 4;
  return { h: hh * 60, s: s * 100, l: l * 100 };
}

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

// ── 날짜 유틸 (로컬 기준) ─────────────────────────────────
export function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function untilMidnight() {
  const now = new Date();
  const mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const ms = mid - now;
  const hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ── 사진 처리: 대표 색상 추출 + 정사각 썸네일 생성 ──────────
export function analyzePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        // 중앙 정사각 크롭
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;

        // 대표 색상: 32x32 평균
        const c1 = document.createElement('canvas');
        c1.width = c1.height = 32;
        const g1 = c1.getContext('2d');
        g1.drawImage(img, sx, sy, side, side, 0, 0, 32, 32);
        const d = g1.getImageData(0, 0, 32, 32).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        const avg = { r: r / n, g: g / n, b: b / n };
        const hsl = rgbToHsl(avg.r, avg.g, avg.b);

        // 저장용 썸네일 256px JPEG
        const c2 = document.createElement('canvas');
        c2.width = c2.height = 256;
        c2.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
        c2.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error('썸네일 생성 실패'));
          resolve({ hsl, avg, blob, sizeMB: (file.size / 1048576).toFixed(1) });
        }, 'image/jpeg', .82);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다')); };
    img.src = url;
  });
}
