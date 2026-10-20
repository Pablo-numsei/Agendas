-- Mural comunitário: publicações anônimas, personalização e fotos privadas até aprovação.
-- As publicações entram como pendentes. A equipe deve aprová-las no Table Editor
-- antes de ficarem visíveis para outras pessoas.

create table if not exists public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Pessoa da comunidade' check (char_length(display_name) between 2 and 32),
  avatar_emoji text not null default '🌿',
  theme text not null default 'sage' check (theme in ('sage','ocean','sunset','lavender')),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1200),
  city text not null default '' check (char_length(city) <= 80),
  mood text not null default '' check (mood in ('','bem','mais-ou-menos','ansioso','triste','cansado')),
  image_path text,
  display_name text not null default 'Pessoa da comunidade' check (char_length(display_name) between 2 and 32),
  avatar_emoji text not null default '🌿',
  theme text not null default 'sage' check (theme in ('sage','ocean','sunset','lavender')),
  is_anonymous boolean not null default true,
  status text not null default 'pending' check (status in ('pending','published','removed')),
  created_at timestamptz not null default now()
);

create index if not exists community_posts_created_at_idx on public.community_posts(created_at desc);
create index if not exists community_posts_user_id_idx on public.community_posts(user_id, created_at desc);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null default 'Conteúdo inadequado' check (char_length(reason) between 5 and 120),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);
create index if not exists community_reports_reporter_id_idx on public.community_reports(reporter_id);

alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_reports enable row level security;

revoke all on public.community_profiles from anon;
revoke all on public.community_posts from anon, authenticated;
revoke all on public.community_reports from anon, authenticated;
grant select, insert, update, delete on public.community_profiles to authenticated;
grant select (id, body, city, mood, image_path, display_name, avatar_emoji, theme, is_anonymous, status, created_at) on public.community_posts to anon, authenticated;
grant delete on public.community_posts to authenticated;
grant insert (post_id, reason) on public.community_reports to authenticated;
grant delete on public.community_reports to authenticated;

drop policy if exists "community profiles are private to their owner" on public.community_profiles;
create policy "community profiles are private to their owner" on public.community_profiles
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "published community posts are public" on public.community_posts;
drop policy if exists "authors can view their own community posts" on public.community_posts;
drop policy if exists "published and own community posts are visible" on public.community_posts;
create policy "published and own community posts are visible" on public.community_posts
  for select to anon, authenticated using (status = 'published' or (select auth.uid()) = user_id);
drop policy if exists "authors can delete their own community posts" on public.community_posts;
create policy "authors can delete their own community posts" on public.community_posts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "signed in users can report published posts" on public.community_reports;
create policy "signed in users can report published posts" on public.community_reports
  for insert to authenticated with check (
    (select auth.uid()) = reporter_id and exists (
      select 1 from public.community_posts p where p.id = post_id and p.status = 'published'
    )
  );
drop policy if exists "users can remove their own community reports" on public.community_reports;
create policy "users can remove their own community reports" on public.community_reports
  for delete to authenticated using ((select auth.uid()) = reporter_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-photos', 'community-photos', false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "owners and readers access approved community photos" on storage.objects;
create policy "owners and readers access approved community photos" on storage.objects
  for select to public using (
    bucket_id = 'community-photos' and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1 from public.community_posts p
        where p.image_path = name and p.status = 'published'
      )
    )
  );
drop policy if exists "owners delete community photos" on storage.objects;
create policy "owners delete community photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'community-photos' and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
