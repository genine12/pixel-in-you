-- ============================================================
-- PIXEL IN YOU — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 실행하세요.
-- ============================================================

-- ── 프로필 (유저별 게임 상태) ─────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  operator text,                          -- 표시용 오퍼레이터 ID (예: K-2291)
  onboarded boolean not null default false,
  stage int not null default 0,           -- 0=8x8, 1=16x16, 2=32x32, 3=64x64
  level int not null default 0,           -- 스테이지 내 레벨 (0-base)
  ink int not null default 0,             -- 컬러 잉크
  defense int not null default 0,         -- 스트릭 방어권
  streak int not null default 0,
  longest_streak int not null default 0,
  last_active date,                       -- 마지막 제출 성공일
  theme int not null default 0,
  special_pixels int not null default 0,  -- 특수 픽셀 (색상 판정 면제)
  ending_seen boolean not null default false,
  settings jsonb not null default '{}'::jsonb, -- 사운드/토글/마일스톤 지급 기록 등
  assignment jsonb,                       -- 오늘의 배정 셀 {date,x,y}
  quota_bonus jsonb,                      -- 오늘의 한도 확장 {date,extra}
  created_at timestamptz not null default now()
);

-- ── 채워진 셀 ────────────────────────────────────────────────
create table if not exists public.cells (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage int not null,
  level int not null,
  x int not null,
  y int not null,
  target_hex text,
  photo_path text,
  fill_date date not null,                -- 제출일 (로컬 기준, 클라이언트가 기록)
  created_at timestamptz not null default now(),
  unique (user_id, stage, level, x, y)
);
create index if not exists cells_user_level_idx on public.cells (user_id, stage, level);
create index if not exists cells_user_date_idx on public.cells (user_id, fill_date);

-- ── 레벨 완성 기록 ───────────────────────────────────────────
create table if not exists public.completions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage int not null,
  level int not null,
  cycles int,                             -- 소요 일수
  completed_at timestamptz not null default now(),
  unique (user_id, stage, level)
);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.cells enable row level security;
alter table public.completions enable row level security;

create policy "profiles self select" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "cells self select" on public.cells for select to authenticated using (user_id = auth.uid());
create policy "cells self insert" on public.cells for insert to authenticated with check (user_id = auth.uid());
create policy "cells self delete" on public.cells for delete to authenticated using (user_id = auth.uid());

create policy "completions self select" on public.completions for select to authenticated using (user_id = auth.uid());
create policy "completions self insert" on public.completions for insert to authenticated with check (user_id = auth.uid());
create policy "completions self delete" on public.completions for delete to authenticated using (user_id = auth.uid());

-- ── 스토리지: 사진 버킷 (비공개) ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('specimens', 'specimens', false)
on conflict (id) do nothing;

-- 자기 폴더({uid}/...)만 접근 가능
create policy "specimens own select" on storage.objects for select to authenticated
  using (bucket_id = 'specimens' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "specimens own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'specimens' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "specimens own update" on storage.objects for update to authenticated
  using (bucket_id = 'specimens' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "specimens own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'specimens' and (storage.foldername(name))[1] = auth.uid()::text);
