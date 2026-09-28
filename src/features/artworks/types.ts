import type { ProfileSnapshot } from '@/src/features/profile/types';
import type { CrocatDrawing, PartTransform } from '@/src/types/game';

export type SavedArtwork = {
  id: string;
  owner_id: string;
  partner_user_id: string | null;
  round_id: string | null;
  title: string;
  prompt_term: string | null;
  prompt_theme: string | null;
  head_drawing: CrocatDrawing;
  body_drawing: CrocatDrawing;
  head_transform: PartTransform;
  body_transform: PartTransform;
  head_profile: ProfileSnapshot;
  body_profile: ProfileSnapshot;
  favorite: boolean;
  geometry_version: number;
  created_at: string;
  updated_at: string;
};
