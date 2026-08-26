// 앱 전역 상태 + 게임 진행 로직
import * as db from './db.js';
import { QUOTA_BASE, INK_PER_CELL, gridOf, todayStr, h } from './game.js';
import { THEMES } from './sprites.js';

export const S = {
  session: null,
  profile: null,
  cells: [],          // 현재 레벨의 채워진 셀
  recentDates: [],    // 최근 제출일 (내림차순)
  completions: [],
  screen: 'boot',
  params: {},
  nav: () => {},      // main.js 에서 주입
};

export const uid = () => S.session?.user?.id;
export const theme = () => THEMES[S.profile?.theme || 0] || THEMES[0];

// ── 로드 ─────────────────────────────────────────────────
export async function loadAll() {
  const id = uid();
  let profile = await db.fetchProfile(id);
  if (!profile) profile = await db.createProfile(id);
  S.profile = profile;
  await reloadLevel();
  S.recentDates = await db.fetchRecentDates(id);
  S.completions = await db.fetchCompletions(id);
}

export async function reloadLevel() {
  S.cells = await db.fetchCells(uid(), S.profile.stage, S.profile.level);
}

// ── 오늘의 한도 ───────────────────────────────────────────
export function quotaInfo() {
  const today = todayStr();
  const used = S.recentDates.filter(d => d === today).length;
  const bonus = (S.profile.quota_bonus?.date === today) ? (S.profile.quota_bonus.extra || 0) : 0;
  const total = QUOTA_BASE + bonus;
  return { used, total, left: Math.max(0, total - used) };
}

// ── 오늘의 배정 셀 (없으면 새로 뽑아 저장) ─────────────────
export async function ensureAssignment() {
  const today = todayStr();
  const a = S.profile.assignment;
  const filled = new Set(S.cells.map(c => c.y * 10000 + c.x));
  if (a && a.date === today && !filled.has(a.y * 10000 + a.x)) return a;

  const n = gridOf(S.profile.stage);
  const empty = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (!filled.has(y * 10000 + x)) empty.push({ x, y });
  if (!empty.length) return null; // 레벨 완성
  const pick = empty[Math.floor(Math.random() * empty.length)];
  const next = { date: today, x: pick.x, y: pick.y };
  S.profile = await db.updateProfile(uid(), { assignment: next });
  return next;
}

// ── 스트릭 갱신 (하루 첫 성공 제출 시) + 마일스톤 지급 ──────
function streakPatch(p) {
  const today = todayStr(), yesterday = todayStr(-1);
  if (p.last_active === today) return {};
  let streak, defense = p.defense, note = null;
  if (p.last_active === yesterday) streak = p.streak + 1;
  else if (!p.last_active) streak = 1;
  else if (defense > 0) { defense -= 1; streak = p.streak + 1; note = '스트릭 방어권이 사용되었습니다'; }
  else { streak = 1; note = '스트릭이 초기화되었습니다'; }

  const longest = Math.max(p.longest_streak || 0, streak);
  const settings = { ...(p.settings || {}) };
  const ms = { ...(settings.ms || {}) };
  const grants = [];
  if (streak >= 7 && !ms['7']) { ms['7'] = true; defense += 1; grants.push('7일 달성 — 스트릭 방어권 +1'); }
  if (streak >= 30 && !ms['30']) { ms['30'] = true; grants.push('30일 달성 — DEEP ORBIT 테마 해금'); }
  if (streak >= 100 && !ms['100']) { ms['100'] = true; grants.push('100일 달성 — 프리미엄 EXPORT + CRT MAGENTA 해금'); }
  settings.ms = ms;
  return { patch: { streak, defense, longest_streak: longest, last_active: today, settings }, note, grants };
}

// ── 셀 정착 처리 ─────────────────────────────────────────
export async function commitCell({ x, y, targetHex, photoPath }) {
  const id = uid();
  const today = todayStr();
  const row = await db.insertCell({
    user_id: id, stage: S.profile.stage, level: S.profile.level,
    x, y, target_hex: targetHex, photo_path: photoPath, fill_date: today,
  });
  S.cells.push(row);
  S.recentDates.unshift(today);

  const sp = streakPatch(S.profile);
  const patch = {
    ink: (S.profile.ink || 0) + INK_PER_CELL,
    assignment: null,
    ...(sp.patch || {}),
  };
  S.profile = await db.updateProfile(id, patch);
  return { grants: sp.grants || [], note: sp.note };
}

// 레벨 완성 여부
export function levelDone() {
  const n = gridOf(S.profile.stage);
  return S.cells.length >= n * n;
}

// 현재 레벨 소요 일수
export function levelCycles() {
  return new Set(S.cells.map(c => c.fill_date)).size;
}

// 다음 마일스톤 정보
export function nextMilestone() {
  const s = S.profile.streak || 0;
  for (const d of [7, 30, 100]) if (s < d) return { days: d, left: d - s };
  return null;
}

// 실패 카운터 — rejects: 현재 레벨, rejectsTotal: 누적 (LIFETIME LOG 용)
export async function bumpRejects() {
  const settings = { ...(S.profile.settings || {}) };
  settings.rejects = (settings.rejects || 0) + 1;
  settings.rejectsTotal = (settings.rejectsTotal || 0) + 1;
  S.profile = await db.updateProfile(uid(), { settings });
}
