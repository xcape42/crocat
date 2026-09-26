# Changelog

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
