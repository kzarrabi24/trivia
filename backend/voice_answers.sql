-- BuzzBoard timed voice-answer flow for Jeopardy/buzzer games.
-- Fastest buzzer is called on by the host, receives a 5-second answer window,
-- and only the speech transcript (not microphone audio) is sent to the scoring RPC.

alter table public.games
  add column if not exists voice_answer_player_id uuid references public.game_players(id) on delete set null,
  add column if not exists voice_answer_started_at timestamptz,
  add column if not exists voice_answer_deadline timestamptz;

alter table public.game_players
  add column if not exists voice_ready boolean not null default false;

-- Runtime functions:
-- public.set_voice_ready(player_id, ready)
-- public.start_voice_answer(game_id, question_id, player_id)
-- public.submit_voice_answer(game_id, question_id, player_id, transcript)
--
-- Audio is never inserted into a BuzzBoard table or Storage bucket.
-- Correctness is determined server-side from the submitted transcript.


-- Voice-answer matching is accent-insensitive and intentionally lenient:
-- - Unicode accents/diacritics are normalized (e.g. Dončić -> Doncic)
-- - For multi-word answers, a meaningful last name alone is accepted
-- - Small speech-to-text misspellings of the last name are accepted
-- - Whole-answer trigram similarity is used as a final fallback
-- - Guardrails reject close-but-different names such as Brian vs Bryant
