# Crocat

Crocat is a social drawing game: two people draw separate parts of one creature and only see the combined result at the reveal.

## Stable version: 1.3.3

Public app: https://xcape42.github.io/crocat/

Crocat 1.3.3 includes two Split modes:

### Local Split

Domi draws **HEAD**, then passes the device to Sarah for **BODY**.

`Home → Play → Local → HEAD → Handoff → BODY → Reveal → Finalize → Result`

The drawing connection guide is role-aware:
- HEAD: guide at the bottom
- BODY: guide at the top

### Split Online

Two devices connect through a six-character room code.

`Create or enter room code → Sarah Ready → Domi Start → simultaneous HEAD/BODY → 15s simultaneous Adjustment → up to 15s Final Reveal → automatic / 2-of-2 Ready next round in the same room`

Entering a six-character code now joins the room if it exists, or creates it with that exact code if it is empty. The creator becomes **Domi / HEAD** and the second player becomes **Sarah / BODY**. Only Sarah has a Ready control; Domi's Start button becomes active once Sarah is ready. There is no pre-game nickname form. During Adjustment, each player can drag and zoom only their own part while seeing the other player's live changes. After 15 seconds the composition locks for a Final Reveal of up to 15 seconds. Both players can press Ready Next Round; 2/2 Ready starts immediately, otherwise the timer starts the next round automatically. The most recently opened room code is remembered locally and prefilled the next time the online entry screen is opened. Players stay in the room until they explicitly choose Home / Leave. Drawing, Adjustment and Final Reveal timers are deadline-based, so backgrounding the browser/app does not pause the game clock.

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

The 1.3.3 release passed:

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


## Settings model

Global Settings are reserved for app-wide preferences such as theme, sound and accessibility.

Game-specific settings live in the game lobby. For Online Split, only the host can edit them; the guest sees the current configuration read-only. Changing a room setting clears the guest Ready state so the guest explicitly confirms the new configuration before the host can start.

Local Split also exposes its round duration in its local lobby.
