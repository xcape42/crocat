import { createClient } from '@supabase/supabase-js';

const url = 'https://ufryvzzzegoltrwcpkls.supabase.co';
const key = 'sb_publishable_aeZDV23ZRp855C9bKmRlCw_F9NpihWS';

function client() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function guest(name) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: name, crocat_smoke_test: true } },
  });

  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error(name + ' anonymous auth returned no user/session');
  }

  return {
    supabase,
    user: data.user,
    session: data.session,
  };
}

const first = (data) => Array.isArray(data) ? data[0] : data;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureProfile(supabase, name) {
  const ensured = await supabase.rpc('ensure_profile', {
    p_default_name: name,
  });
  if (ensured.error) throw ensured.error;
  const profile = first(ensured.data);
  if (!profile?.user_id || !profile?.friend_code) {
    throw new Error('Profile was not created');
  }
  return profile;
}

async function updateProfile(supabase, input) {
  const result = await supabase.rpc('update_profile', {
    p_display_name: input.name,
    p_color_key: input.color,
    p_avatar_key: input.avatar,
    p_theme_key: input.theme,
    p_symbol_key: input.symbol,
  });
  if (result.error) throw result.error;
  return first(result.data);
}

function drawing(id) {
  return {
    id,
    strokes: [{
      id: id + '-stroke',
      points: [{ x: 18, y: 22 }, { x: 72, y: 84 }],
      color: '#17221D',
      width: 6,
      opacity: 1,
    }],
  };
}

async function main() {
  const alphaGuest = await guest('AlphaSmoke');
  const betaGuest = await guest('BetaSmoke');
  const gammaGuest = await guest('GammaSmoke');

  const alpha = alphaGuest.supabase;
  const beta = betaGuest.supabase;
  const gamma = gammaGuest.supabase;

  let alphaProfile = await ensureProfile(alpha, 'AlphaSmoke');
  let betaProfile = await ensureProfile(beta, 'BetaSmoke');
  await ensureProfile(gamma, 'GammaSmoke');

  alphaProfile = await updateProfile(alpha, {
    name: 'Alpha Fox',
    color: 'violet',
    avatar: 'ears',
    theme: 'ink',
    symbol: 'moon',
  });
  betaProfile = await updateProfile(beta, {
    name: 'Beta Bird',
    color: 'coral',
    avatar: 'spiky',
    theme: 'paper',
    symbol: 'spark',
  });

  if (
    alphaProfile.display_name !== 'Alpha Fox'
    || alphaProfile.color_key !== 'violet'
    || alphaProfile.avatar_key !== 'ears'
    || alphaProfile.theme_key !== 'ink'
    || alphaProfile.symbol_key !== 'moon'
  ) {
    throw new Error('Profile update did not persist all visual fields');
  }

  // Session/reload persistence: move the anonymous session into a fresh client.
  const alphaReload = client();
  const setSession = await alphaReload.auth.setSession({
    access_token: alphaGuest.session.access_token,
    refresh_token: alphaGuest.session.refresh_token,
  });
  if (setSession.error) throw setSession.error;

  const reloadedProfile = await ensureProfile(alphaReload, 'IgnoredName');
  if (
    reloadedProfile.user_id !== alphaGuest.user.id
    || reloadedProfile.display_name !== 'Alpha Fox'
    || reloadedProfile.friend_code !== alphaProfile.friend_code
  ) {
    throw new Error('Profile did not survive a fresh client/session reload');
  }

  // A non-friend cannot directly read another private profile.
  const preFriendProfile = await alpha
    .from('profiles')
    .select('user_id')
    .eq('user_id', betaGuest.user.id);
  if (preFriendProfile.error) throw preFriendProfile.error;
  if (preFriendProfile.data.length !== 0) {
    throw new Error('Profile RLS exposed a non-friend profile');
  }

  const request = await alpha.rpc('send_friend_request_to_user', {
    p_other_user_id: betaGuest.user.id,
  });
  if (request.error) throw request.error;
  const friendship = first(request.data);

  const incoming = await beta.rpc('list_friend_requests');
  if (incoming.error) throw incoming.error;
  if (!incoming.data.some(
    (item) => item.friendship_id === friendship.id && item.direction === 'incoming',
  )) {
    throw new Error('Incoming friend request was not visible');
  }

  const accepted = await beta.rpc('respond_friend_request', {
    p_friendship_id: friendship.id,
    p_accept: true,
  });
  if (accepted.error) throw accepted.error;

  const alphaFriends = await alpha.rpc('list_friends');
  if (alphaFriends.error) throw alphaFriends.error;
  const acceptedFriend = alphaFriends.data.find(
    (item) => item.friend_user_id === betaGuest.user.id,
  );
  if (!acceptedFriend) {
    throw new Error('Accepted friend was missing');
  }
  if (
    acceptedFriend.friend_level !== 1
    || acceptedFriend.shared_rounds !== 0
    || acceptedFriend.friendship_label !== 'NEW FRIEND'
  ) {
    throw new Error('New friendship progress was not initialized correctly');
  }

  // Direct DML stays blocked; mutations must pass through the scoped RPCs.
  const forbiddenInsert = await alpha.from('friendships').insert({
    user_a: alphaGuest.user.id,
    user_b: gammaGuest.user.id,
    requested_by: alphaGuest.user.id,
    status: 'accepted',
  });
  if (!forbiddenInsert.error) {
    throw new Error('Direct friendship insert unexpectedly bypassed RLS/grants');
  }

  const touched = await beta.rpc('touch_profile_presence');
  if (touched.error) throw touched.error;

  const onlineFriends = await alpha.rpc('list_friends');
  if (onlineFriends.error) throw onlineFriends.error;
  const betaFriend = onlineFriends.data.find(
    (item) => item.friend_user_id === betaGuest.user.id,
  );
  if (!betaFriend?.online) {
    throw new Error('Fresh friend presence was not reported online');
  }

  // Primary online entry must create once and then reuse the same lobby.
  const created = await beta.rpc('open_or_create_room', {
    p_display_name: betaProfile.display_name,
    p_round_seconds: 10,
  });
  if (created.error) throw created.error;
  let betaRoom = first(created.data);

  const reopened = await beta.rpc('open_or_create_room', {
    p_display_name: betaProfile.display_name,
    p_round_seconds: 10,
  });
  if (reopened.error) throw reopened.error;
  if (
    first(reopened.data).room_id !== betaRoom.room_id
    || first(reopened.data).room_code !== betaRoom.room_code
  ) {
    throw new Error('Online entry did not reuse the waiting lobby');
  }

  const regenerated = await beta.rpc('regenerate_room_code', {
    p_room_id: betaRoom.room_id,
  });
  if (regenerated.error) throw regenerated.error;
  if (regenerated.data === betaRoom.room_code) {
    throw new Error('Lobby code did not regenerate');
  }
  betaRoom = { ...betaRoom, room_code: regenerated.data };

  const withOpenLobby = await alpha.rpc('list_friends');
  if (withOpenLobby.error) throw withOpenLobby.error;
  const discoverable = withOpenLobby.data.find(
    (item) => item.friend_user_id === betaGuest.user.id,
  );
  if (discoverable?.open_room_code !== betaRoom.room_code) {
    throw new Error('Friends list did not expose the open lobby');
  }

  const directJoin = await alpha.rpc('join_friend_lobby', {
    p_friend_user_id: betaGuest.user.id,
    p_current_room_id: null,
  });
  if (directJoin.error) throw directJoin.error;
  if (first(directJoin.data).room_id !== betaRoom.room_id) {
    throw new Error('Direct friend click joined the wrong lobby');
  }

  const alphaLeavesDiscovery = await alpha.rpc('leave_room', {
    p_room_id: betaRoom.room_id,
  });
  if (alphaLeavesDiscovery.error) throw alphaLeavesDiscovery.error;

  // Realtime invitation into an existing lobby.
  let realtimeInviteSeen = false;
  const inviteChannel = alpha
    .channel('social-invite-' + Date.now())
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'lobby_invites',
        filter: 'recipient_id=eq.' + alphaGuest.user.id,
      },
      () => {
        realtimeInviteSeen = true;
      },
    );

  await new Promise((resolve, reject) => {
    inviteChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error('Lobby invite realtime subscription failed: ' + status));
      }
    });
  });

  const inviteExisting = await beta.rpc('invite_friend', {
    p_friend_user_id: alphaGuest.user.id,
    p_room_id: betaRoom.room_id,
  });
  if (inviteExisting.error) throw inviteExisting.error;
  const existingInvite = first(inviteExisting.data);

  for (let attempt = 0; attempt < 150 && !realtimeInviteSeen; attempt += 1) {
    await wait(100);
  }
  await alpha.removeChannel(inviteChannel);

  if (!realtimeInviteSeen) {
    throw new Error('Realtime lobby invite was not received');
  }

  const listedInvites = await alpha.rpc('list_lobby_invites');
  if (listedInvites.error) throw listedInvites.error;
  if (!listedInvites.data.some((item) => item.invite_id === existingInvite.invite_id)) {
    throw new Error('Lobby invite was not listed for recipient');
  }

  const acceptedInvite = await alpha.rpc('accept_lobby_invite', {
    p_invite_id: existingInvite.invite_id,
  });
  if (acceptedInvite.error) throw acceptedInvite.error;

  // Use the invited room for a real round, then persist the resulting artwork.
  for (const activeClient of [alpha, beta]) {
    const ready = await activeClient.rpc('set_ready', {
      p_room_id: betaRoom.room_id,
      p_ready: true,
    });
    if (ready.error) throw ready.error;
  }

  const started = await alpha.rpc('start_round', {
    p_room_id: betaRoom.room_id,
  });
  if (started.error) throw started.error;
  const round = first(started.data);

  const headClient =
    round.head_player_id === alphaGuest.user.id ? alpha : beta;
  const bodyClient =
    round.body_player_id === alphaGuest.user.id ? alpha : beta;

  const picked = round.prompt_options[0];
  const selected = await headClient.rpc('select_prompt', {
    p_round_id: round.id,
    p_term: picked.term,
  });
  if (selected.error) throw selected.error;

  const headSubmit = await headClient.rpc('submit_drawing', {
    p_round_id: round.id,
    p_role: 'HEAD',
    p_drawing: drawing('social-head'),
  });
  if (headSubmit.error) throw headSubmit.error;

  const bodySubmit = await bodyClient.rpc('submit_drawing', {
    p_round_id: round.id,
    p_role: 'BODY',
    p_drawing: drawing('social-body'),
  });
  if (bodySubmit.error) throw bodySubmit.error;

  for (const activeClient of [alpha, beta]) {
    const ready = await activeClient.rpc('set_ready', {
      p_room_id: betaRoom.room_id,
      p_ready: true,
    });
    if (ready.error) throw ready.error;
  }

  const reveal = await alpha.rpc('advance_phase', {
    p_room_id: betaRoom.room_id,
  });
  if (reveal.error) throw reveal.error;

  const artworkSave = await alpha.rpc('save_artwork', {
    p_round_id: round.id,
  });
  if (artworkSave.error) throw artworkSave.error;
  const artwork = first(artworkSave.data);

  const duplicateSave = await alpha.rpc('save_artwork', {
    p_round_id: round.id,
  });
  if (duplicateSave.error) throw duplicateSave.error;
  if (first(duplicateSave.data).id !== artwork.id) {
    throw new Error('Duplicate save created a second artwork');
  }

  if (
    artwork.partner_user_id !== betaGuest.user.id
    || !artwork.title
    || artwork.favorite !== true
  ) {
    throw new Error('Saved artwork metadata is incomplete');
  }

  const renamed = await alpha.rpc('rename_artwork', {
    p_artwork_id: artwork.id,
    p_title: 'Smoke Crocat',
  });
  if (renamed.error) throw renamed.error;

  const unfavorite = await alpha.rpc('set_artwork_favorite', {
    p_artwork_id: artwork.id,
    p_favorite: false,
  });
  if (unfavorite.error) throw unfavorite.error;
  if (first(unfavorite.data).favorite !== false) {
    throw new Error('Favorite state did not update');
  }

  const betaArtwork = await beta.rpc('save_artwork', {
    p_round_id: round.id,
  });
  if (betaArtwork.error) throw betaArtwork.error;
  const betaSaved = first(betaArtwork.data);
  if (
    betaSaved.id === artwork.id
    || betaSaved.partner_user_id !== alphaGuest.user.id
  ) {
    throw new Error('Second participant did not get an independent private artwork');
  }

  const gammaSave = await gamma.rpc('save_artwork', {
    p_round_id: round.id,
  });
  if (!gammaSave.error) {
    throw new Error('Non-participant was able to save an artwork');
  }

  const gammaRead = await gamma
    .from('saved_artworks')
    .select('id')
    .eq('id', artwork.id);
  if (gammaRead.error) throw gammaRead.error;
  if (gammaRead.data.length !== 0) {
    throw new Error('Artwork RLS leaked a private artwork');
  }

  const gammaRename = await gamma.rpc('rename_artwork', {
    p_artwork_id: artwork.id,
    p_title: 'Nope',
  });
  if (!gammaRename.error) {
    throw new Error('Foreign user was able to rename an artwork');
  }

  const deleteAlphaArt = await alpha.rpc('delete_artwork', {
    p_artwork_id: artwork.id,
  });
  if (deleteAlphaArt.error) throw deleteAlphaArt.error;

  const deleteBetaArt = await beta.rpc('delete_artwork', {
    p_artwork_id: betaSaved.id,
  });
  if (deleteBetaArt.error) throw deleteBetaArt.error;

  const alphaLeavePlayed = await alpha.rpc('leave_room', {
    p_room_id: betaRoom.room_id,
  });
  if (alphaLeavePlayed.error) throw alphaLeavePlayed.error;

  const betaLeavePlayed = await beta.rpc('leave_room', {
    p_room_id: betaRoom.room_id,
  });
  if (betaLeavePlayed.error) throw betaLeavePlayed.error;

  // Invite from the friends list with no lobby must create the lobby.
  const autoInvite = await alpha.rpc('invite_friend', {
    p_friend_user_id: betaGuest.user.id,
    p_room_id: null,
  });
  if (autoInvite.error) throw autoInvite.error;
  const autoTicket = first(autoInvite.data);

  const betaAutoInvites = await beta.rpc('list_lobby_invites');
  if (betaAutoInvites.error) throw betaAutoInvites.error;
  if (!betaAutoInvites.data.some((item) => item.invite_id === autoTicket.invite_id)) {
    throw new Error('Auto-created lobby invite was not visible');
  }

  const betaAcceptAuto = await beta.rpc('accept_lobby_invite', {
    p_invite_id: autoTicket.invite_id,
  });
  if (betaAcceptAuto.error) throw betaAcceptAuto.error;

  const autoMembers = await alpha
    .from('room_players')
    .select('user_id')
    .eq('room_id', autoTicket.room_id);
  if (autoMembers.error) throw autoMembers.error;
  if (autoMembers.data.length !== 2) {
    throw new Error('Auto-created invite lobby did not contain both friends');
  }

  const betaLeaveAuto = await beta.rpc('leave_room', {
    p_room_id: autoTicket.room_id,
  });
  if (betaLeaveAuto.error) throw betaLeaveAuto.error;

  const alphaLeaveAuto = await alpha.rpc('leave_room', {
    p_room_id: autoTicket.room_id,
  });
  if (alphaLeaveAuto.error) throw alphaLeaveAuto.error;

  // Switching to a friend's open lobby must dissolve the caller's solo lobby.
  const alphaSolo = await alpha.rpc('open_or_create_room', {
    p_display_name: alphaProfile.display_name,
    p_round_seconds: 10,
  });
  if (alphaSolo.error) throw alphaSolo.error;
  const alphaSoloRoom = first(alphaSolo.data);

  const betaSolo = await beta.rpc('open_or_create_room', {
    p_display_name: betaProfile.display_name,
    p_round_seconds: 10,
  });
  if (betaSolo.error) throw betaSolo.error;
  const betaSoloRoom = first(betaSolo.data);

  const switched = await alpha.rpc('join_friend_lobby', {
    p_friend_user_id: betaGuest.user.id,
    p_current_room_id: alphaSoloRoom.room_id,
  });
  if (switched.error) throw switched.error;
  if (first(switched.data).room_id !== betaSoloRoom.room_id) {
    throw new Error('Friend-lobby switch did not join the target lobby');
  }

  const oldSolo = await alpha
    .from('rooms')
    .select('id')
    .eq('id', alphaSoloRoom.room_id);
  if (oldSolo.error) throw oldSolo.error;
  if (oldSolo.data.length !== 0) {
    throw new Error('Previous solo lobby survived friend-lobby switch');
  }

  const alphaLeaveSwitch = await alpha.rpc('leave_room', {
    p_room_id: betaSoloRoom.room_id,
  });
  if (alphaLeaveSwitch.error) throw alphaLeaveSwitch.error;

  const betaLeaveSwitch = await beta.rpc('leave_room', {
    p_room_id: betaSoloRoom.room_id,
  });
  if (betaLeaveSwitch.error) throw betaLeaveSwitch.error;

  const removed = await alpha.rpc('remove_friend', {
    p_friend_user_id: betaGuest.user.id,
  });
  if (removed.error) throw removed.error;

  const noFriends = await alpha.rpc('list_friends');
  if (noFriends.error) throw noFriends.error;
  if (noFriends.data.some((item) => item.friend_user_id === betaGuest.user.id)) {
    throw new Error('Friend removal did not persist');
  }

  const postRemoveProfile = await alpha
    .from('profiles')
    .select('user_id')
    .eq('user_id', betaGuest.user.id);
  if (postRemoveProfile.error) throw postRemoveProfile.error;
  if (postRemoveProfile.data.length !== 0) {
    throw new Error('Profile visibility remained after friendship removal');
  }

  console.log('Crocat 1.6.0 social + gallery smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
