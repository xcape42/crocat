import type { CrocatDrawing, GameRole, PartTransform, Point } from '@/src/types/game';

export const DRAWING_WIDTH = 360;
export const DRAWING_HEIGHT = 380;

export const CURRENT_ARTWORK_GEOMETRY_VERSION = 2;
export const LEGACY_ARTWORK_GEOMETRY_VERSION = 1;

export type ArtworkGeometry = {
  version: number;
  width: number;
  height: number;
  splitX: number;
  splitY: number;
  headConnectionY: number;
  bodyConnectionY: number;
  overlap: number;
};

export const LEGACY_ARTWORK_GEOMETRY: ArtworkGeometry = {
  version: LEGACY_ARTWORK_GEOMETRY_VERSION,
  width: 360,
  height: 760,
  splitX: 180,
  splitY: 380,
  headConnectionY: 360,
  bodyConnectionY: 20,
  overlap: 40,
};

export const CURRENT_ARTWORK_GEOMETRY: ArtworkGeometry = {
  version: CURRENT_ARTWORK_GEOMETRY_VERSION,
  width: 360,
  height: 480,
  splitX: 180,
  splitY: 240,
  headConnectionY: 240,
  bodyConnectionY: 140,
  overlap: 20,
};

export const ARTWORK_WIDTH = CURRENT_ARTWORK_GEOMETRY.width;
export const ARTWORK_HEIGHT = CURRENT_ARTWORK_GEOMETRY.height;
export const ARTWORK_SPLIT_X = CURRENT_ARTWORK_GEOMETRY.splitX;
export const ARTWORK_SPLIT_Y = CURRENT_ARTWORK_GEOMETRY.splitY;
export const ARTWORK_HEAD_CONNECTION_Y = CURRENT_ARTWORK_GEOMETRY.headConnectionY;
export const ARTWORK_BODY_CONNECTION_Y = CURRENT_ARTWORK_GEOMETRY.bodyConnectionY;
export const ARTWORK_OVERLAP = CURRENT_ARTWORK_GEOMETRY.overlap;

export const DRAWING_CONNECTION_ZONE = DRAWING_HEIGHT - ARTWORK_HEAD_CONNECTION_Y;

export const ARTWORK_MIN_SCALE = 0.75;
export const ARTWORK_MAX_SCALE = 1.3;
export const ARTWORK_MIN_VISIBLE = 40;

// The server intentionally keeps the original generous Adjustment envelope.
// Client bounds stay inside it while ensuring each moved part remains recoverable.
export const ARTWORK_SERVER_MAX_OFFSET_X = 360;
export const ARTWORK_SERVER_MAX_OFFSET_Y = 760;

export function artworkGeometryForVersion(version?: number | null): ArtworkGeometry {
  return version === LEGACY_ARTWORK_GEOMETRY_VERSION
    ? LEGACY_ARTWORK_GEOMETRY
    : CURRENT_ARTWORK_GEOMETRY;
}

/**
 * Source-space crop for one drawing half.
 *
 * Crocat 1.8 keeps the full 360x380 drawing surface but uses only the source
 * region around the semantic connection as the initial final composition.
 * The crop is applied INSIDE the part transform so it travels with the part
 * during Adjustment instead of pinning HEAD to the top and BODY to the bottom.
 */
export function artworkClipRect(
  role: GameRole,
  geometry: ArtworkGeometry = CURRENT_ARTWORK_GEOMETRY,
) {
  if (geometry.version === LEGACY_ARTWORK_GEOMETRY_VERSION) {
    return { x: 0, y: 0, width: DRAWING_WIDTH, height: DRAWING_HEIGHT };
  }

  const halfOverlap = geometry.overlap / 2;

  if (role === 'HEAD') {
    return {
      x: 0,
      y: 0,
      width: DRAWING_WIDTH,
      height: geometry.headConnectionY + halfOverlap,
    };
  }

  const y = geometry.bodyConnectionY - halfOverlap;
  return {
    x: 0,
    y,
    width: DRAWING_WIDTH,
    height: DRAWING_HEIGHT - y,
  };
}

export function artworkTransformBounds(
  role: GameRole,
  scale: number,
  geometry: ArtworkGeometry = CURRENT_ARTWORK_GEOMETRY,
) {
  const clip = artworkClipRect(role, geometry);
  const connectionY = role === 'HEAD'
    ? geometry.headConnectionY
    : geometry.bodyConnectionY;

  const leftAtZero =
    geometry.splitX + scale * (clip.x - geometry.splitX);
  const rightAtZero =
    geometry.splitX + scale * (clip.x + clip.width - geometry.splitX);
  const topAtZero =
    geometry.splitY + scale * (clip.y - connectionY);
  const bottomAtZero =
    geometry.splitY + scale * (clip.y + clip.height - connectionY);

  return {
    minX: Math.max(
      -ARTWORK_SERVER_MAX_OFFSET_X,
      ARTWORK_MIN_VISIBLE - rightAtZero,
    ),
    maxX: Math.min(
      ARTWORK_SERVER_MAX_OFFSET_X,
      geometry.width - ARTWORK_MIN_VISIBLE - leftAtZero,
    ),
    minY: Math.max(
      -ARTWORK_SERVER_MAX_OFFSET_Y,
      ARTWORK_MIN_VISIBLE - bottomAtZero,
    ),
    maxY: Math.min(
      ARTWORK_SERVER_MAX_OFFSET_Y,
      geometry.height - ARTWORK_MIN_VISIBLE - topAtZero,
    ),
  };
}

export function clampArtworkTransform(
  transform: PartTransform,
  role: GameRole,
  geometry: ArtworkGeometry = CURRENT_ARTWORK_GEOMETRY,
): PartTransform {
  const scale = Math.max(
    ARTWORK_MIN_SCALE,
    Math.min(ARTWORK_MAX_SCALE, transform.scale),
  );
  const bounds = artworkTransformBounds(role, scale, geometry);

  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, transform.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, transform.y)),
    scale,
  };
}

export function drawingPath(points: Point[]) {
  return points.length
    ? points
      .map((point, index) => (index === 0 ? 'M' : 'L') + ' ' + point.x + ' ' + point.y)
      .join(' ')
    : '';
}

export function artworkPartTransform(
  transform: PartTransform,
  connectionY: number,
  geometry: ArtworkGeometry = CURRENT_ARTWORK_GEOMETRY,
) {
  const targetX = geometry.splitX + transform.x;
  const targetY = geometry.splitY + transform.y;

  return (
    'translate(' + targetX + ' ' + targetY + ') ' +
    'scale(' + transform.scale + ') ' +
    'translate(' + (-geometry.splitX) + ' ' + (-connectionY) + ')'
  );
}

export function drawingHasContent(drawing: CrocatDrawing | null | undefined) {
  return Boolean(drawing?.strokes.some((stroke) => stroke.points.length > 0));
}
