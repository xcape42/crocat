import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const home = read('app/index.tsx');
const play = read('app/play.tsx');
const entry = read('app/online/index.tsx');
const room = read('app/online/room/[code].tsx');
const friends = read('app/friends.tsx');
const profile = read('app/profile.tsx');
const multiplayer = read('src/features/multiplayer/room.ts');
const drawingCanvas = read('src/components/DrawingCanvas.tsx');
const drawingToolbar = read('src/components/DrawingToolbar.tsx');
const drawingTools = read('src/theme/drawingTools.ts');
const gameTypes = read('src/types/game.ts');
const drawingPreview = read('src/components/DrawingPreview.tsx');
const interaction = read('src/theme/interaction.ts');
const worlds = read('src/theme/worlds.ts');
const screen = read('src/components/Screen.tsx');
const mascot = read('src/components/Mascot.tsx');
const mascots = read('src/theme/mascots.ts');
const palette = read('src/theme/palette.ts');
const inviteBanner = read('src/components/LobbyInviteBanner.tsx');
const artworkDetail = read('app/artwork/[id].tsx');
const decoration = read('src/components/DecorationLayer.tsx');
const playerPod = read('src/components/PlayerPod.tsx');
const reducedMotion = read('src/hooks/useReducedMotion.ts');
const profileOptions = read('src/features/profile/options.ts');
const reveal = read('app/online/reveal.tsx');
const prompt = read('app/online/prompt.tsx');
const draw = read('app/online/draw.tsx');
const localDraw = read('app/draw.tsx');
const adjust = read('app/online/adjust.tsx');
const phaseSync = read('src/hooks/useReliablePhaseSync.ts');
const realtime = read('src/features/multiplayer/realtime.ts');
const rootLayout = read('app/_layout.tsx');
const uiThemeStore = read('src/store/uiThemeStore.ts');
const themeCache = read('src/features/profile/themeCache.ts');
const gallery = read('app/gallery.tsx');
const handoff = read('app/handoff.tsx');
const localReveal = read('app/reveal.tsx');
const result = read('app/result.tsx');
const currentProfileVisual = read('src/hooks/useCurrentProfileVisual.ts');
const profileWorldPicker = read('src/components/ProfileWorldPicker.tsx');
const profileCharacterPicker = read('src/components/ProfileCharacterPicker.tsx');

assert(
  play.includes("router.push('/online')"),
  'PLAY ONLINE must navigate to the online entry screen.',
);

assert(
  entry.includes('createRoom(')
    && entry.includes('joinOrCreateRoom(')
    && entry.includes('CREATE ROOM')
    && entry.includes('JOIN / CREATE ROOM'),
  'Online entry must expose explicit create and join/create actions.',
);

assert(
  !entry.includes('openOrCreateRoom('),
  'Opening the online entry screen must not create or reuse a lobby automatically.',
);

assert(
  currentProfileVisual.includes('ensureCurrentProfile()')
    && currentProfileVisual.includes('profileToVisual(current)')
    && home.includes('profile={profile ?? undefined}')
    && play.includes('profile={profile ?? undefined}')
    && entry.includes('profile={profile ? profileToVisual(profile) : undefined}')
    && gallery.includes('profile={profile ?? undefined}')
    && handoff.includes('profile={profile ?? undefined}')
    && localReveal.includes('profile={profile ?? undefined}')
    && result.includes('profile={profile ?? undefined}'),
  'Home, Play, Online entry and remaining local identity screens must render the current personal mascot instead of a generic blob.',
);

assert(
  !room.includes('FriendQuickBar'),
  'Room must not render an inline friend strip.',
);

assert(
  room.includes('ALL FRIENDS'),
  'Solo waiting room must expose the ALL FRIENDS action.',
);

assert(
  room.includes('FRIENDS · LV')
    && room.includes('+ ADD FRIEND')
    && room.includes('+ ACCEPT FRIEND'),
  'Room must keep direct relationship state for the current opponent.',
);

assert(
  !room.includes('returnCode: room.code')
    && !friends.includes('returnCode'),
  'Room-context invites must not carry a navigation return code.',
);

assert(
  friends.includes('if (inviteRoomId)')
    && friends.includes('await inviteFriend(friend.friend_user_id, inviteRoomId)')
    && friends.includes("setNotice('INVITE SENT TO '"),
  'Inviting from an existing room must only create the invite and stay on Friends.',
);

assert(
  friends.includes('const ticket = await inviteFriend(friend.friend_user_id, null)')
    && friends.includes("router.replace('/online/room/' + ticket.code)"),
  'Inviting outside a room must still create/reuse a lobby and navigate into it.',
);

assert(
  friends.includes('ONLINE · {onlineFriends.length}')
    && friends.includes('OFFLINE · {offlineFriends.length}'),
  'Friends must be visibly grouped into online and offline sections.',
);

assert(
  !play.includes('FriendQuickBar')
    && !play.includes('listFriends(')
    && !play.includes('inviteFriend(')
    && !play.includes('joinFriendLobby('),
  'Play must not surface or load the friends list.',
);

assert(
  !room.includes('NEW CODE')
    && !room.includes('regenerateRoomCode')
    && !multiplayer.includes('regenerateRoomCode'),
  'Current clients must not expose room-code regeneration.',
);

assert(
  !profile.includes('ProfileAvatar')
    && !friends.includes('ProfileAvatar')
    && !playerPod.includes('ProfileAvatar')
    && !inviteBanner.includes('ProfileAvatar')
    && !artworkDetail.includes('ProfileAvatar')
    && playerPod.includes('<Mascot')
    && inviteBanner.includes('<Mascot')
    && artworkDetail.includes('<Mascot'),
  'Mascot must be the single shared player identity; active UI must not render the legacy ProfileAvatar.',
);

assert(
  !friends.includes('friend.symbol_key.toUpperCase()'),
  'Friend metadata must not expose the personal profile symbol.',
);

assert(
  interaction.includes("WebkitUserSelect: 'none'")
    && interaction.includes("WebkitTouchCallout: 'none'")
    && interaction.includes("WebkitUserDrag: 'none'")
    && interaction.includes("WebkitTapHighlightColor: 'transparent'")
    && drawingCanvas.includes('onStartShouldSetPanResponderCapture: () => true')
    && drawingCanvas.includes('webArtworkGestureLock')
    && drawingPreview.includes('webArtworkGestureLock'),
  'Artwork surfaces must block iOS/WebKit selection, callouts and drag takeover.',
);


assert(
  worlds.includes("moss:")
    && worlds.includes("moon:")
    && worlds.includes("candy:")
    && worlds.includes("halo:")
    && worlds.includes("ember:")
    && profileOptions.includes('WORLD_OPTIONS.map')
    && !worlds.includes('mascot: {'),
  'Crocat Worlds must expose five environment-only themes without owning mascot identity.',
);

assert(
  screen.includes('DecorationLayer')
    && mascot.includes("type MascotState")
    && decoration.includes("pointerEvents=\"none\"")
    && mascot.includes('pointerEvents="none"')
    && reducedMotion.includes('isReduceMotionEnabled')
    && reducedMotion.includes('reduceMotionChanged'),
  'World decoration and mascot motion must be shared, non-interactive and Reduced-Motion aware.',
);

assert(
  mascots.includes("gentle:")
    && mascots.includes("dreamy:")
    && mascots.includes("playful:")
    && mascots.includes("style: 'sway'")
    && mascots.includes("style: 'float'")
    && mascots.includes("style: 'bounce'")
    && mascot.includes('profile?: MascotProfile')
    && mascot.includes('AMBIENT_STATES')
    && mascot.includes('IDLE_FACE_STATES')
    && mascot.includes('character.idle')
    && mascot.includes("const BLINK_FACE = '− ᴗ −'")
    && mascot.includes('transform: [{ translateX: faceShift }]')
    && mascot.includes("sequence.filter((moment) => moment !== 'blink')")
    && mascot.includes("state === 'idle' && faceMoment === 'blink'")
    && !mascot.includes('crocatWorld('),
  'Mascot character must independently own faces and idle personality while preserving idle-only blinking and emotional gaze.',
);

assert(
  !mascots.includes('• ︵ •')
    && !mascots.includes('◉﹏◉')
    && !mascots.includes("'sad'")
    && !mascots.includes("'angry'")
    && room.includes("players.length < requiredPlayers ? 'shy' : (allReady ? 'excited' : 'happy')")
    && prompt.includes("state={isHead ? 'curious' : 'waiting'}")
    && adjust.includes("me.ready ? 'proud' : 'curious'")
    && reveal.includes('state="celebrate"'),
  'Mascot states must stay friendly: shy/curious while waiting, proud/excited when ready and celebratory on reveal.',
);

assert(
  room.includes('<PlayerPod')
    && room.includes('players.map')
    && playerPod.includes('profile: ProfileVisual')
    && reveal.includes('players.map'),
  'Lobby and reveal identity must render from the player collection through reusable player presentation.',
);

assert(
  room.includes('requiredPlayers = 2')
    && !playerPod.includes('host')
    && !playerPod.includes('guest'),
  'Current two-player rules must stay explicit without baking Host/Guest concepts into PlayerPod.',
);

assert(
  drawingCanvas.includes('crocatWorld')
    && drawingCanvas.includes('webArtworkGestureLock')
    && drawingPreview.includes('crocatWorld')
    && drawingPreview.includes('webArtworkGestureLock'),
  'World canvas framing must preserve the iOS/WebKit artwork interaction lock.',
);

assert(
  drawingCanvas.includes("connectionGuideTop: { top: 40 }")
    && drawingCanvas.includes("connectionGuideBottom: { bottom: 40 }")
    && drawingCanvas.includes("role === 'BODY' ? styles.connectionZoneTop : styles.connectionZoneBottom")
    && drawingCanvas.includes("? world.colors.primary")
    && drawingCanvas.includes(": world.colors.secondary"),
  'HEAD and BODY drawing connection zones must stay symmetric, subtle and World-aware.',
);

assert(
  localDraw.includes('lastClearedRef')
    && localDraw.includes('if (current.strokes.length === 0 && lastClearedRef.current)')
    && localDraw.includes('lastClearedRef.current = current')
    && localDraw.includes('onUndo={undo}')
    && localDraw.includes('onClear={clear}')
    && draw.includes('lastClearedRef')
    && draw.includes('if (current.strokes.length === 0 && lastClearedRef.current)')
    && draw.includes('lastClearedRef.current = current')
    && draw.includes('onUndo={undo}')
    && draw.includes('onClear={clear}'),
  'Local and online drawing CLEAR actions must be reversible through the shared toolbar UNDO control.',
);

assert(
  drawingTools.includes("key: 'ink'")
    && drawingTools.includes("key: 'coral'")
    && drawingTools.includes("key: 'moss'")
    && drawingTools.includes("key: 'sky'")
    && drawingTools.includes("key: 'lavender'")
    && drawingTools.includes("key: 'gold'")
    && drawingTools.includes("key: 'berry'")
    && drawingTools.includes("key: 'shadow'")
    && palette.includes("shadowInk:")
    && palette.includes("haloWhite:")
    && drawingTools.includes("key: 'thin', label: 'Thin', width: 3")
    && drawingTools.includes("key: 'normal', label: 'Normal', width: 6")
    && drawingTools.includes("key: 'thick', label: 'Thick', width: 10")
    && drawingToolbar.includes('DRAWING_PALETTE.map')
    && drawingToolbar.includes('DRAWING_BRUSHES.map')
    && localDraw.includes('brushWidth={brushWidth}')
    && draw.includes('brushWidth={brushWidth}'),
  'Local and online drawing must expose the shared eight-color Crocat palette and three brush widths.',
);

assert(
  gameTypes.includes('color: string;')
    && gameTypes.includes('width: number;')
    && drawingCanvas.includes('color,')
    && drawingCanvas.includes('width: brushWidth')
    && drawingCanvas.includes('stroke={stroke.color}')
    && drawingCanvas.includes('strokeWidth={stroke.width}')
    && drawingPreview.includes('stroke={stroke.color}')
    && drawingPreview.includes('strokeWidth={stroke.width}'),
  'Color and brush width must remain stored and rendered per stroke through drawing, preview and reveal.',
);

assert(
  phaseSync.includes('loadRoomPhaseSnapshot')
    && phaseSync.includes("window.addEventListener('focus'")
    && phaseSync.includes("window.addEventListener('online'")
    && phaseSync.includes("'visibilitychange'")
    && phaseSync.includes("AppState.addEventListener('change'")
    && phaseSync.includes('setInterval(')
    && phaseSync.includes('inFlightRef'),
  'Reliable phase sync must reconcile from server state on interval, foreground, browser focus, visibility and restored connectivity.',
);

assert(
  multiplayer.includes('enablePhaseTimerSync')
    && multiplayer.includes('enterPhase')
    && phaseSync.includes("enterPhase(round.id, 'prompt_select')")
    && phaseSync.includes("enterPhase(round.id, 'drawing')")
    && phaseSync.includes("enterPhase(round.id, 'adjusting')")
    && phaseSync.includes("enterPhase(round.id, 'final_reveal')")
    && prompt.includes('round.phase_timer_started_at === null')
    && prompt.includes('timerWaiting ? 15 : countdownRemaining')
    && draw.includes('round.phase_timer_started_at === null')
    && draw.includes('timerWaiting ? configuredSeconds : countdownRemaining')
    && adjust.includes('round.phase_timer_started_at === null')
    && adjust.includes('timerWaiting ? 15 : countdownSeconds')
    && reveal.includes('round.phase_timer_started_at === null')
    && reveal.includes('timerWaiting ? 15 : countdownSeconds'),
  'Online phase timers must stay at their full duration until both players have entered the phase.',
);

assert(
  room.includes('useReliablePhaseSync')
    && prompt.includes('useReliablePhaseSync')
    && draw.includes('useReliablePhaseSync')
    && adjust.includes('useReliablePhaseSync')
    && reveal.includes('useReliablePhaseSync'),
  'Every online phase boundary must use the shared reliable server-state fallback.',
);

assert(
  prompt.includes('WATCH ONLY')
    && prompt.includes('You can follow the choice live, but only HEAD can interact.')
    && prompt.includes('disabled={!isHead || busy}'),
  'BODY prompt view must clearly communicate its read-only spectator state while preserving HEAD-only interaction.',
);

assert(
  !prompt.includes('LEAVE ROUND')
    && !draw.includes('LEAVE ROUND')
    && !adjust.includes('LEAVE ROUND')
    && !reveal.includes('HOME / LEAVE ROOM'),
  'Active online phases must use the shared top navigation as the single leave surface.',
);

assert(
  prompt.indexOf('<CountdownBadge remaining={remaining} label="PICK" />')
      < prompt.indexOf('<Mascot', prompt.indexOf('styles.headerActions'))
    && draw.indexOf('<CountdownBadge remaining={remaining} />')
      < draw.indexOf('<Mascot', draw.indexOf('styles.headerActions'))
    && adjust.indexOf('<CountdownBadge remaining={secondsLeft} label="ADJUST" />')
      < adjust.indexOf('<Mascot', adjust.indexOf('styles.headerActions'))
    && reveal.indexOf('<CountdownBadge remaining={secondsLeft} label="NEXT ROUND" />')
      < reveal.indexOf('<View style={styles.mascotRow}>'),
  'Online phase headers must place the countdown before the mascot presentation.',
);

assert(
  realtime.includes("if (status === 'SUBSCRIBED') {\n        onChange();")
    && phaseSync.includes('transient network loss'),
  'Adjustment reconnect must reconcile immediately while safety sync remains non-fatal.',
);

assert(
  uiThemeStore.includes('themeReady: false')
    && uiThemeStore.includes('themeRevision')
    && uiThemeStore.includes('rememberWorldKey')
    && rootLayout.includes('loadCachedWorldKey')
    && rootLayout.includes('Promise.race')
    && rootLayout.includes('if (!themeReady)')
    && rootLayout.includes('applyBootstrapTheme')
    && rootLayout.includes('expectedRevision'),
  'World bootstrap must distinguish unresolved default state, use cache/server racing and protect newer theme changes from stale bootstrap writes.',
);

assert(
  themeCache.includes("'crocat:world-theme:v1'")
    && themeCache.includes('normalizeWorldKey')
    && rootLayout.includes("source: 'server'")
    && rootLayout.includes("persist: false"),
  'The last confirmed World must be a bootstrap cache while the server profile remains authoritative.',
);

assert(
  profile.includes('MASCOT COLOR')
    && profile.includes('MASCOT SYMBOL')
    && profile.includes('MASCOT SHAPE')
    && profile.includes('MASCOT CHARACTER')
    && profile.includes('YOUR WORLD')
    && profileOptions.includes('MASCOT_CHARACTERS')
    && profileOptions.includes('MASCOT_SHAPES'),
  'Profile editing must present one mascot identity followed by an independent World selection.',
);

assert(
  profile.includes('<ProfileCharacterPicker')
    && !profile.includes('MASCOT_CHARACTERS.map')
    && profileCharacterPicker.includes('PanResponder.create')
    && profileCharacterPicker.includes('gesture.dx <= -36')
    && profileCharacterPicker.includes('gesture.dx >= 36')
    && profileCharacterPicker.includes('Previous mascot character')
    && profileCharacterPicker.includes('Next mascot character')
    && profileCharacterPicker.includes('TRY AN EMOTION')
    && profileCharacterPicker.includes("state: 'happy'")
    && profileCharacterPicker.includes("state: 'shy'")
    && profileCharacterPicker.includes("state: 'curious'")
    && profileCharacterPicker.includes("state: 'excited'")
    && profileCharacterPicker.includes("state: 'proud'")
    && profileCharacterPicker.includes("state: 'celebrate'")
    && mascots.includes('traits: readonly string[]'),
  'Profile character selection must use the large swipe/arrow explorer with character traits and interactive emotion previews.',
);

assert(
  profile.includes('<ProfileWorldPicker')
    && !profile.includes('PROFILE_THEMES.map')
    && profileWorldPicker.includes('PanResponder.create')
    && profileWorldPicker.includes('Previous Crocat World')
    && profileWorldPicker.includes('Next Crocat World')
    && profileWorldPicker.includes('gesture.dx <= -36')
    && profileWorldPicker.includes('gesture.dx >= 36')
    && profileWorldPicker.includes('world.background.fragments')
    && worlds.includes('fragments: readonly string[]')
    && worlds.includes('falling: readonly string[]'),
  'Profile World selection must use the larger swipe/arrow explorer and every World must expose richer fragment data.',
);

assert(
  decoration.includes("depth?: 'back' | 'front'")
    && decoration.includes('FallingFragment')
    && decoration.includes('world.background.falling')
    && decoration.includes('!reducedMotion')
    && screen.includes('depth="back"')
    && screen.includes('depth="front"'),
  'World ambience must render subtle background and foreground fragments while Reduced Motion disables falling motion.',
);

assert(
  mascots.includes("key: 'sunny'")
    && mascots.includes("key: 'cool'")
    && mascots.includes("worldKey: 'moss'")
    && mascots.includes("worldKey: 'moon'")
    && mascots.includes("worldKey: 'candy'")
    && mascots.includes("worldKey: 'halo'")
    && mascots.includes("worldKey: 'shadow'")
    && worlds.includes("label: 'COLORFUL SHADOW'")
    && worlds.includes("key: 'shadow'")
    && profile.includes('WORLD colors are the signature colors')
    && mascot.includes('mascotInk(profile?.colorKey)'),
  'Crocat 1.8.1 must keep World-linked mascot colors visible, add Colorful Shadow and support SUNNY/COOL characters with readable dark mascots.',
);

assert(
  profile.includes("const router = useRouter()")
    && profile.includes("router.replace('/')")
    && !profile.includes("setNotice('PROFILE SAVED ✓')"),
  'Successful profile saves must return directly to Home without rendering a saved notice.',
);

assert(
  !rootLayout.includes('setTimeout(')
    && !entry.includes('setThemeKey(')
    && entry.includes('const world = crocatWorld(themeKey)')
    && profile.includes("setUiThemeKey(nextWorld, { persist: false })"),
  'Theme flash prevention must live at app bootstrap; screens must consume the resolved World and profile preview changes must not overwrite the authoritative cache before save.',
);

console.log('Crocat 1.8.3 World atmosphere, character explorer, color-character polish, profile-mascot-world, drawing-guide, theme-bootstrap, reliable phase-sync and UI contracts passed');
