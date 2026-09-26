# Changelog

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
