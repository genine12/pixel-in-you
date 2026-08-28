// Supabase 클라이언트 및 데이터 접근 계층 (+ 로그인 없는 게스트 모드)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 게스트 모드 — 로그인 없이 체험, 데이터는 이 기기(localStorage)에만 저장 ──
const GUEST_FLAG = 'piy-guest-mode';
const GUEST_DATA = 'piy-guest-data';

export const isGuest = () => { try { return localStorage.getItem(GUEST_FLAG) === '1'; } catch { return false; } };
export const enterGuestMode = () => localStorage.setItem(GUEST_FLAG, '1');
export const exitGuestMode = () => localStorage.removeItem(GUEST_FLAG);

const memPhotos = {}; // localStorage 용량 초과 시 세션 한정 폴백

function gLoad() {
  try { return JSON.parse(localStorage.getItem(GUEST_DATA)) || {}; } catch { return {}; }
}
function gSave(d) {
  try { localStorage.setItem(GUEST_DATA, JSON.stringify(d)); } catch { /* 용량 초과 등 — 메모리 상태로 계속 */ }
}
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

const local = {
  fetchProfile() { return gLoad().profile || null; },
  createProfile() {
    const d = gLoad();
    d.profile = {
      id: 'guest', operator: 'K-GUEST', onboarded: false,
      stage: 0, level: 0, ink: 0, defense: 0, streak: 0, longest_streak: 0,
      last_active: null, special_pixels: 0, ending_seen: false,
      assignment: null, quota_bonus: null, settings: {}, theme: 0,
    };
    d.cells = []; d.completions = []; d.photos = {};
    gSave(d);
    return d.profile;
  },
  updateProfile(patch) {
    const d = gLoad();
    d.profile = { ...(d.profile || {}), ...patch };
    gSave(d);
    return d.profile;
  },
  fetchCells(stage, level) {
    return (gLoad().cells || []).filter(c => c.stage === stage && c.level === level);
  },
  insertCell(row) {
    const d = gLoad();
    d.cells = [...(d.cells || []), row];
    gSave(d);
    return row;
  },
  fetchRecentDates() {
    return (gLoad().cells || []).map(c => c.fill_date).sort().reverse();
  },
  fetchLifetime() { return (gLoad().cells || []).length; },
  fetchCompletions() {
    return [...(gLoad().completions || [])].sort((a, b) => a.stage - b.stage || a.level - b.level);
  },
  insertCompletion(stage, level, cycles) {
    const d = gLoad();
    d.completions = (d.completions || []).filter(c => !(c.stage === stage && c.level === level));
    d.completions.push({ user_id: 'guest', stage, level, cycles });
    gSave(d);
  },
  async uploadPhoto(path, blob) {
    const url = await blobToDataURL(blob);
    memPhotos[path] = url;
    const d = gLoad();
    d.photos = { ...(d.photos || {}), [path]: url };
    gSave(d);
    return path;
  },
  signedUrls(paths) {
    const photos = gLoad().photos || {};
    const map = {};
    paths.forEach(p => { const u = photos[p] || memPhotos[p]; if (u) map[p] = u; });
    return map;
  },
  resetProgress() {
    localStorage.removeItem(GUEST_DATA);
    return local.createProfile();
  },
};

// ── 프로필 ────────────────────────────────────────────────
export async function fetchProfile(uid) {
  if (isGuest()) return local.fetchProfile();
  const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProfile(uid) {
  if (isGuest()) return local.createProfile();
  const operator = 'K-' + String(1000 + Math.floor(Math.random() * 9000));
  const row = { id: uid, operator };
  const { data, error } = await sb.from('profiles').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateProfile(uid, patch) {
  if (isGuest()) return local.updateProfile(patch);
  const { data, error } = await sb.from('profiles').update(patch).eq('id', uid).select().single();
  if (error) throw error;
  return data;
}

// ── 셀 ───────────────────────────────────────────────────
export async function fetchCells(uid, stage, level) {
  if (isGuest()) return local.fetchCells(stage, level);
  const { data, error } = await sb.from('cells').select('*')
    .eq('user_id', uid).eq('stage', stage).eq('level', level);
  if (error) throw error;
  return data;
}

export async function insertCell(row) {
  if (isGuest()) return local.insertCell(row);
  const { data, error } = await sb.from('cells').insert(row).select().single();
  if (error) throw error;
  return data;
}

// 최근 제출일 목록 (스트릭 시각화 / 일일 카운트용)
export async function fetchRecentDates(uid, limit = 400) {
  if (isGuest()) return local.fetchRecentDates();
  const { data, error } = await sb.from('cells').select('fill_date')
    .eq('user_id', uid).order('fill_date', { ascending: false }).limit(limit);
  if (error) throw error;
  return data.map(r => r.fill_date);
}

export async function fetchLifetime(uid) {
  if (isGuest()) return local.fetchLifetime();
  const { count, error } = await sb.from('cells')
    .select('*', { count: 'exact', head: true }).eq('user_id', uid);
  if (error) throw error;
  return count ?? 0;
}

// ── 완성 기록 ─────────────────────────────────────────────
export async function fetchCompletions(uid) {
  if (isGuest()) return local.fetchCompletions();
  const { data, error } = await sb.from('completions').select('*')
    .eq('user_id', uid).order('stage').order('level');
  if (error) throw error;
  return data;
}

export async function insertCompletion(uid, stage, level, cycles) {
  if (isGuest()) return local.insertCompletion(stage, level, cycles);
  const { error } = await sb.from('completions')
    .upsert({ user_id: uid, stage, level, cycles }, { onConflict: 'user_id,stage,level' });
  if (error) throw error;
}

// ── 스토리지 ──────────────────────────────────────────────
export async function uploadPhoto(path, blob) {
  if (isGuest()) return local.uploadPhoto(path, blob);
  const { error } = await sb.storage.from('specimens')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

// 여러 사진의 서명 URL 일괄 발급 (1시간 유효)
export async function signedUrls(paths) {
  if (!paths.length) return {};
  if (isGuest()) return local.signedUrls(paths);
  const { data, error } = await sb.storage.from('specimens').createSignedUrls(paths, 3600);
  if (error) throw error;
  const map = {};
  data.forEach((d, i) => { if (d.signedUrl) map[paths[i]] = d.signedUrl; });
  return map;
}

// ── 진행 초기화 ───────────────────────────────────────────
export async function resetProgress(uid) {
  if (isGuest()) return local.resetProgress();
  await sb.from('cells').delete().eq('user_id', uid);
  await sb.from('completions').delete().eq('user_id', uid);
  return updateProfile(uid, {
    onboarded: false,
    stage: 0, level: 0, ink: 0, defense: 0, streak: 0, longest_streak: 0,
    last_active: null, special_pixels: 0, ending_seen: false,
    assignment: null, quota_bonus: null, settings: {}
  });
}
