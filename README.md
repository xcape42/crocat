# Crocat

Crocat is a social drawing game: two people draw separate parts of one creature and only see the combined result at the reveal.

## Stable version: 1.3.1

Public app: https://xcape42.github.io/crocat/

Crocat 1.3.1 includes two Split modes:

### Local Split

Domi draws **HEAD**, then passes the device to Sarah for **BODY**.

`Home → Play → Local → HEAD → Handoff → BODY → Reveal → Finalize → Result`

The drawing connection guide is role-aware:
- HEAD: guide at the bottom
- BODY: guide at the top

### Split Online

Two devices connect through a six-character room code.

`Create room → Join → Sarah Ready → Domi Start → simultaneous HEAD/BODY → 15s simultaneous Adjustment → 15s Final Reveal → automatic next round in the same room`

The room creator plays as **Domi / HEAD** and the joining player as **Sarah / BODY**. Only Sarah has a Ready control; Domi's Start button becomes active once Sarah is ready. There is no pre-game nickname form. During Adjustment, each player can drag and zoom only their own part while seeing the other player's live changes. After 15 seconds the composition locks for a 15-second Final Reveal, then the next round starts automatically in the same room. Players stay in the room until they explicitly choose Home / Leave. Drawing, Adjustment and Final Reveal timers are deadline-based, so backgrounding the browser/app does not pause the game clock.

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

The 1.3.1 release passed:

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
