-- BuzzBoard reusable community question library.
-- Apply to the same Supabase project as the core BuzzBoard schema.

create table if not exists public.question_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  is_published boolean not null default false,
  source_set_id uuid references public.question_sets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_set_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.question_sets(id) on delete cascade,
  category_name text not null check (char_length(trim(category_name)) between 1 and 80),
  category_order int not null default 0 check (category_order >= 0),
  prompt text not null check (char_length(trim(prompt)) between 1 and 1000),
  answer text not null check (char_length(trim(answer)) between 1 and 500),
  value int not null check (value > 0),
  question_order int not null default 0 check (question_order >= 0),
  created_at timestamptz not null default now(),
  unique(set_id, category_order, question_order)
);

alter table public.question_sets enable row level security;
alter table public.question_set_questions enable row level security;

create policy question_sets_read on public.question_sets for select to anon, authenticated
using (is_published = true or owner_id = (select auth.uid()));

create policy question_sets_insert_permanent on public.question_sets for insert to authenticated
with check (owner_id = (select auth.uid()) and (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) = false);

create policy question_sets_update_owner on public.question_sets for update to authenticated
using (owner_id = (select auth.uid()) and (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) = false)
with check (owner_id = (select auth.uid()) and (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) = false);

create policy question_sets_delete_owner on public.question_sets for delete to authenticated
using (owner_id = (select auth.uid()) and (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) = false);

create policy question_set_questions_read on public.question_set_questions for select to anon, authenticated
using (exists(select 1 from public.question_sets qs where qs.id=set_id and (qs.is_published=true or qs.owner_id=(select auth.uid()))));

create policy question_set_questions_insert_owner on public.question_set_questions for insert to authenticated
with check ((select coalesce((auth.jwt()->>'is_anonymous')::boolean,false))=false and exists(select 1 from public.question_sets qs where qs.id=set_id and qs.owner_id=(select auth.uid())));

grant select on public.question_sets, public.question_set_questions to anon, authenticated;
grant insert, update, delete on public.question_sets, public.question_set_questions to authenticated;
