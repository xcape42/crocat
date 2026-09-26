# Crocat

Crocat is a social drawing game: two people draw separate parts of one creature and only see the combined result at the reveal.

## Stable version: 1.4.3

Public app: https://xcape42.github.io/crocat/

Crocat 1.4.3 includes two Split modes:

### Local Split

Domi draws **HEAD**, then passes the device to Sarah for **BODY**.

`Home → Play → Local → HEAD → Handoff → BODY → Reveal → Finalize → Result`

The drawing connection guide is role-aware:
- HEAD: guide at the bottom
- BODY: guide at the top

### Split Online

Two devices connect through a six-character room code.

`Create / enter room → Ready → Start → random part assignment → 15s Prompt Pick → simultaneous Drawing → 15s Adjustment → Final Reveal → next round`

The host relationship stays stable, but drawing parts are reassigned every round. Prompt options carry **semantic part names** instead of exposing technical HEAD/BODY labels. Examples include **Bicycle: Frame + Wheels**, **Astronaut: Helmet + Spacesuit**, **Ice Cream: Scoop + Cone**, and **Umbrella: Canopy + Handle**. All 36 built-in prompts have their own two-part description.

The player assigned the first part gets three prompts from three different themes and may reroll once. The other player watches the same selection live. During Drawing and Adjustment only the selected term and the player-specific part are shown; the theme returns in Final Reveal.

Early submission remains reversible while the other player is still drawing. A player can submit, return to the canvas, edit, and submit again. As soon as **both players are submitted**, Crocat starts Adjustment immediately. Likewise, when both players are Ready in Final Reveal, the next Prompt Select begins immediately.

Online state is server-authoritative and resumable. The active room is stored separately from the recent-room convenience value. On app/browser foreground, reconnect, reload, or a fresh page open, Crocat reloads the active room, reconciles expired server phases, restores the current player/role, and navigates to the correct Lobby, Prompt, Drawing, Adjustment, or Reveal screen. If the room is inactive, the player returns to its lobby. Explicit **Home / Leave** is what clears the active-room pointer.

Realtime Presence now represents **active-in-game** state: backgrounding the app/tab removes the player from active Presence and returning restores it. A new round never starts from Final Reveal while one player is inactive; Crocat visibly waits for that player to return. During Adjustment both players can mark themselves Ready while remaining on the live composition screen. At 2/2 Ready, Final Reveal begins early; otherwise the 15-second Adjustment timer remains authoritative. Prompt, Drawing and Adjustment also expose a compact **Leave Round** control.

The current drawing canvas is also saved locally per round so a reload during an unfinished Drawing phase can restore it. Realtime remains the primary update path; a lightweight active-session watchdog provides recovery when a websocket event was missed or the browser throttled the background tab.

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

The 1.4.3 release passed:

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
