# Changelog

## 1.8.0 — Compact 3:4 Crocat composition

- Keep the individual Drawing Canvas unchanged at 360 × 380
- Change the current final composition from 360 × 760 to 360 × 480 for an exact 3:4 artwork ratio
- Move the HEAD connection anchor to y=240 and BODY connection anchor to y=140
- Clip the final composition to a controlled 20px overlap around final y=240 instead of overlapping both full drawings
- Preserve original stroke coordinates and avoid any vertical or horizontal distortion
- Render BODY first and HEAD above it deterministically inside the overlap zone
- Recalculate preview drag mapping for the 360 × 480 virtual final space
- Share bounded transform clamping between Local and Online Adjustment
- Move the drawing guide 140px inward from each connection edge
- Add subtle connection-zone treatment without blocking drawing interaction
- Add curated hard, soft and none Connection Guide modes to the 60-prompt catalog
- Use dashed guides for clear physical joins, subtle side markers for loose joins and no visual guide for prompts such as Sushi, Macaron and Donut
- Keep Local Split on the clear HEAD/BODY hard guide
- Version saved-artwork geometry so existing v1 360 × 760 gallery items remain unchanged
- Save new Crocat 1.8.0 artwork as geometry v2 and render/export it at 360 × 480
- Keep the legacy one-argument save_artwork RPC compatible through a default geometry version
- Make Gallery thumbnails, detail views and SVG export resolve the stored geometry version
- Preserve canvas PanResponder behavior, iOS/WebKit artwork locks, Worlds, Reliable Phase Sync, Presence, Ready and timers
- No Live Drawing / stroke streaming added
- Align package, Expo and visible app versions to 1.8.0


## 1.7.2 — Flash-free World bootstrap

- Fix the visible default/Moss flash before a user's persisted Crocat World is applied
- Add an explicit themeReady bootstrap state so the internal fallback theme is never treated as visible resolved identity
- Race the local last-confirmed World cache against the authoritative profile request at app root
- Show a neutral non-World Crocat bootstrap surface when no cached World exists yet
- Keep the server profile authoritative and use AsyncStorage only as a first-frame bootstrap cache
- Normalize legacy Paper/Ink cache values before any World UI is rendered
- Add a theme revision guard so a late bootstrap response cannot overwrite a newer Profile-screen choice
- Let Profile World previews update the current UI immediately without persisting an unsaved preview into the bootstrap cache
- Stop Online Entry from independently deriving or setting the app World during mount
- Separate one-time theme bootstrap from room/profile presence heartbeat behavior
- Preserve Deep Links, Reduced Motion, Canvas sizing/touch behavior and the Reliable Phase Sync layer
- Add architecture-contract coverage for readiness gating, cache/server bootstrap priority and screen-level theme ownership
- No Supabase migration required
- Align package, Expo and visible app versions to 1.7.2


## 1.7.1 — Reliable online phase synchronization

- Keep Supabase Realtime as the primary low-latency multiplayer path
- Add one shared Reliable Phase Sync safety layer for Lobby, Prompt, Drawing, Adjustment and Final Reveal
- Reconcile the authoritative server phase on mount and at a low-frequency active-game interval
- Reconcile immediately when the native app returns active, the browser tab becomes visible, the window regains focus or connectivity returns
- Reconcile Adjustment immediately whenever its Realtime channel reaches SUBSCRIBED, including reconnects
- Use a lightweight room + latest-round snapshot instead of repeatedly loading player profile or social metadata
- Keep fallback reconciliation non-fatal during transient network loss so a temporary connection issue cannot throw a player out of the game
- Derive HEAD/BODY from the authoritative current round when recovering navigation
- Preserve direct action refreshes and Realtime events as the fast path
- Add UI-contract coverage proving every online phase uses the shared recovery layer
- No Supabase schema migration required
- Align package, Expo and visible app versions to 1.7.1


## 1.7.0 — Crocat Worlds

- Establish a central Crocat World model instead of adding screen-specific theme variants
- Add three distinct Worlds: Moss Garden, Moon Milk and Candy Blob
- Keep legacy Paper/Ink profiles compatible by mapping them to Moss/Moon
- Make Screen, CrocatButton, CrocatCard, Canvas frames, dialogs, timers and room controls World-aware
- Add a reusable Mascot with idle, happy, waiting, drawing, nervous, celebrate and sleeping states
- Add reusable MascotSlot, DecorationLayer and centralized motion tokens
- Respect the platform Reduced Motion preference and keep functional state understandable without animation
- Replace the temporary Home image asset with the reusable World mascot system
- Make Home, Play, Profile, Friends, Gallery and Online Entry visibly reflect the selected World
- Add PlayerPod as the reusable player-identity presentation for avatar, World mascot, Ready, Presence and role
- Rework Lobby presentation around the player collection rather than bespoke Host/Guest cards while preserving the current two-player backend rules
- Show both player Worlds and mascots together in the online lobby and Final Reveal
- Keep Prompt animation restrained, Drawing nearly decoration-free and Adjustment interaction-focused
- Preserve canvas dimensions, coordinate system, drag/zoom behavior and the iOS/WebKit selection lock
- Extend profile theme validation to moss/moon/candy while keeping paper/ink accepted for older clients
- Avoid a separate mascot database field; mascot identity is derived deterministically from the persisted World
- Add CI contract coverage for World switching, reusable player pods, mascots, decorations, Reduced Motion and iOS canvas protection
- Align package, Expo and visible app versions to 1.7.0


## 1.6.6 — Home mascot image asset

- Replace the ASCII Home mascot with a real React Native `Image`
- Add a local transparent PNG sample asset at `assets/images/crocat-home-example.png`
- Keep the existing circular moss hero treatment, border and slight rotation
- Make the image scale responsively inside the existing Home hero container
- Remove the obsolete ASCII face/body styles
- Keep the asset local so Web and mobile do not depend on a remote image URL
- Make future mascot changes a simple asset replacement at the same path
- No Supabase migration required
- Align package, Expo and visible app versions to 1.6.6


## 1.6.5 — iOS drawing interaction hardening

- Prevent iOS/WebKit from selecting or highlighting drawn strokes during touch drawing
- Disable WebKit long-press callouts, native drag behavior and tap highlight only on artwork surfaces
- Keep normal app text selectable by scoping the gesture lock to DrawingCanvas and DrawingPreview
- Capture drawing gestures before the browser can take ownership of the touch sequence
- Prevent native browser gesture takeover during interactive artwork adjustment as well
- Reuse one shared artwork interaction lock instead of scattering browser-specific CSS across screens
- Add CI contract coverage for the iOS/WebKit interaction protections
- No Supabase migration required
- Align package, Expo and visible app versions to 1.6.5


## 1.6.4 — Room controls, confirmed leave and reliable back navigation

- Add a small remove-player × action beside the other player in a waiting online lobby
- Require confirmation before removing another player and keep lobby permissions equal for both members
- Add an authenticated room-player kick RPC limited to waiting rooms, with membership checks, self-kick rejection, ready reset and compatibility host transfer
- Refresh room clients through Realtime after removal so the removed player is routed out of the room immediately
- Confirm early leave from Online Prompt, Drawing and Adjustment before ending the current round
- Confirm early leave from active Local Split stages as well
- Keep Final Reveal / final result exit direct, without an extra confirmation
- Move back navigation into the shared Screen shell so every non-Home screen has a top-left back action
- Fall back to Home whenever no navigation history is available
- Preserve contextual labels such as HOME, PLAY, MODES, ROOM and GALLERY on existing navigation surfaces
- Add multiplayer smoke coverage for self-kick rejection, outsider rejection, removal cleanup, RLS visibility and later rejoining
- Add the production Supabase migration and update the schema snapshot
- Align package, Expo and visible app versions to 1.6.4


## 1.6.3 — Simpler play, fixed room code and private symbols

- Remove the friend quick strip and all friend loading/subscriptions from the Play screen
- Keep friends reachable from Home → Friends and through ALL FRIENDS inside a solo online room
- Remove room-code regeneration from the room UI and current client API
- Keep the legacy server RPC temporarily for compatibility with already-loaded older web clients
- Make shared ProfileAvatar instances hide the personal symbol by default
- Keep the symbol visible in the owner's Profile editor and preserve it in the profile model for future character customization
- Remove the personal symbol from friend and artwork partner metadata
- Delete the now-unused FriendQuickBar component
- Update CI contract coverage to prevent friend-strip, code-regeneration and shared-symbol regressions
- No Supabase migration required
- Align package, Expo and visible app versions to 1.6.3

## 1.6.2 — Stable invites and clearer friend groups

- Keep the 1.6.1 explicit Create / Join online entry flow unchanged
- Make INVITE from ALL FRIENDS inside an existing lobby side-effect free for the inviter
- Do not navigate, recreate, replace or leave the current room when inviting from that room
- Keep the recipient's existing realtime lobby-invite popup behavior
- Keep INVITE outside a room creating/reusing a waiting lobby, navigating the inviter there and sending the invitation
- Remove the obsolete returnCode navigation parameter from room-context invites
- Group accepted friends into clear ONLINE and OFFLINE sections
- Sort online friends with joinable open lobbies first and offline friends by most recent activity
- Add CI contract coverage for both invite contexts and Online/Offline grouping
- Strengthen the social smoke test to assert that an existing-room invite preserves room id, code, status and member count
- No Supabase schema or RPC migration required; the existing invite RPC was verified transactionally as side-effect free
- Align package, Expo and visible app versions to 1.6.2

## 1.6.1 — Classic online entry, cleaner lobby

- Keep the 1.6.0 friend-first Play screen and one-tap friend shortcuts
- Make PLAY ONLINE open the explicit Create Room / Join Room screen again
- Do not create or reuse a room merely by opening the Online screen
- Keep remembered room-code prefilling and direct room-link behavior
- Remove the inline friend strip from the room lobby
- Keep ALL FRIENDS as the single friend-browsing action inside a solo waiting lobby
- Preserve direct Add Friend / Accept Friend and friendship level state for the player currently in the room
- Preserve room-code regeneration, equal-player Ready/settings/start behavior and all 1.6.0 social backend functions
- Add a CI UX-contract check so automatic online-room creation or inline room friend strips cannot return accidentally
- Align package, Expo and visible app versions to 1.6.1

## 1.6.0 — Friend-first play, social lobbies and app themes

- Make Online the primary mode on Play and keep Local Split directly underneath
- Show a compact friend strip at the top of Play with avatar, online state, friendship level and JOIN / INVITE state
- Let one tap on an online friend join their free waiting lobby when available
- Otherwise create or reuse the player's own waiting lobby and send that friend an invitation
- Make PLAY ONLINE open or reuse the player's online lobby immediately instead of showing a separate create/join form
- Preserve shareable six-character room links and direct-link create/join/rejoin behavior
- Allow a solo waiting player to regenerate the room code without replacing the room
- Show the same online-friend strip inside a solo waiting lobby
- Atomically dissolve a player's old solo lobby when switching into a friend's open lobby
- Refuse silent lobby switching when the current lobby already contains another player or an active game
- Allow lobby players to send or accept a friend request directly from the other player's card
- Show accepted friendship and a lightweight friendship level directly in the lobby and Friends screen
- Derive friendship progress from completed rounds together: NEW FRIEND, DRAW BUDDIES and CROCAT CREW
- Keep friendship progress normalized instead of storing a second mutable counter
- Turn PAPER and INK into actual application themes with different surfaces, primary/accent colors and subtle decorative patterns
- Keep avatar/color/symbol profile identity separate from the application theme so future customizable characters can evolve independently
- Add authenticated scoped RPCs for friend-by-user requests, online-lobby reuse, safe room-code regeneration and atomic friend-lobby joins
- Extend the social smoke suite for lobby reuse, code regeneration, lobby add-friend, friendship progress and safe friend-lobby switching
- Preserve equal-player Ready/settings/start behavior, server-synchronized timers, Presence, Realtime, direct links and the private artwork gallery
- Align package, Expo and visible app versions to 1.6.0

## 1.5.1 — Server-synchronized online timers

- Keep all multiplayer phase deadlines authoritative on Supabase
- Add a read-only authenticated `server_clock_ms()` RPC for client clock calibration
- Calibrate online clients from three server-clock samples and use the lowest-latency sample
- Calculate Prompt, Drawing, Adjustment and Final Reveal countdowns against synchronized server time instead of raw device `Date.now()`
- Prevent a device with a fast local clock from advancing a phase before server-clock synchronization succeeds
- Re-sync the server clock after app/browser foregrounding and periodically during long rounds
- Keep Local Split timers on local device time; no local-game behavior changed
- Add an automated timer smoke test that simulates clients whose clocks are +120 seconds and -90 seconds wrong
- Preserve all Crocat 1.5.0 profile, friends, gallery, room, Presence and Realtime behavior
- Align package, Expo and visible app versions to 1.5.1

## 1.5.0 — Profiles, friends and private artwork gallery

- Add persistent profiles for anonymous users with a free name, 7 colors, 3 avatars, 2 profile themes and 5 symbols
- Add a stable eight-character Friend Code independent of editable display names
- Reuse one ProfileAvatar presentation in profiles, rooms, friends, invitations and artwork history
- Replace hard-coded online player names with the current persistent profile name
- Reuse the existing 20-second room heartbeat for profile last-seen state and add the same heartbeat outside rooms
- Add mutual friend requests with accept, decline, cancel and remove flows
- Show friend avatar, subtle profile traits, online/last-seen state and joinable waiting-room status
- Allow direct joining of a friend's open lobby
- Allow inviting a friend from an existing lobby
- Allow inviting a friend from the Friends list and atomically create/reuse an open lobby when needed
- Deliver lobby invites through Supabase Realtime and surface them globally when the recipient is outside a room
- Add private saved artworks from Online Final Reveal with deterministic Crocat names and artist profile snapshots
- Keep one private gallery copy per participant and prevent duplicate saves for the same owner/round
- Add gallery cards, detail view, rename, favorite/unfavorite and delete actions
- Export the exact final vector composition as SVG on web and through the native save/share flow on iOS and Android
- Share the same drawing composition geometry between preview, gallery thumbnails and export
- Add RLS and scoped authenticated RPCs for profiles, friendships, invitations and saved artworks
- Add Realtime publication for profiles, friendships and lobby invites
- Add covering indexes for all newly introduced foreign-key access paths
- Add transactional rollback assertions before production migration
- Add an automated multi-client social/gallery smoke test alongside the existing full multiplayer smoke
- Keep Crocat 1.4.9 equal-player rooms, direct links, timers, Presence and cleanup behavior intact
- Align package, Expo and visible app versions to 1.5.0

## 1.4.9 — Equal lobby players

- Remove gameplay ownership from the online waiting room
- Let both room members change game settings while waiting
- Reset both Ready states whenever either player changes a room setting
- Require both players to mark themselves Ready before a round can start
- Let either Ready player start once the lobby is 2/2 Ready and both players are active
- Remove HOST / guest-only lobby labels and controls from the UI
- Keep HEAD/BODY independent from lobby identity and randomized server-side every round
- Keep the room alive when either player leaves while the other remains
- Return an interrupted active round to the waiting lobby when one player leaves
- Allow a replacement player to join the remaining player without lobby-role collisions
- Retain rooms.host_id only as a compatibility reference; it grants no lobby privileges
- Ship the backend transition in two forward migrations so the deployed 1.4.8 client stays playable during rollout
- Add rollback-tested and automated smoke coverage for equal settings, Ready, Start, leave and replacement behavior
- Align package, Expo and visible app versions to 1.4.9

## 1.4.8 — Shareable, reload-safe room links

- Make `/online/room/CODE` use the same atomic join-or-create backend flow as manual room-code entry
- Create the requested valid room automatically when a shared code does not exist yet
- Rejoin an existing membership through the same URL, including after a browser reload during an active round
- Join a free waiting room from a copied room URL without requiring prior Crocat navigation
- Redirect invalid codes, full rooms, outsider access to already-started rooms and room-link failures to Play
- Add a Copy Link action beside the existing Copy Code action
- Switch the web export to Expo Router single-page output for arbitrary dynamic room-code routes
- Add a GitHub Pages `404.html` app fallback so direct room URLs and reloads bootstrap Crocat correctly
- Add CI verification for the Pages fallback and multiplayer smoke coverage for direct-link create, join, rejoin, full-room and started-room cases
- Keep the production Supabase schema and existing room lifecycle unchanged
- Align package, Expo and visible app versions to 1.4.8

## 1.4.7 — Exact phase timers and selection-safe canvas interaction

- Derive every visible countdown directly from the current deadline on every render
- Remove transient stale countdown values when a phase switches deadlines
- Keep deadline completion synchronized after backgrounding and foregrounding
- Simplify the local Timer so it no longer resets its own deadline after render
- Start Final Reveal with a fresh 15-second server deadline when Final Reveal actually begins
- Stop precomputing Final Reveal and next-round deadlines during Adjustment
- Keep Adjustment at a server-authoritative 15 seconds whether entered early or by deadline
- Keep Prompt Pick and Drawing on their existing server-authoritative deadlines
- Disable browser text selection across Crocat screens
- Explicitly suppress browser selection and touch gestures while drawing on the canvas
- Make the room code the only deliberately selectable text and add a universal Copy Code button
- Align package, Expo and visible app versions to 1.4.7

## 1.4.6 — Curated aesthetic prompts and semantic split labels

- Replaced the previous 36 concrete prompts with a fully curated 60-prompt catalog
- Use five balanced themes with 12 prompts each: Mystisch, Fantasy, Natur, Elegant and Genuss
- Keep internal multiplayer roles as HEAD/BODY while giving each prompt server-authoritative display labels
- Use Kopf/Körper for character and creature prompts
- Use Oberer Teil/Unterer Teil as the default object split
- Add natural special splits where they improve drawing clarity, including Kugel/Ständer, Pflanze/Topf, Blüte/Vase, Statue/Sockel and Tasse/Untertasse
- Include split labels inside each server-generated prompt option so both players receive the same definition
- Show semantic split labels in Prompt Pick, Drawing and Adjustment without changing the underlying game-role logic
- Preserve three distinct prompt themes per choice and the existing one-time reroll behavior
- Keep Presence, heartbeat, room cleanup, join/create, navigation, drawing canvas, timers, Ready and Realtime architecture unchanged
- Align package, Expo and visible app versions to 1.4.6

## 1.4.5 — Immediate handoffs, direct room links and stale-room cleanup

- Start Drawing immediately when HEAD chooses a prompt
- Resynchronize a round as soon as its Realtime subscription becomes active, covering fast prompt choices before the peer fully subscribes
- Start Adjustment immediately when both players have submitted their drawings
- Keep reversible early submission while only one player is submitted
- Keep the drawing deadline as the fallback when both players are not finished early
- Make direct /online/room/CODE links join or rejoin the room before loading protected room data
- Send unavailable, invalid, started-for-nonmembers or full direct room links back to Home
- Add a lightweight 20-second heartbeat for the active online room
- Add last_seen_at tracking to room membership
- Run stale-room cleanup once per minute and delete a room only when no player heartbeat has been seen for at least one minute
- Keep explicit host leave behavior and guarantee truly empty rooms are deleted
- Add smoke coverage for heartbeat, full-room rejection and immediate two-submit phase transition

## 1.4.4 — 1.4.0 baseline with active-player gating and in-round controls

- Kept the Crocat 1.4.0 gameplay flow as the baseline
- Added active-app Presence tracking for round boundaries
- Prevent the initial round and subsequent rounds from starting while one player is inactive
- Show which player is currently away and explicitly wait for them
- Added Leave Round controls during Prompt Select, Drawing, submitted-waiting and Adjustment
- Added Ready during Adjustment while keeping the shared live composition visible
- Keep Adjustment running at 1/2 Ready and advance immediately to Final Reveal at 2/2 Ready
- Keep the original Adjustment timer as the fallback when both players do not ready early
- Standardized Prompt, Drawing, Adjustment and Final Reveal on the shared centered countdown badge
- Normalize countdown values defensively to avoid malformed timer output
- Added smoke coverage for 1/2 and 2/2 Adjustment Ready transitions
- Kept session-recovery and semantic prompt-label changes from the abandoned 1.4.1–1.4.3 line out of this release

## 1.4.0 — Random roles, prompt themes and reversible submissions

- Randomize HEAD and BODY server-side for every online round, independent of host/guest
- Keep Domi/Sarah identity separate from per-round drawing role
- Added a synchronized 15-second Prompt Select phase before every online drawing round
- Added six prompt themes: Animals, Professions, Food, Fantasy, Vehicles and Objects
- Present exactly three prompt options from three different themes
- Allow the HEAD player to choose the prompt
- Allow exactly one HEAD reroll per round
- Guarantee rerolled terms do not repeat the previous three
- Automatically choose one of the currently visible three prompts when the 15-second deadline expires
- Let BODY observe the full prompt-selection flow live without interaction rights
- Show only the chosen term during Drawing and Adjustment
- Reveal both theme and term in Final Reveal
- Make early drawing submission reversible until the drawing deadline
- Keep the last submitted version as a safe server-side fallback
- Show whether the other player is still drawing or has submitted
- Do not start Adjustment merely because both players submitted early
- Advance to Adjustment only after the actual drawing deadline
- Added stronger visual urgency during the final 10 and 5 seconds
- Hardened transform ownership against randomized roles
- Added indexes for per-round HEAD/BODY foreign keys
- Added end-to-end smoke coverage for prompt permissions, reroll uniqueness, resume/resubmit, deadline gating and prompt timeout

## 1.3.3 — Game settings belong to the room

- Removed round duration from the global Home Settings screen
- Reserved Home Settings for future app-wide preferences such as theme, sound and accessibility
- Added a reusable Game Settings panel to local and online lobbies
- Moved Local Split round duration into the local lobby
- Added host-editable Online Split round duration in the waiting room
- Guests see the current room configuration read-only
- Added host-only server authorization for room setting changes
- Reset guest Ready whenever the host changes a room setting
- Realtime room updates keep the guest configuration view synchronized
- Added smoke coverage for host-only settings, Ready reset and actual round-duration application

## 1.3.2 — Join-or-create rooms, remembered codes and reveal Ready

- Entering a six-character room code now joins an existing room or creates that exact room if it does not exist
- Serialized join-or-create operations per room code to avoid concurrent duplicate creation
- Kept the existing random Create Room flow
- Remember the most recently opened online room code with AsyncStorage
- Prefill the remembered code on future online sessions
- Allow both players to toggle Ready during the 15-second Final Reveal
- Show a shared 0/2, 1/2 or 2/2 Ready state
- Start the next drawing round immediately when both players are Ready
- Keep the 15-second automatic next-round fallback when they are not both Ready
- Preserve the guest-only Ready / host Start rule in the initial lobby
- Added two-client smoke coverage for join-or-create and early Final Reveal skip

## 1.3.1 — Host start flow and background-safe timers

- Removed the Ready control from the online host
- Kept Ready exclusively on the joining player
- Host Start stays disabled until the guest is ready, then becomes active
- Enforced the guest-only Ready rule server-side
- Prevented the host from starting before the guest is ready
- Reworked the shared timer to calculate from an absolute deadline instead of decrementing local seconds
- Online drawing now uses the server round `ends_at` timestamp directly
- Adjustment and Final Reveal now share the same deadline-countdown implementation
- Resynchronize countdowns when the app returns to the foreground so background throttling cannot extend a round
- Kept Local Split behavior intact while making its drawing timer deadline-based too
- Added smoke coverage for host Ready rejection and guest-gated round start

## 1.3.0 — Simultaneous online adjustment

- Added a synchronized 15-second Adjustment phase after both drawings are submitted
- Domi can move/zoom only HEAD; Sarah can move/zoom only BODY
- Reused the local drag-and-drop + zoom interaction model for online play
- Broadcast live transform changes between both clients during Adjustment
- Persist each player's final transform server-side with role ownership checks
- Added strict transform validation and scale/position bounds
- Added server-synchronized adjustment and final-reveal deadlines
- Added a locked 15-second Final Reveal after Adjustment
- Removed the between-round Ready check from online play
- Automatically start the next drawing round after Final Reveal in the same room
- Kept Home / Leave as the explicit way to exit the persistent room
- Added end-to-end smoke coverage for Broadcast, role isolation, transform persistence and the 15s + 15s phase flow

## 1.2.0 — Persistent online rooms

- Kept both online players in the same room across consecutive rounds
- Added a next-round Ready check directly on the reveal screen
- Start the next round immediately when both players are Ready
- Added synchronized 30-second automatic continuation when both players remain in the room
- Reset Ready state for every new round
- Added explicit Home / Leave behavior instead of returning to the online entry screen after every round
- If the joining player leaves, the host stays in the same room and returns to the lobby
- If the host leaves, the room is closed
- Hardened host awareness of player joins with Postgres Changes, Presence join/sync refreshes and a visible join notice
- Made round subscriptions react to room and membership changes as well as drawing submissions
- Added server-side idempotency so simultaneous next-round requests cannot create duplicate rounds

## 1.1.3 — Standardized game surface

- Introduced one shared sizing system for every visible game canvas
- Drawing canvas target height: 340px on standard phones, 300px on short phones, 380px on medium screens, 420px on desktop
- Full Crocat preview target height: 460px on standard phones, 360px on short phones, 500px on medium screens, 560px on desktop
- Changed canvas sizing from viewport percentages to preferred-size + shrink-to-fit behavior
- Canvas now measures the actually available play area between headers, controls and action buttons
- Prevented large screens from making the game canvas unnecessarily huge
- Prevented standard mobile screens from defaulting to an unnecessarily small canvas
- Applied the same sizing rules to local drawing, online drawing, final alignment, online reveal and final result
- Made the covered reveal frame use exactly the same game-surface size as the revealed Crocat
- Final result now stays inside a fixed game viewport instead of relying on page scrolling

## 1.1.2 — Final alignment polish

- Kept direct drag-and-drop for HEAD and BODY
- Removed directional nudge buttons; final alignment now exposes zoom controls only
- Simplified HEAD/BODY drag labels and removed their visible background treatment
- Aligned the original HEAD bottom guide and BODY top guide to the same gray reveal line
- Added the intended 40px overlap around the reveal seam instead of leaving a gap
- Changed zooming to scale around each half's connection anchor so the seam stays aligned while zooming

## 1.1.1 — Mobile layout and touch fixes

- Fixed scrolling on standard mobile screens so bottom actions remain reachable
- Kept drawing and image-manipulation screens fixed to the viewport without scrolling
- Made drawing canvases responsive to small mobile and desktop viewports
- Made reveal/result previews responsive instead of enforcing a fixed 520px minimum height
- Kept the complete final-alignment workspace, controls and action button visible in one viewport
- Removed the horizontal control scroller in Finalize
- Added direct mouse/touch dragging for HEAD and BODY during final alignment
- Added browser touch-gesture protection during direct image manipulation
- Applied the same viewport rules to online drawing and online reveal
- Allowed result actions to wrap on narrow screens

## 1.1.0 — Online multiplayer

- Kept the complete local Split mode
- Removed pre-game nickname entry
- Set sample players to **Domi = HEAD** and **Sarah = BODY**
- Added role-specific connection guides: HEAD bottom, BODY top
- Added anonymous guest identities through Supabase Auth
- Added create/join online rooms with six-character codes
- Added Realtime Presence for room connectivity
- Added ready state and host-controlled round start
- Added concurrent HEAD and BODY drawing on separate devices
- Added server-authorized drawing submissions
- Added automatic synchronized reveal once both halves arrive
- Added explicit RLS + Data API grants
- Added Free-plan Supabase production backend
- Added production Expo web export and GitHub Pages deployment
- Added automated Domi/Sarah two-client backend smoke test
- Added CI for dependency locking, TypeScript, Expo Doctor and web export

## 1.0.0 — First playable sketch

- Universal Expo / React Native / Web foundation
- Original **Split** mode
- HEAD/BODY pass-the-device flow
- Freehand vector drawing with color palette, undo and clear
- Adjustable round duration
- Reveal and manual final alignment
- Result and replay flow
- Friends, Gallery and Settings entry points
- Supabase multiplayer schema scaffold
- Git `main` / `dev` workflow
