create extension if not exists pgcrypto;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  avatar_seed text,
  created_at timestamptz not null default now()
);

create table if not exists public.categories(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.games(
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text not null unique,
  status text not null default 'lobby' check(status in('lobby','active','finished')),
  active_question_id uuid null,
  buzzer_open boolean not null default false,
  buzz_round int not null default 1,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.game_categories(
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  sort_order int not null default 0,
  unique(game_id, sort_order)
);

create table if not exists public.game_questions(
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_category_id uuid not null references public.game_categories(id) on delete cascade,
  prompt text not null,
  answer text not null,
  value int not null check(value > 0),
  sort_order int not null default 0,
  state text not null default 'available' check(state in('available','active','used')),
  created_at timestamptz not null default now(),
  unique(game_category_id, sort_order)
);

alter table public.games drop constraint if exists games_active_question_id_fkey;
alter table public.games add constraint games_active_question_id_fkey foreign key(active_question_id) references public.game_questions(id) on delete set null;

create table if not exists public.game_players(
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  score int not null default 0,
  joined_at timestamptz not null default now(),
  unique(game_id,user_id)
);

create table if not exists public.buzz_winners(
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  question_id uuid not null references public.game_questions(id) on delete cascade,
  buzz_round int not null,
  player_id uuid not null references public.game_players(id) on delete cascade,
  buzzed_at timestamptz not null default clock_timestamp(),
  unique(game_id,question_id,buzz_round)
);

create table if not exists public.answer_attempts(
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  question_id uuid not null references public.game_questions(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  category_name text not null,
  correct boolean not null,
  points_delta int not null,
  answered_at timestamptz not null default clock_timestamp()
);

create index if not exists game_questions_game_idx on public.game_questions(game_id,state);
create index if not exists game_players_game_idx on public.game_players(game_id,score desc);
create index if not exists answer_attempts_player_idx on public.answer_attempts(player_id,answered_at desc);

create or replace function public.ensure_profile(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path=public
as $$
declare v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.profiles(id,display_name,avatar_seed)
  values(auth.uid(),coalesce(nullif(trim(p_display_name),''),'Player'),substr(auth.uid()::text,1,8))
  on conflict(id) do update set display_name=coalesce(nullif(trim(p_display_name),''),profiles.display_name)
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.claim_buzz(p_game_id uuid,p_question_id uuid,p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_round int;
  v_winner uuid;
  v_buzz_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.game_players where id=p_player_id and game_id=p_game_id and user_id=auth.uid()) then
    raise exception 'Player identity does not match';
  end if;
  select buzz_round into v_round from public.games where id=p_game_id and active_question_id=p_question_id and status='active' and buzzer_open=true;
  if v_round is null then raise exception 'Buzzing is not open'; end if;
  if exists(select 1 from public.answer_attempts where game_id=p_game_id and question_id=p_question_id and player_id=p_player_id) then
    raise exception 'You already attempted this clue';
  end if;
  insert into public.buzz_winners(game_id,question_id,buzz_round,player_id)
  values(p_game_id,p_question_id,v_round,p_player_id)
  on conflict(game_id,question_id,buzz_round) do nothing
  returning id into v_buzz_id;
  select player_id into v_winner from public.buzz_winners where game_id=p_game_id and question_id=p_question_id and buzz_round=v_round;
  return jsonb_build_object('won', v_winner=p_player_id,'winner_player_id',v_winner,'buzz_round',v_round,'buzz_id',v_buzz_id);
end;
$$;

create or replace function public.activate_question(p_game_id uuid,p_question_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() <> (select host_id from public.games where id=p_game_id) then raise exception 'Host only'; end if;
  if not exists(select 1 from public.game_questions where id=p_question_id and game_id=p_game_id and state='available') then raise exception 'Clue is not available'; end if;
  update public.game_questions set state='available' where game_id=p_game_id and state='active';
  update public.game_questions set state='active' where id=p_question_id;
  update public.games set active_question_id=p_question_id,buzzer_open=false,buzz_round=1,status='active' where id=p_game_id;
  delete from public.buzz_winners where game_id=p_game_id and question_id=p_question_id;
end;
$$;

create or replace function public.set_buzzer_open(p_game_id uuid,p_open boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() <> (select host_id from public.games where id=p_game_id) then raise exception 'Host only'; end if;
  if (select active_question_id from public.games where id=p_game_id) is null then raise exception 'No active clue'; end if;
  update public.games set buzzer_open=p_open where id=p_game_id;
end;
$$;

create or replace function public.reopen_buzzer(p_game_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() <> (select host_id from public.games where id=p_game_id) then raise exception 'Host only'; end if;
  update public.games set buzz_round=buzz_round+1,buzzer_open=true where id=p_game_id and active_question_id is not null;
end;
$$;

create or replace function public.judge_answer(p_game_id uuid,p_question_id uuid,p_player_id uuid,p_correct boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_value int;
  v_category_id uuid;
  v_category_name text;
  v_delta int;
  v_round int;
begin
  if auth.uid() <> (select host_id from public.games where id=p_game_id) then raise exception 'Host only'; end if;
  select gq.value,gc.category_id,gc.name,g.buzz_round into v_value,v_category_id,v_category_name,v_round
  from public.game_questions gq join public.game_categories gc on gc.id=gq.game_category_id join public.games g on g.id=gq.game_id
  where gq.id=p_question_id and gq.game_id=p_game_id and g.active_question_id=p_question_id;
  if v_value is null then raise exception 'Clue is not active'; end if;
  if not exists(select 1 from public.buzz_winners where game_id=p_game_id and question_id=p_question_id and buzz_round=v_round and player_id=p_player_id) then raise exception 'That player did not win the current buzz'; end if;
  if exists(select 1 from public.answer_attempts where game_id=p_game_id and question_id=p_question_id and player_id=p_player_id) then raise exception 'This player was already judged for the clue'; end if;
  v_delta := case when p_correct then v_value else -v_value end;
  update public.game_players set score=score+v_delta where id=p_player_id and game_id=p_game_id;
  insert into public.answer_attempts(game_id,question_id,player_id,category_id,category_name,correct,points_delta)
  values(p_game_id,p_question_id,p_player_id,v_category_id,v_category_name,p_correct,v_delta);
  if p_correct then
    update public.game_questions set state='used' where id=p_question_id;
    update public.games set active_question_id=null,buzzer_open=false where id=p_game_id;
  else
    update public.games set buzzer_open=false where id=p_game_id;
  end if;
  return jsonb_build_object('points_delta',v_delta,'correct',p_correct);
end;
$$;

create or replace function public.finish_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() <> (select host_id from public.games where id=p_game_id) then raise exception 'Host only'; end if;
  update public.games set status='finished',active_question_id=null,buzzer_open=false,finished_at=clock_timestamp() where id=p_game_id;
end;
$$;

create or replace view public.player_category_stats with (security_invoker = true) as
select gp.user_id,aa.category_id,aa.category_name,count(*)::int as attempts,count(*) filter(where aa.correct)::int as correct,
coalesce(sum(aa.points_delta),0)::int as net_points,coalesce(sum(case when aa.correct then aa.points_delta else 0 end),0)::int as points_won,
round(100.0*count(*) filter(where aa.correct)/nullif(count(*),0),1) as accuracy
from public.answer_attempts aa join public.game_players gp on gp.id=aa.player_id
group by gp.user_id,aa.category_id,aa.category_name;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.games enable row level security;
alter table public.game_categories enable row level security;
alter table public.game_questions enable row level security;
alter table public.game_players enable row level security;
alter table public.buzz_winners enable row level security;
alter table public.answer_attempts enable row level security;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated using(id=auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using(id=auth.uid());
drop policy if exists "categories readable" on public.categories;
create policy "categories readable" on public.categories for select to authenticated using(is_public=true or created_by=auth.uid());
drop policy if exists "categories insert" on public.categories;
create policy "categories insert" on public.categories for insert to authenticated with check(auth.uid()=created_by);
drop policy if exists "games readable" on public.games;
create policy "games readable" on public.games for select to authenticated using(true);
drop policy if exists "games create own" on public.games;
create policy "games create own" on public.games for insert to authenticated with check(auth.uid()=host_id);
drop policy if exists "hosts update own games" on public.games;
create policy "hosts update own games" on public.games for update to authenticated using(auth.uid()=host_id);
drop policy if exists "game categories readable" on public.game_categories;
create policy "game categories readable" on public.game_categories for select to authenticated using(true);
drop policy if exists "hosts manage game categories" on public.game_categories;
create policy "hosts manage game categories" on public.game_categories for all to authenticated
using(exists(select 1 from public.games g where g.id=game_id and g.host_id=auth.uid()))
with check(exists(select 1 from public.games g where g.id=game_id and g.host_id=auth.uid()));
drop policy if exists "game questions readable" on public.game_questions;
create policy "game questions readable" on public.game_questions for select to authenticated using(true);
drop policy if exists "hosts manage game questions" on public.game_questions;
create policy "hosts manage game questions" on public.game_questions for all to authenticated
using(exists(select 1 from public.games g where g.id=game_id and g.host_id=auth.uid()))
with check(exists(select 1 from public.games g where g.id=game_id and g.host_id=auth.uid()));
drop policy if exists "players readable" on public.game_players;
create policy "players readable" on public.game_players for select to authenticated using(true);
drop policy if exists "players join as themselves" on public.game_players;
create policy "players join as themselves" on public.game_players for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "players update own or host" on public.game_players;
create policy "players update own or host" on public.game_players for update to authenticated
using(auth.uid()=user_id or exists(select 1 from public.games g where g.id=game_id and g.host_id=auth.uid()));
drop policy if exists "buzz readable" on public.buzz_winners;
create policy "buzz readable" on public.buzz_winners for select to authenticated using(true);
drop policy if exists "attempts readable" on public.answer_attempts;
create policy "attempts readable" on public.answer_attempts for select to authenticated using(
  exists(select 1 from public.game_players gp where gp.id=player_id and gp.user_id=auth.uid())
  or exists(select 1 from public.games g where g.id=game_id and g.host_id=auth.uid())
);

grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.claim_buzz(uuid,uuid,uuid) to authenticated;
grant execute on function public.activate_question(uuid,uuid) to authenticated;
grant execute on function public.set_buzzer_open(uuid,boolean) to authenticated;
grant execute on function public.reopen_buzzer(uuid) to authenticated;
grant execute on function public.judge_answer(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.finish_game(uuid) to authenticated;