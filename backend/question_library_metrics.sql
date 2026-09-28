-- BuzzBoard question-set engagement metrics.
-- Counts unique accounts saving a published set and games that actually start using it.

alter table public.games
  add column if not exists source_question_set_id uuid
  references public.question_sets(id) on delete set null;

create table if not exists public.question_set_saves (
  source_set_id uuid not null references public.question_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_set_id uuid not null references public.question_sets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (source_set_id,user_id),
  unique(saved_set_id)
);

create table if not exists public.question_set_metrics (
  set_id uuid primary key references public.question_sets(id) on delete cascade,
  save_count integer not null default 0 check(save_count >= 0),
  game_use_count integer not null default 0 check(game_use_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.question_set_saves enable row level security;
alter table public.question_set_metrics enable row level security;

create policy question_set_saves_read_own on public.question_set_saves
for select to authenticated using(user_id=(select auth.uid()));

create policy question_set_metrics_public_read on public.question_set_metrics
for select to anon,authenticated
using(exists(
  select 1 from public.question_sets qs
  where qs.id=set_id
    and (qs.is_published=true or qs.owner_id=(select auth.uid()))
));

grant select on public.question_set_metrics to anon,authenticated;
grant select on public.question_set_saves to authenticated;

-- Metric rows are maintained by database triggers, not editable by clients.
