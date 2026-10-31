-- =====================================================================
-- Speak Up · Migración inicial
-- Tablas: profile, sessions, messages, mistakes, vocabulary, progress
-- Todas con RLS: cada fila solo es visible/editable por su propietario.
-- =====================================================================

-- ---------- PROFILE: configuración del tutor ----------
create table if not exists public.profile (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  level          text    not null default 'A1+',          -- nivel CEFR de partida
  tts_rate       numeric not null default 0.8,            -- velocidad de voz del tutor
  tts_voice      text,                                    -- nombre de la voz elegida (opcional)
  stt_engine     text    not null default 'auto'          -- auto | webspeech | whisper
                 check (stt_engine in ('auto','webspeech','whisper')),
  spanish_support int    not null default 2               -- 0 = nada, 1 = poco, 2 = cuando me bloqueo
                 check (spanish_support between 0 and 2),
  glossary       text[]  not null default array['Rouvy','Nutanix','Veeam','Mataró','Zabbix','WSUS','SharePoint','Active Directory','triathlon'],
  updated_at     timestamptz not null default now()
);

-- ---------- SESSIONS: cada práctica ----------
create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode           text not null check (mode in ('freetalk','roleplay','shadowing','listening','review')),
  topic          text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  duration_sec   int,
  turns          int not null default 0,
  level_estimate text
);
create index if not exists sessions_user_idx on public.sessions(user_id, started_at desc);

-- ---------- MESSAGES: la conversación ----------
create table if not exists public.messages (
  id             bigint generated always as identity primary key,
  session_id     uuid not null references public.sessions(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role           text not null check (role in ('user','tutor')),
  text           text not null,
  corrected_text text,
  created_at     timestamptz not null default now()
);
create index if not exists messages_session_idx on public.messages(session_id, id);

-- ---------- MISTAKES: errores (también se repasan con SRS) ----------
create table if not exists public.mistakes (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type           text not null check (type in ('grammar','vocabulary','preposition','pronunciation')),
  original       text not null,
  correction     text not null,
  explanation_es text,
  times_seen     int  not null default 1,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  -- SRS (SM-2)
  due_at         timestamptz not null default now(),
  interval_days  numeric not null default 0,
  ease           numeric not null default 2.5,
  reps           int not null default 0,
  unique (user_id, original, correction)
);
create index if not exists mistakes_due_idx on public.mistakes(user_id, due_at);

-- ---------- VOCABULARY ----------
create table if not exists public.vocabulary (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  term           text not null,
  translation_es text,
  example        text,
  created_at     timestamptz not null default now(),
  -- SRS (SM-2)
  due_at         timestamptz not null default now(),
  interval_days  numeric not null default 0,
  ease           numeric not null default 2.5,
  reps           int not null default 0,
  unique (user_id, term)
);
create index if not exists vocabulary_due_idx on public.vocabulary(user_id, due_at);

-- ---------- PROGRESS: racha y totales ----------
create table if not exists public.progress (
  user_id            uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  level_speaking     text not null default 'A1+',
  level_listening    text not null default 'A1',
  streak_days        int  not null default 0,
  last_practice_date date,
  total_minutes      int  not null default 0,
  total_sessions     int  not null default 0
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['profile','sessions','messages','mistakes','vocabulary','progress'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
