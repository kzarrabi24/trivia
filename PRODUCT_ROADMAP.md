# BuzzBoard product roadmap

## Current MVP in this repo
- One Supabase backend shared by web, iOS and Android.
- Web host studio for game/category/clue creation.
- Web host control room with live Jeopardy-style board.
- Web and mobile player join-by-code flows.
- Atomic, server-authoritative fastest-buzz logic.
- Correct/incorrect scoring and live leaderboard.
- Wrong-answer rebuzz flow that excludes previous incorrect responders.
- Per-category player analytics: attempts, accuracy, points won and net points.
- Persistent anonymous profiles, ready to upgrade to full accounts later.

## Production beta
- Email, Apple and Google account upgrades without losing anonymous-player history.
- Reusable question packs and pack sharing.
- QR-code joining and TV/presentation display mode.
- Host recovery after refresh/reconnect and room ownership transfer.
- Teams mode.
- Timers, Daily Double-style wagers and a final wager round.
- CSV bulk import/export for question packs.
- Push notifications and invitations.
- Automated concurrency tests for large simultaneous buzzes.
- Rate limiting, moderation, abuse controls and latency diagnostics.

## Growth features
- Friends and global leaderboards.
- Achievements, streaks, trophies and seasons.
- Category skill ratings beyond raw accuracy.
- Scheduled leagues and venue/bar trivia mode.
- Public question marketplace/library.
- AI-assisted question authoring with human review.
- Subscription tier for power hosts, venues and corporate events.
