# Crocat 1.0.0

A first playable prototype of Crocat: a social drawing game where two people draw separate halves of one creature.

## What works

- Expo / React Native / Web project
- Home, mode selection, lobby, drawing, handoff, reveal, finalize and result screens
- HEAD / BODY role flow
- Configurable 1 / 2 / 3 / 5 minute round timer
- Freehand vector drawing via `react-native-svg`
- Undo and clear
- Small color palette
- Final head/body alignment and scaling
- Replay flow
- Friends, gallery and settings navigation
- Draft Supabase multiplayer schema for the next iteration

## Current multiplayer model

Version 1.0.0 is intentionally local: Player 1 draws HEAD, hands the device to Player 2, and Player 2 draws BODY. This lets us validate the core game loop before introducing auth, networking, reconnection and room synchronization.

## Run it

Requires Node.js 22.13+ for Expo SDK 57.

```bash
npm install
npx expo install --fix
npm run start
```

Then:
- press `w` for web
- press `a` for Android
- press `i` for iOS simulator on macOS
- or open through a compatible Expo development client / Expo Go environment

## Main flow

`Home -> Play -> Lobby -> HEAD -> Handoff -> BODY -> Reveal -> Finalize -> Result`

## Project structure

```text
app/                 Expo Router screens
src/components/      reusable Crocat UI and drawing components
src/store/           Zustand game state
src/theme/           visual tokens
src/types/           game/drawing types
supabase/             draft online multiplayer schema
```

## Next iteration

1. Supabase Auth with guest identities
2. real room codes and remote joining
3. Realtime room presence and ready state
4. concurrent HEAD/BODY drawing on separate devices
5. persisted drawings + gallery
6. export/share final Crocat
7. custom Crocat illustrations and final visual identity

## Version

`1.0.0` — first playable product sketch.

## Browser-playable 1.0.0 demo

A self-contained browser build lives in `docs/index.html`. It needs no backend and implements the local pass-the-device flow: Home → Lobby → HEAD → handoff → BODY → Reveal → Align → Result.

Open `docs/index.html` directly in a browser, or publish the repository with the included `.github/workflows/pages.yml` GitHub Pages workflow.
