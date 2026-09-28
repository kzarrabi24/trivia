# BuzzBoard

BuzzBoard is one trivia product delivered through three clients: a Next.js web experience for hosts and browser players, plus one Expo/React Native application that runs on iOS and Android. All clients share the same Supabase authentication, Postgres data, Realtime subscriptions, buzzer arbitration and player statistics.

## MVP included in this repository

- Host board builder with removable/addable categories and 200–1000 point clues.
- Six-character live room codes.
- Player join flow on web and mobile.
- Server-authoritative first-buzz arbitration using a Postgres RPC and database clock.
- Wrong-answer flow: deduct points, exclude that player from the clue, then reopen buzzing for everyone else.
- Host correct/incorrect controls and live leaderboard.
- Realtime room, score, buzzer and clue state across devices.
- Persistent anonymous identity so a player can build stats before a full email/social-login system is added.
- Per-category accuracy, attempts, points won and net points.
- Player stats screens on web and mobile.

## Architecture

```
apps/web       Next.js App Router (host + browser player + profile)
apps/mobile    Expo Router / React Native (iOS + Android player app)
packages/shared Shared TypeScript domain types
backend        Supabase/Postgres schema, RLS and RPC game logic
```

The backend is the authority for buzz ordering and scoring. Clients never decide that they won a buzz and never directly mutate a score.

## Local setup

1. Create a Supabase project.
2. In Supabase Auth, enable **Anonymous Sign-Ins**.
3. Run `backend/schema.sql` in the Supabase SQL editor.
4. Copy `apps/web/.env.example` to `apps/web/.env.local` and add the Supabase project URL and anon key.
5. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and add the same project URL and anon key.
6. From the repository root run `npm install`.
7. Web: `npm run web`.
8. Mobile: `npm run mobile`, then open in Expo Go or an iOS/Android simulator.

## Production path

- Web deployment: Vercel.
- Database/realtime/auth: Supabase.
- iOS/Android builds: Expo EAS.
- App Store release requires an Apple Developer account; Play Store release requires a Google Play Console account.

Before a public launch, add email/social account upgrades, abuse/rate limiting, room moderation, reconnect telemetry, host recovery, tests around concurrent buzzing, and a production privacy policy/terms flow.
