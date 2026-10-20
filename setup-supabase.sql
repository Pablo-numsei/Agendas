-- Execute once in Supabase Dashboard > SQL Editor.
-- Each account can read and change only rows whose user_id is its own auth.uid().

create table if not exists public.progress_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  icon text not null default '🌱',
  color text not null default '#8dbb8c',
  goal integer not null check (goal > 0),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid not null,
  title text not null check (char_length(title) between 1 and 100),
  note text not null default '',
  points integer not null check (points between 1 and 5),
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint progress_entries_area_owner_fk
    foreign key (area_id, user_id)
    references public.progress_areas(id, user_id)
    on delete cascade
);

-- Diário pessoal: cada pessoa acessa somente as próprias anotações.
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  title text not null default '' check (char_length(title) <= 80),
  body text not null check (char_length(body) between 1 and 3000),
  response text not null default '' check (char_length(response) <= 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.care_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"checkins":[],"goals":[],"reminder":{"enabled":false,"time":"20:00"}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Dispositivos autorizados para receber notificações push.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Impede que o cron envie mais de um lembrete por usuário e minuto local.
create table if not exists public.push_delivery_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  local_date date not null,
  scheduled_time text not null check (scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  sent_at timestamptz not null default now(),
  primary key (user_id, endpoint, local_date, scheduled_time)
);

create index if not exists progress_areas_user_id_idx
  on public.progress_areas(user_id);
create index if not exists progress_entries_user_date_idx
  on public.progress_entries(user_id, entry_date desc);
create index if not exists journal_entries_user_date_idx
  on public.journal_entries(user_id, entry_date desc);

alter table public.progress_areas enable row level security;
alter table public.progress_entries enable row level security;
alter table public.journal_entries enable row level security;
alter table public.care_profiles enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;

revoke all on public.progress_areas from anon;
revoke all on public.progress_entries from anon;
revoke all on public.journal_entries from anon;
revoke all on public.care_profiles from anon;
revoke all on public.push_subscriptions from anon;
revoke all on public.push_delivery_log from anon, authenticated;
grant select, insert, update, delete on public.progress_areas to authenticated;
grant select, insert, update, delete on public.progress_entries to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;
grant select, insert, update, delete on public.care_profiles to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant delete on public.push_delivery_log to authenticated;

drop policy if exists "users manage their progress areas" on public.progress_areas;
create policy "users manage their progress areas"
  on public.progress_areas
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage their progress entries" on public.progress_entries;
create policy "users manage their progress entries"
  on public.progress_entries
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage their journal entries" on public.journal_entries;
create policy "users manage their journal entries"
  on public.journal_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage their care profile" on public.care_profiles;
create policy "users manage their care profile"
  on public.care_profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage their push subscriptions" on public.push_subscriptions;
create policy "users manage their push subscriptions"
  on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete their push delivery logs" on public.push_delivery_log;
create policy "users delete their push delivery logs"
  on public.push_delivery_log for delete to authenticated
  using ((select auth.uid()) = user_id);
