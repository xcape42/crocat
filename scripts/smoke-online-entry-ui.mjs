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

console.log('Crocat 1.7.1 reliable phase-sync and UI contracts passed');
