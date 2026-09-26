# Crocat

Crocat is a social drawing game: two people draw separate parts of one creature and only see the combined result at the reveal.

## Stable version: 1.1.0

Public app: https://xcape42.github.io/crocat/

Crocat 1.1.0 includes two Split modes:

### Local Split

Domi draws **HEAD**, then passes the device to Sarah for **BODY**.

`Home → Play → Local → HEAD → Handoff → BODY → Reveal → Finalize → Result`

The drawing connection guide is role-aware:
- HEAD: guide at the bottom
- BODY: guide at the top

### Split Online

Two devices connect through a six-character room code.

`Create room → Join → Presence → Ready → simultaneous HEAD/BODY → synchronized Reveal`

The room creator plays as **Domi / HEAD** and the joining player as **Sarah / BODY**. There is no pre-game nickname form in 1.1.0.

## Stack

- Expo / React Native / React Native Web
- Expo Router
- TypeScript
- Zustand
- react-native-svg
- Supabase Auth, Postgres and Realtime
- GitHub Actions + GitHub Pages

## Run locally

Node.js 22.13+.

```bash
npm ci
npm run start
```

## Online backend

The production client is connected to the Crocat Supabase Free-plan project using its public URL and publishable key. No service-role or secret key is shipped in the app.

Crocat uses Supabase anonymous users to avoid a signup wall. Anonymous users are intentionally restricted by RLS to rooms they belong to.

For a different Supabase project, override:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Then enable Anonymous Sign-Ins and apply the migrations in `supabase/migrations/`.

## Validation

The 1.1.0 release passed:

- dependency install
- TypeScript
- Expo Doctor
- production Expo web export
- automated two-client Domi/Sarah Supabase smoke test
- GitHub Pages deployment

## Git workflow

- `main` — stable/public
- `dev` — integrated next version
- `feat/*` — isolated feature work
- `fix/*` — isolated fixes
