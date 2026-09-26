import type { OnlinePlayer, OnlineRoom, OnlineRound } from './types';
import { currentUser } from './auth';
import { loadRoom } from './room';
import {
  clearActiveRoomCode,
  loadActiveRoomCode,
  rememberActiveRoomCode,
} from './recentRoom';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';

type RouterLike = {
  replace: (href: any) => void;
};

type RoomState = {
  room: OnlineRoom;
  players: OnlinePlayer[];
  round: OnlineRound | null;
};

export function routeForOnlineState(state: RoomState, userId: string) {
  const me = state.players.find((player) => player.user_id === userId);
  if (!me) return null;

  if (state.room.status === 'waiting' || !state.round) {
    return {
      key: 'room',
      href: `/online/room/${state.room.code}`,
    };
  }

  if (state.room.status === 'prompt_select') {
    return {
      key: 'prompt',
      href: {
        pathname: '/online/prompt',
        params: { roomId: state.room.id, roundId: state.round.id },
      },
    };
  }

  if (state.room.status === 'drawing') {
    return {
      key: 'draw',
      href: {
        pathname: '/online/draw',
        params: {
          roomId: state.room.id,
          roundId: state.round.id,
          role: me.role,
          seconds: state.room.round_seconds,
          endsAt: state.round.ends_at,
        },
      },
    };
  }

  if (state.room.status === 'adjusting') {
    return {
      key: 'adjust',
      href: {
        pathname: '/online/adjust',
        params: {
          roomId: state.room.id,
          roundId: state.round.id,
          role: me.role,
        },
      },
    };
  }

  if (state.room.status === 'final_reveal' || state.room.status === 'reveal') {
    return {
      key: 'reveal',
      href: {
        pathname: '/online/reveal',
        params: { roomId: state.room.id, roundId: state.round.id },
      },
    };
  }

  return {
    key: 'room',
    href: `/online/room/${state.room.code}`,
  };
}

function pathnameMatchesRoute(pathname: string, key: string, code: string) {
  if (key === 'room') return pathname === `/online/room/${code}`;
  return pathname === `/online/${key}`;
}

export async function resumeActiveOnlineSession(
  router: RouterLike,
  pathname: string,
  forceNavigation = false,
) {
  const code = await loadActiveRoomCode();
  if (!code) return false;

  try {
    const user = await currentUser();
    if (!user) {
      await clearActiveRoomCode();
      return false;
    }

    const state = await loadRoom(code);
    const me = state.players.find((player) => player.user_id === user.id);
    if (!me) {
      await clearActiveRoomCode();
      return false;
    }

    await rememberActiveRoomCode(state.room.code);

    const store = useOnlineGameStore.getState();
    store.setDisplayName(me.display_name);
    store.setIdentity(user.id, me.role);
    store.setRoomState(state.room, state.players, state.round);

    const destination = routeForOnlineState(state, user.id);
    if (
      destination
      && (forceNavigation || !pathnameMatchesRoute(pathname, destination.key, state.room.code))
    ) {
      router.replace(destination.href);
    }

    return true;
  } catch {
    await clearActiveRoomCode();
    return false;
  }
}
