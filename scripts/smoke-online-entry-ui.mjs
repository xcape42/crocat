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
    && profile.includes('size={108} showSymbol'),
  'Profile symbols must be hidden from shared avatars and visible only in the owner profile editor.',
);

assert(
  !friends.includes('friend.symbol_key.toUpperCase()'),
  'Friend metadata must not expose the personal profile symbol.',
);

console.log('Crocat 1.6.3 simplified social surface UX contract passed');
