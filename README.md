# Crocat

Crocat is a social drawing game: two people draw separate parts of one creature and only see the combined result at the reveal.

## Stable version: 1.4.7

Public app: https://xcape42.github.io/crocat/

Crocat 1.4.7 keeps the stable 1.4.6 game flow and hardens timing and browser interaction: every countdown is derived from its active deadline, Final Reveal gets a fresh 15-second deadline when it actually begins, and accidental browser text selection is disabled everywhere except the room code:

### Local Split

Domi draws **HEAD**, then passes the device to Sarah for **BODY**.

`Home → Play → Local → HEAD → Handoff → BODY → Reveal → Finalize → Result`

The drawing connection guide is role-aware:
- HEAD: guide at the bottom
- BODY: guide at the top

### Split Online

Two devices connect through a six-character room code.

`Create or enter room code → Sarah Ready → Domi Start → random HEAD/BODY → 15s Prompt Pick → simultaneous Drawing → 15s Adjustment → up to 15s Final Reveal → next round in the same room`

Host and drawing role are separate: **Domi remains host**, but HEAD/BODY are randomized server-side every round. The current HEAD player receives three prompts from three different themes and has 15 seconds to choose. HEAD may reroll all three exactly once; rerolled terms never repeat the previous three. If no choice is made, the server randomly selects one of the currently visible options. The active catalog contains 60 curated prompts in **Mystisch, Fantasy, Natur, Elegant and Genuss**, with 12 prompts per theme.

The BODY player sees the same prompt-selection screen live, but cannot choose or reroll. Each option also shows its split labels. As soon as HEAD chooses a prompt, the server switches to Drawing immediately and the other client resynchronizes as soon as its realtime subscription is live. During Drawing and Adjustment each player sees the selected term plus the semantic label for their assigned half; the theme is hidden again until the Final Reveal.

Early drawing submission remains reversible while the other player is still drawing. A player can submit, see whether the other player has submitted, return to the canvas before the drawing deadline, and submit a newer version. As soon as **both** players are submitted, the server ends Drawing immediately and starts Adjustment; the drawing deadline remains the fallback when both are not finished early. The final seconds are visually emphasized.

During Adjustment each player can drag and zoom only their own part. Each player can also mark themselves Ready without hiding the shared composition. 1/2 Ready keeps Adjustment running; 2/2 Ready starts Final Reveal immediately. Final Reveal shows both the selected term and its theme. Both players can press Ready Next Round; the next round starts only while both players are actively present in Crocat. If one player is away, the game visibly waits for them.

The most recently opened room code is remembered locally and prefilled on future online sessions. A valid direct `/online/room/CODE` link now rejoins an existing membership or joins an available waiting room; unavailable, full or invalid rooms return to Home instead of showing a broken room screen. Players can leave the room from Prompt Select, Drawing, Adjustment and Final Reveal. Timers are deadline-based, use one centered countdown presentation, and backgrounding the browser/app does not pause the game clock. Realtime Presence also marks a backgrounded player inactive for the next-round gate. Active room membership sends a lightweight heartbeat every 20 seconds; a database cleanup job runs every minute and removes rooms only when no player has been seen for at least one minute, so brief connection drops do not immediately destroy a room.

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

The 1.4.7 release validation includes:

- dependency install
- TypeScript
- Expo Doctor
- production Expo web export
- automated Supabase multiplayer smoke coverage for prompt flow, immediate two-submit handoff, Adjustment Ready, heartbeat and full-room rejection
- database catalog verification for 60 unique prompts, five balanced themes, semantic split labels and three-theme option generation
- exact phase-deadline validation for Adjustment and Final Reveal
- room-code clipboard interaction with global browser text-selection protection
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
