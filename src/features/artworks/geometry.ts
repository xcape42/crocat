import type { CrocatDrawing, PartTransform, Point } from '@/src/types/game';

export const ARTWORK_WIDTH = 360;
export const ARTWORK_HEIGHT = 480;
export const ARTWORK_SPLIT_X = ARTWORK_WIDTH / 2;
export const ARTWORK_SPLIT_Y = ARTWORK_HEIGHT / 2;

// Keep each original 360 × 380 drawing intact. These anchors place HEAD at y=0
// and BODY at y=100, so the two drawings overlap inside the 360 × 480 artwork.
export const ARTWORK_HEAD_CONNECTION_Y = 240;
export const ARTWORK_BODY_CONNECTION_Y = 140;

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
) {
  const targetX = ARTWORK_SPLIT_X + transform.x;
  const targetY = ARTWORK_SPLIT_Y + transform.y;

  return (
    'translate(' + targetX + ' ' + targetY + ') ' +
    'scale(' + transform.scale + ') ' +
    'translate(' + (-ARTWORK_SPLIT_X) + ' ' + (-connectionY) + ')'
  );
}

export function drawingHasContent(drawing: CrocatDrawing | null | undefined) {
  return Boolean(drawing?.strokes.some((stroke) => stroke.points.length > 0));
}
