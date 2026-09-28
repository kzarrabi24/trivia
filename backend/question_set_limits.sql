-- Enforce BuzzBoard's 200-question maximum at the database layer.
create or replace function private.enforce_question_set_max_200()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_set_id uuid;
  v_count integer;
begin
  v_set_id := coalesce(new.set_id, old.set_id);
  select count(*)::int into v_count
  from public.question_set_questions
  where set_id = v_set_id;

  if v_count > 200 then
    raise exception 'Question sets may contain at most 200 questions';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.enforce_question_set_max_200() from public, anon, authenticated;

drop trigger if exists question_set_max_200 on public.question_set_questions;
create constraint trigger question_set_max_200
after insert or update of set_id on public.question_set_questions
deferrable initially immediate
for each row execute function private.enforce_question_set_max_200();
