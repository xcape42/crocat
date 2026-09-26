import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrocatDrawing } from '@/src/types/game';

function key(roundId: string, userId: string) {
  return `crocat:drawing-draft:${roundId}:${userId}`;
}

export async function loadDrawingDraft(roundId: string, userId: string): Promise<CrocatDrawing | null> {
  try {
    const raw = await AsyncStorage.getItem(key(roundId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CrocatDrawing;
    return parsed && Array.isArray(parsed.strokes) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveDrawingDraft(roundId: string, userId: string, drawing: CrocatDrawing) {
  try {
    await AsyncStorage.setItem(key(roundId, userId), JSON.stringify(drawing));
  } catch {
    // Draft persistence is resilience only; drawing remains usable without it.
  }
}

export async function clearDrawingDraft(roundId: string, userId: string) {
  try {
    await AsyncStorage.removeItem(key(roundId, userId));
  } catch {
    // No-op: phase navigation remains authoritative.
  }
}
