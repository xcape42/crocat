-- Crocat 1.5.0: cover newly introduced foreign-key access paths.

create index friendships_requested_by_idx
  on public.friendships(requested_by);

create index lobby_invites_room_id_idx
  on public.lobby_invites(room_id);

create index saved_artworks_partner_user_id_idx
  on public.saved_artworks(partner_user_id);

create index saved_artworks_round_id_idx
  on public.saved_artworks(round_id);
