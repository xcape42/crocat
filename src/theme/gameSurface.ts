export type GameSurfaceKind = 'drawing' | 'preview';

export const DRAWING_SURFACE_ASPECT = 360 / 380;
export const PREVIEW_SURFACE_ASPECT = 360 / 480;

export function preferredGameSurfaceHeight(
  kind: GameSurfaceKind,
  viewportWidth: number,
  viewportHeight: number,
) {
  const phone = viewportWidth < 480;
  const shortViewport = viewportHeight < 720;
  const mediumViewport = viewportWidth < 900;

  if (kind === 'drawing') {
    if (phone && shortViewport) return 300;
    if (phone) return 340;
    if (mediumViewport) return 380;
    return 420;
  }

  if (phone && shortViewport) return 360;
  if (phone) return 460;
  if (mediumViewport) return 500;
  return 560;
}

export function fitGameSurface({
  availableWidth,
  availableHeight,
  preferredHeight,
  aspectRatio,
  maxWidth,
}: {
  availableWidth: number;
  availableHeight: number;
  preferredHeight: number;
  aspectRatio: number;
  maxWidth?: number;
}) {
  const widthCap = Math.max(1, Math.min(availableWidth, maxWidth ?? availableWidth));
  const heightCap = Math.max(1, availableHeight);
  const height = Math.max(1, Math.min(preferredHeight, heightCap, widthCap / aspectRatio));

  return {
    width: height * aspectRatio,
    height,
  };
}
