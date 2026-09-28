import { CURRENT_ARTWORK_GEOMETRY_VERSION } from './geometry';
import { requireSupabase } from '@/src/lib/supabase';
import type { SavedArtwork } from './types';

function one(data: SavedArtwork | SavedArtwork[] | null): SavedArtwork {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value) throw new Error('Artwork data is missing.');
  return value;
}

export async function listSavedArtworks(): Promise<SavedArtwork[]> {
  const { data, error } = await requireSupabase()
    .from('saved_artworks')
    .select('*')
    .order('favorite', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SavedArtwork[];
}

export async function loadSavedArtwork(id: string): Promise<SavedArtwork> {
  const { data, error } = await requireSupabase()
    .from('saved_artworks')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as SavedArtwork;
}

export async function findSavedArtworkForRound(
  roundId: string,
): Promise<SavedArtwork | null> {
  const { data, error } = await requireSupabase()
    .from('saved_artworks')
    .select('*')
    .eq('round_id', roundId)
    .maybeSingle();

  if (error) throw error;
  return (data as SavedArtwork | null) ?? null;
}

export async function saveArtwork(roundId: string): Promise<SavedArtwork> {
  const { data, error } = await requireSupabase().rpc('save_artwork', {
    p_round_id: roundId,
    p_geometry_version: CURRENT_ARTWORK_GEOMETRY_VERSION,
  });

  if (error) throw error;
  return one(data as SavedArtwork | SavedArtwork[] | null);
}

export async function renameArtwork(
  id: string,
  title: string,
): Promise<SavedArtwork> {
  const { data, error } = await requireSupabase().rpc('rename_artwork', {
    p_artwork_id: id,
    p_title: title,
  });

  if (error) throw error;
  return one(data as SavedArtwork | SavedArtwork[] | null);
}

export async function setArtworkFavorite(
  id: string,
  favorite: boolean,
): Promise<SavedArtwork> {
  const { data, error } = await requireSupabase().rpc('set_artwork_favorite', {
    p_artwork_id: id,
    p_favorite: favorite,
  });

  if (error) throw error;
  return one(data as SavedArtwork | SavedArtwork[] | null);
}

export async function deleteArtwork(id: string) {
  const { error } = await requireSupabase().rpc('delete_artwork', {
    p_artwork_id: id,
  });
  if (error) throw error;
}
