# Crocat

Crocat is a social drawing game: two people draw separate parts of one creature and only see the combined result at the reveal.

## Stable version: 1.6.5

Public app: https://xcape42.github.io/crocat/

Crocat 1.6.5 hardens touch drawing on Apple mobile browsers: artwork surfaces suppress native WebKit selection, long-press callouts, drag behavior and tap highlighting while Crocat captures drawing gestures itself. The protection stays scoped to drawing/artwork surfaces so normal app text remains unaffected.

### Local Split

Domi draws **HEAD**, then passes the device to Sarah for **BODY**.

`Home → Play → Local → HEAD → Handoff → BODY → Reveal → Finalize → Result`

The drawing connection guide is role-aware:
- HEAD: guide at the bottom
- BODY: guide at the top

### Split Online

Two devices connect through a six-character room code.

`Play Online → Create Room or enter Room Code → room lobby → invite/join through ALL FRIENDS or share code → both players Ready → either player Start → random HEAD/BODY → 15s Prompt Pick → simultaneous Drawing → 15s Adjustment → up to 15s Final Reveal → next round in the same room`

There is no gameplay owner in the lobby. Both room members have the same permissions. HEAD/BODY are randomized server-side every round. The current HEAD player receives three prompts from three different themes and has 15 seconds to choose. HEAD may reroll all three exactly once; rerolled terms never repeat the previous three. If no choice is made, the server randomly selects one of the currently visible options. The active catalog contains 60 curated prompts in **Mystisch, Fantasy, Natur, Elegant and Genuss**, with 12 prompts per theme.

The BODY player sees the same prompt-selection screen live, but cannot choose or reroll. Each option also shows its split labels. As soon as HEAD chooses a prompt, the server switches to Drawing immediately and the other client resynchronizes as soon as its realtime subscription is live. During Drawing and Adjustment each player sees the selected term plus the semantic label for their assigned half; the theme is hidden again until the Final Reveal.

Early drawing submission remains reversible while the other player is still drawing. A player can submit, see whether the other player has submitted, return to the canvas before the drawing deadline, and submit a newer version. As soon as **both** players are submitted, the server ends Drawing immediately and starts Adjustment; the drawing deadline remains the fallback when both are not finished early. The final seconds are visually emphasized.

During Adjustment each player can drag and zoom only their own part. Each player can also mark themselves Ready without hiding the shared composition. 1/2 Ready keeps Adjustment running; 2/2 Ready starts Final Reveal immediately. Final Reveal shows both the selected term and its theme. Both players can press Ready Next Round; the next round starts only while both players are actively present in Crocat. If one player is away, the game visibly waits for them.

Pressing **Play Online** opens the explicit online entry screen again, where the player chooses **Create Room** or enters a six-character room code. The six-character room code remains shareable through the same direct-link flow; A direct `/online/room/CODE` link still atomically creates that exact missing room, rejoins an existing member even after the round has started, or joins an available waiting room. Full rooms, invalid codes, already-started rooms for outsiders, or link-resolution failures return to Play instead of leaving a broken room screen. The GitHub Pages build uses Expo Router's single-page web output plus a `404.html` app fallback, so copied room URLs can be opened directly and reloaded. Players can leave the room from Prompt Select, Drawing, Adjustment and Final Reveal. Prompt Select, Drawing and Adjustment ask for confirmation before the round is abandoned; Final Reveal exits directly. In the waiting lobby, either of the two equal room members can remove the other player through the small × action after confirming the removal. Timers are deadline-based, use one centered countdown presentation, and backgrounding the browser/app does not pause the game clock. Online countdowns calibrate against the Supabase server clock, so different device clocks cannot make two players see different remaining times. Realtime Presence also marks a backgrounded player inactive for the next-round gate. Active room membership sends a lightweight heartbeat every 20 seconds; a database cleanup job runs every minute and removes rooms only when no player has been seen for at least one minute, so brief connection drops do not immediately destroy a room.

### Profiles, Friends and Gallery

Every anonymous Crocat session now owns a persistent profile with a free 2–18 character name, one of seven colors, three avatar shapes, two avatar themes and five personal symbols. The symbol remains an owner-only profile detail for now and is not shown in shared small avatars. Profiles expose a stable eight-character Friend Code so editable or duplicate display names never become identity keys. The same profile component is reused in rooms, friend cards, invitations and artwork history. The two theme choices are application themes rather than character skins: **Paper** keeps the warm handmade Crocat surface, while **Ink** uses a cooler graphic palette, different accents and subtle background marks. This intentionally stays separate from the future customizable-character system.

Friends are mutual server-side relationships. Accepted friends show profile details, online/last-seen state derived from the same heartbeat used by multiplayer, a small friendship level derived from completed rounds together, and an open waiting-room code when one is joinable. Friends are reached from **Home → Friends** or from inside a solo online lobby. Inside a solo online lobby, the friend strip stays hidden; **ALL FRIENDS** is the single entry point for browsing, joining or inviting friends. When opened from an existing lobby, pressing **INVITE** only creates the invitation for that exact room and leaves the current room untouched. Outside a room, **INVITE** still creates or reuses a waiting lobby, navigates the inviter there, and sends the invitation. The Friends screen separates Online and Offline friends into distinct groups. Switching to a friend's open lobby atomically dissolves the caller's old solo lobby, while a lobby that already contains another player is never silently abandoned. Players in the same lobby can send or accept a friend request directly on the player card. Lobby invitations are delivered through Supabase Realtime and surfaced globally whenever the recipient is not already inside another room.

During Final Reveal, either participant can star the result. The server stores the vector drawings, final HEAD/BODY transforms, prompt metadata and profile snapshots for both artists. Each owner gets a private gallery copy with a deterministic Crocat title such as `Coole Erdbeere 7`. Saved works can be renamed, favorited, deleted and exported as the actual composed SVG rather than as a UI screenshot.

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

The 1.6.3 release validation includes:

- dependency install
- online-entry/social UX contract: Play has no friend strip, room-code regeneration is absent from current clients, room friends stay behind ALL FRIENDS, and personal symbols stay out of shared avatars
- TypeScript
- Expo Doctor
- production Expo web export with verified GitHub Pages direct-link fallback
- automated server-synchronized timer smoke coverage with artificial +120s / -90s client clock skew
- automated social profile and gallery smoke coverage for profile persistence, RLS, lobby add-friend, friendship levels, presence, open-lobby discovery, side-effect-free existing-room invites, atomic friend-lobby switching, realtime invites, auto-created invite rooms and private artwork CRUD
- automated Supabase multiplayer smoke coverage for equal-player settings, 2/2 lobby Ready, start permissions, leave/replacement behavior, direct-link create/join/rejoin/full/started-room behavior, prompt flow, immediate two-submit handoff, Adjustment Ready and heartbeat
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

Game-specific settings live in the game lobby. For Online Split, both players can edit them while the room is waiting. Changing a room setting clears both Ready states so both players explicitly confirm the new configuration before either player can start.

Local Split also exposes its round duration in its local lobby.
