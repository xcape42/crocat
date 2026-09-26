# Crocat

Crocat is a social drawing game: two people draw separate parts of one creature and only see the combined result at the reveal.

## Stable version: 1.0.0

The current public browser prototype supports the complete local pass-the-device flow:

`Home → Play → Lobby → HEAD → Handoff → BODY → Reveal → Finalize → Result`

Public demo: https://xcape42.github.io/crocat/

## 1.1.0 development: online Split

The `feat/online-multiplayer` branch adds the first true two-device game:

`Create/Join → Room code → Presence → Ready → simultaneous HEAD/BODY → synchronized Reveal`

### Stack

- Expo / React Native / React Native Web
- Expo Router
- TypeScript
- Zustand
- react-native-svg
- Supabase Auth, Postgres and Realtime

### Run

Node.js 22.13+.

```bash
npm ci
npm run start
```

### Online backend

Crocat uses anonymous Supabase users to avoid a signup wall. Configure:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Then:

1. Enable **Anonymous Sign-Ins** in Supabase Auth settings.
2. Apply `supabase/schema.sql`.
3. Run Supabase security/performance advisors.
4. Start Crocat on two browsers/devices.
5. Device A creates a room; Device B joins with the six-character code.

Never place a Supabase secret/service-role key in the app.

## Git workflow

- `main` — stable/public
- `dev` — integrated next version
- `feat/*` — isolated feature work
- `fix/*` — isolated fixes

The online multiplayer work remains isolated until backend verification and CI both pass.
