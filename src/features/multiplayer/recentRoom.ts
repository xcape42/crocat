import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ROOM_CODE_KEY = 'crocat:last-room-code';
const ACTIVE_ROOM_CODE_KEY = 'crocat:active-room-code';

function normalizeRoomCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export async function loadLastRoomCode() {
  try {
    const value = await AsyncStorage.getItem(LAST_ROOM_CODE_KEY);
    const normalized = normalizeRoomCode(value ?? '');
    return normalized.length === 6 ? normalized : '';
  } catch {
    return '';
  }
}

export async function rememberRoomCode(code: string) {
  const normalized = normalizeRoomCode(code);
  if (normalized.length !== 6) return;

  try {
    await AsyncStorage.setItem(LAST_ROOM_CODE_KEY, normalized);
  } catch {
    // Room-code memory is a convenience; gameplay must keep working without storage.
  }
}

export async function loadActiveRoomCode() {
  try {
    const value = await AsyncStorage.getItem(ACTIVE_ROOM_CODE_KEY);
    const normalized = normalizeRoomCode(value ?? '');
    return normalized.length === 6 ? normalized : '';
  } catch {
    return '';
  }
}

export async function rememberActiveRoomCode(code: string) {
  const normalized = normalizeRoomCode(code);
  if (normalized.length !== 6) return;

  try {
    await AsyncStorage.multiSet([
      [ACTIVE_ROOM_CODE_KEY, normalized],
      [LAST_ROOM_CODE_KEY, normalized],
    ]);
  } catch {
    // The server remains authoritative if local persistence is unavailable.
  }
}

export async function clearActiveRoomCode() {
  try {
    await AsyncStorage.removeItem(ACTIVE_ROOM_CODE_KEY);
  } catch {
    // Explicit leave still proceeds even when local storage is unavailable.
  }
}
