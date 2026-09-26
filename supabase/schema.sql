-- Crocat online multiplayer draft schema.
-- Not required for 1.0.0 local play. This is intentionally small and will evolve with auth/realtime.

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid,
  game_mode text not null default 'split',
  status text not null default 'waiting',
  created_at timestamptz not null default now()
);

create table if not exists room_players (
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid not null,
  role text,
  ready boolean not null default false,
  primary key (room_id, user_id)
);

create table if not exists game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade not null,
  status text not null default 'waiting',
  started_at timestamptz,
  ends_at timestamptz
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references game_rounds(id) on delete cascade not null,
  player_id uuid not null,
  role text not null,
  drawing jsonb not null,
  created_at timestamptz not null default now()
);
