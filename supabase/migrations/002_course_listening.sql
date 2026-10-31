-- =====================================================================
-- Speak Up · Migración 002: curso, escucha y plan diario
-- Ejecutar DESPUÉS de 001_init.sql
-- =====================================================================

-- Perfil: temas propios y unidad actual
alter table public.profile add column if not exists custom_topics text[] not null default '{}';
alter table public.profile add column if not exists current_unit text not null default 'a1-01';
alter table public.profile add column if not exists listening_rate numeric not null default 1.0; -- multiplicador sobre la velocidad del nivel

-- Sesiones de conversación: gramática a practicar (de la unidad actual)
alter table public.sessions add column if not exists focus text;

-- ---------- LESSONS: contenido generado por Claude (se genera 1 vez) ----------
create table if not exists public.lessons (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  unit_id    text not null,
  content    jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, unit_id)
);

-- ---------- UNIT_PROGRESS: estado de cada unidad ----------
create table if not exists public.unit_progress (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  unit_id      text not null,
  status       text not null default 'in_progress' check (status in ('in_progress','completed')),
  best_score   int  not null default 0,
  attempts     int  not null default 0,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, unit_id)
);

-- ---------- LISTENING_EXERCISES ----------
create table if not exists public.listening_exercises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  level      text not null,
  topic      text,
  content    jsonb not null,
  score      int,             -- % de preguntas entendidas
  created_at timestamptz not null default now()
);
create index if not exists listening_user_idx on public.listening_exercises(user_id, created_at desc);

-- ---------- DAILY_LOG: plan "Hoy" ----------
create table if not exists public.daily_log (
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day       date not null,
  review    boolean not null default false,
  lesson    boolean not null default false,
  listening boolean not null default false,
  talk      boolean not null default false,
  primary key (user_id, day)
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['lessons','unit_progress','listening_exercises','daily_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
