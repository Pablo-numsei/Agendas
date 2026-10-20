-- Melhorias da comunidade: temas, reações privadas por pessoa e moderação antes do envio.
alter table public.community_posts
  add column if not exists topic text not null default 'dia-a-dia'
  check (topic in ('dia-a-dia','pequena-vitoria','dia-dificil','quero-desabafar','rotina'));

create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('with_you','thanks','strength')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);
alter table public.community_reactions enable row level security;
revoke all on public.community_reactions from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create or replace function private.get_community_reaction_counts(p_post_ids uuid[])
returns table(post_id uuid, reaction text, reaction_count bigint, reacted boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, kinds.reaction, count(r.user_id),
         coalesce(bool_or(r.user_id = (select auth.uid())), false)
  from public.community_posts p
  cross join (values ('with_you'::text), ('thanks'::text), ('strength'::text)) as kinds(reaction)
  left join public.community_reactions r on r.post_id = p.id and r.reaction = kinds.reaction
  where p.id = any(p_post_ids) and p.status = 'published'
  group by p.id, kinds.reaction;
$$;
revoke all on function private.get_community_reaction_counts(uuid[]) from public, anon, authenticated;
grant execute on function private.get_community_reaction_counts(uuid[]) to anon, authenticated;

create or replace function public.community_reaction_counts(p_post_ids uuid[])
returns table(post_id uuid, reaction text, reaction_count bigint, reacted boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_community_reaction_counts(p_post_ids); $$;
revoke all on function public.community_reaction_counts(uuid[]) from public;
grant execute on function public.community_reaction_counts(uuid[]) to anon, authenticated;

create or replace function private.toggle_community_reaction(p_post_id uuid, p_reaction text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_reaction not in ('with_you','thanks','strength') then raise exception 'invalid reaction' using errcode = '22023'; end if;
  if not exists (select 1 from public.community_posts where id=p_post_id and status='published') then
    raise exception 'post unavailable' using errcode = '22023';
  end if;
  delete from public.community_reactions where post_id=p_post_id and user_id=(select auth.uid()) and reaction=p_reaction;
  if not found then
    insert into public.community_reactions(post_id,user_id,reaction) values (p_post_id,(select auth.uid()),p_reaction);
    return true;
  end if;
  return false;
end;
$$;
revoke all on function private.toggle_community_reaction(uuid,text) from public, anon, authenticated;
grant execute on function private.toggle_community_reaction(uuid,text) to authenticated;

create or replace function public.toggle_community_reaction(p_post_id uuid, p_reaction text)
returns boolean
language sql security invoker set search_path = ''
as $$ select private.toggle_community_reaction(p_post_id,p_reaction); $$;
revoke all on function public.toggle_community_reaction(uuid,text) from public, anon;
grant execute on function public.toggle_community_reaction(uuid,text) to authenticated;

create or replace function private.my_community_post_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select id from public.community_posts where user_id=(select auth.uid()); $$;
revoke all on function private.my_community_post_ids() from public, anon, authenticated;
grant execute on function private.my_community_post_ids() to authenticated;

create or replace function public.my_community_post_ids()
returns setof uuid language sql stable security invoker set search_path = ''
as $$ select * from private.my_community_post_ids(); $$;
revoke all on function public.my_community_post_ids() from public, anon;
grant execute on function public.my_community_post_ids() to authenticated;

grant select (topic) on public.community_posts to anon, authenticated;

-- A tabela guarda IDs de conta apenas para impedir reações duplicadas; o app acessa os totais pelas funções acima.
create index if not exists community_reactions_user_id_idx on public.community_reactions(user_id);
drop policy if exists "no direct community reaction access" on public.community_reactions;
create policy "no direct community reaction access" on public.community_reactions
  for all to anon, authenticated using (false) with check (false);

-- Somente a Edge Function pode criar publicações ou enviar fotos; a autorização do usuário é validada e o conteúdo é moderado primeiro.
revoke insert on public.community_posts from authenticated;
revoke insert (body, city, mood, image_path, display_name, avatar_emoji, theme, is_anonymous) on public.community_posts from authenticated;
drop policy if exists "signed in users submit pending community posts" on public.community_posts;
drop policy if exists "owners upload community photos" on storage.objects;
