-- BuzzBoard multi-mode trivia support.
-- Adds Jeopardy/buzzer, Multiple Choice, Closest Number, media, and remote responses.

alter table public.question_sets add column if not exists game_type text not null default 'jeopardy';
alter table public.question_set_questions
  add column if not exists choices jsonb not null default '[]'::jsonb,
  add column if not exists media_url text,
  add column if not exists media_type text;

alter table public.games add column if not exists game_type text not null default 'jeopardy';
alter table public.game_questions
  add column if not exists choices jsonb not null default '[]'::jsonb,
  add column if not exists media_url text,
  add column if not exists media_type text;

create table if not exists public.question_responses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  question_id uuid not null references public.game_questions(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete cascade,
  response_type text not null check (response_type in ('multiple_choice','closest_number')),
  choice_value text,
  number_value numeric,
  submitted_at timestamptz not null default clock_timestamp(),
  unique(question_id,player_id)
);

-- Public question media bucket. Uploads are restricted by Storage RLS to the user's own folder.
-- Bucket: question-media
-- Allowed: common image/audio MIME types, max 15 MB.
