import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const play = read('app/play.tsx');
const entry = read('app/online/index.tsx');
const room = read('app/online/room/[code].tsx');
const friends = read('app/friends.tsx');
const avatar = read('src/components/ProfileAvatar.tsx');
const profile = read('app/profile.tsx');
const multiplayer = read('src/features/multiplayer/room.ts');
const drawingCanvas = read('src/components/DrawingCanvas.tsx');
const drawingPreview = read('src/components/DrawingPreview.tsx');
const interaction = read('src/theme/interaction.ts');
const worlds = read('src/theme/worlds.ts');
const screen = read('src/components/Screen.tsx');
const mascot = read('src/components/Mascot.tsx');
const decoration = read('src/components/DecorationLayer.tsx');
const playerPod = read('src/components/PlayerPod.tsx');
const reducedMotion = read('src/hooks/useReducedMotion.ts');
const profileOptions = read('src/features/profile/options.ts');
const reveal = read('app/online/reveal.tsx');
const prompt = read('app/online/prompt.tsx');
const draw = read('app/online/draw.tsx');
const adjust = read('app/online/adjust.tsx');
const phaseSync = read('src/hooks/useReliablePhaseSync.ts');
const realtime = read('src/features/multiplayer/realtime.ts');
const rootLayout = read('app/_layout.tsx');
const uiThemeStore = read('src/store/uiThemeStore.ts');
const themeCache = read('src/features/profile/themeCache.ts');
const artworkGeometry = read('src/features/artworks/geometry.ts');
const artworkThumbnail = read('src/components/ArtworkThumbnail.tsx');
const artworkExport = read('src/features/artworks/export.ts');
const artworkApi = read('src/features/artworks/api.ts');
const localGameStore = read('src/store/gameStore.ts');
const localDraw = read('app/draw.tsx');
const compactGeometryMigration = read('supabase/migrations/20260928213239_compact_artwork_geometry_1_8_0.sql');
const onlineSmoke = read('scripts/smoke-online.mjs');
const socialSmoke = read('scripts/smoke-social.mjs');

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
  avatar.includes('showSymbol = false')
    && profile.includes('showSymbol'),
  'Profile symbols must be hidden from shared avatars and visible only in the owner profile editor.',
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
    && profileOptions.includes('WORLD_OPTIONS.map'),
  'Crocat Worlds must expose Moss, Moon and Candy through the shared profile theme model.',
);

assert(
  screen.includes('DecorationLayer')
    && mascot.includes("type MascotState")
    && decoration.includes("pointerEvents=\"none\"")
    && reducedMotion.includes('isReduceMotionEnabled')
    && reducedMotion.includes('reduceMotionChanged'),
  'World decoration and mascot motion must be shared, non-interactive and Reduced-Motion aware.',
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
  room.includes('useReliablePhaseSync')
    && prompt.includes('useReliablePhaseSync')
    && draw.includes('useReliablePhaseSync')
    && adjust.includes('useReliablePhaseSync')
    && reveal.includes('useReliablePhaseSync'),
  'Every online phase boundary must use the shared reliable server-state fallback.',
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
  !rootLayout.includes('setTimeout(')
    && !entry.includes('setThemeKey(')
    && entry.includes('const world = crocatWorld(themeKey)')
    && profile.includes("setUiThemeKey(nextWorld, { persist: false })"),
  'Theme flash prevention must live at app bootstrap; screens must consume the resolved World and profile preview changes must not overwrite the authoritative cache before save.',
);

assert(
  artworkGeometry.includes('export const DRAWING_WIDTH = 360')
    && artworkGeometry.includes('export const DRAWING_HEIGHT = 380')
    && artworkGeometry.includes('width: 360')
    && artworkGeometry.includes('height: 480')
    && artworkGeometry.includes('headConnectionY: 240')
    && artworkGeometry.includes('bodyConnectionY: 140')
    && artworkGeometry.includes('overlap: 20'),
  'Current drawing space must stay 360x380 while the current final composition is 360x480 with 20px overlap.',
);

assert(
  drawingCanvas.includes("guideMode = 'hard'")
    && drawingCanvas.includes("guideMode === 'soft'")
    && drawingCanvas.includes("guideMode === 'none'")
    && drawingCanvas.includes('ARTWORK_HEAD_CONNECTION_Y')
    && drawingCanvas.includes('ARTWORK_BODY_CONNECTION_Y')
    && localDraw.includes('guideMode="hard"'),
  'Drawing guides must share central connection anchors and support hard, soft and none without changing Local Split head/body guidance.',
);

assert(
  drawingPreview.includes('artworkClipRect')
    && drawingPreview.includes('artworkPartBounds')
    && drawingPreview.includes('<G transform={artworkPartTransform(transform, connectionY, geometry)}>')
    && drawingPreview.includes('<G clipPath={`url(#${clipId})`}>')
    && drawingPreview.includes('if (interactiveRole)')
    && drawingPreview.includes('role = interactiveRole')
    && drawingPreview.includes("pointInside(virtualX, virtualY, headBounds)")
    && drawingPreview.includes('LEGACY_ARTWORK_GEOMETRY_VERSION')
    && drawingPreview.includes('geometry.version === LEGACY_ARTWORK_GEOMETRY_VERSION')
    && artworkGeometry.includes('ARTWORK_MAX_OFFSET_Y = Math.round(ARTWORK_HEIGHT / 3)')
    && artworkGeometry.includes('height: geometry.headConnectionY + halfOverlap')
    && artworkGeometry.includes('const y = geometry.bodyConnectionY - halfOverlap')
    && artworkThumbnail.includes('<G transform={artworkPartTransform(transform, connectionY, geometry)}>')
    && artworkExport.includes('escapeXml(artworkPartTransform(transform, connectionY, geometry))')
    && artworkExport.includes('? [head, body]')
    && artworkExport.includes(': [body, head]')
    && localGameStore.includes('clampArtworkTransform')
    && adjust.includes('clampArtworkTransform')
    && realtime.includes("event: 'part_transform'")
    && realtime.includes('onTransform(role, transform as PartTransform)')
    && onlineSmoke.includes('y: 120')
    && onlineSmoke.includes('y: -120')
    && onlineSmoke.includes('Cross-seam Adjustment transforms were not persisted exactly')
    && onlineSmoke.includes('Final Reveal did not preserve cross-seam Adjustment transforms')
    && socialSmoke.includes('galleryHeadTransform')
    && socialSmoke.includes('galleryBodyTransform'),
  'Adjustment must clip each source drawing before transforming it, allow cross-seam movement, keep fixed-role Realtime drags attached to their own part and prove large transforms survive persistence, Reveal and Gallery saves.',
);

assert(
  artworkThumbnail.includes('artwork.geometry_version')
    && artworkThumbnail.includes("const clipSuffix = artwork.id.replace")
    && artworkThumbnail.includes("'thumbnail-head-' + clipSuffix")
    && artworkThumbnail.includes("'thumbnail-body-' + clipSuffix")
    && artworkExport.includes('artwork.geometry_version')
    && artworkApi.includes('p_geometry_version: CURRENT_ARTWORK_GEOMETRY_VERSION'),
  'Gallery thumbnails, SVG export and new saved artworks must use explicit geometry versions.',
);

assert(
  compactGeometryMigration.includes('guide_mode')
    && compactGeometryMigration.includes("'Fee'")
    && compactGeometryMigration.includes("'Bonsai'")
    && compactGeometryMigration.includes("array['Sushi','Macaron','Donut']")
    && compactGeometryMigration.includes('geometry_version')
    && compactGeometryMigration.includes('p_geometry_version smallint default 1'),
  'The 1.8.0 migration must curate guide modes and preserve legacy artwork/save-RPC compatibility.',
);

assert(
  drawingCanvas.includes('otherSubmitted?: boolean')
    && drawingCanvas.includes('otherSubmitted = false')
    && drawingCanvas.includes('world.colors.primary')
    && drawingCanvas.includes('world.colors.secondary')
    && drawingCanvas.includes("guideMode === 'none'")
    && drawingCanvas.includes('pointerEvents="none"')
    && drawingCanvas.includes('ARTWORK_HEAD_CONNECTION_Y')
    && drawingCanvas.includes('ARTWORK_BODY_CONNECTION_Y'),
  'Drawing connection zones must stay anchored to the 1.8.0 geometry, remain non-interactive and use World tokens for neutral/partner-ready states.',
);

assert(
  draw.includes('otherSubmitted={otherSubmitted}')
    && !drawingCanvas.includes('subscribeToRound')
    && !drawingCanvas.includes('postgres_changes'),
  'Partner-ready canvas feedback must consume the existing online submission state without adding Realtime or polling behavior.',
);

assert(
  draw.includes('`Oberer Teil: ${partLabel}`')
    && draw.includes('`Unterer Teil: ${partLabel}`')
    && draw.includes('Nutze die Linie als Verbindung zum anderen Teil.')
    && draw.includes('Die Markierungen zeigen ungefähr den Übergangsbereich.')
    && draw.includes("guideMode !== 'none'")
    && localDraw.includes("'Oberer Teil: Kopf'")
    && localDraw.includes("'Unterer Teil: Körper'"),
  'Drawing screens must use semantic Oberer/Unterer Teil labels and avoid redundant technical hint copy for no-guide prompts.',
);

assert(
  !room.includes("flexWrap: 'wrap'")
    && room.includes('flexShrink: 1')
    && room.includes('flexBasis: 0')
    && room.includes('minWidth: 0')
    && room.includes('compactPlayerPods = width < 560')
    && room.includes('compact={compactPlayerPods}')
    && room.includes('emptyPlayerSlots = Math.max(0, requiredPlayers - players.length)')
    && room.includes('Array.from({ length: emptyPlayerSlots }')
    && room.includes('styles.waitingCompact')
    && room.includes('numberOfLines={3}')
    && !room.includes('flexShrink: unset')
    && playerPod.includes('style?: StyleProp<ViewStyle>')
    && playerPod.includes("overflow: 'hidden'")
    && playerPod.includes('ellipsizeMode="tail"'),
  'Online lobby must keep exactly two equal slots side by side, compact safely on narrow screens and contain overflowing player/placeholder content without wrapping the slot row.',
);

console.log('Crocat 1.8.4 cross-boundary adjustment, fixed-pair lobby and UI contracts passed');
