import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { colors, radius } from '@/src/theme/tokens';
import {
  LEGACY_ARTWORK_GEOMETRY_VERSION,
  artworkClipRect,
  artworkGeometryForVersion,
  artworkPartTransform,
  drawingPath,
} from '@/src/features/artworks/geometry';
import type { ArtworkGeometry } from '@/src/features/artworks/geometry';
import type { SavedArtwork } from '@/src/features/artworks/types';
import type { GameRole } from '@/src/types/game';

type Props = {
  artwork: SavedArtwork;
  width?: number;
};

function ArtworkPart({
  artwork,
  role,
  geometry,
  clipId,
}: {
  artwork: SavedArtwork;
  role: GameRole;
  geometry: ArtworkGeometry;
  clipId: string;
}) {
  const drawing = role === 'HEAD' ? artwork.head_drawing : artwork.body_drawing;
  const transform = role === 'HEAD' ? artwork.head_transform : artwork.body_transform;
  const connectionY = role === 'HEAD'
    ? geometry.headConnectionY
    : geometry.bodyConnectionY;

  return (
    <G clipPath={`url(#${clipId})`}>
      <G transform={artworkPartTransform(transform, connectionY, geometry)}>
        {drawing.strokes.map((stroke) => (
          <Path
            key={stroke.id}
            d={drawingPath(stroke.points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={stroke.opacity}
          />
        ))}
      </G>
    </G>
  );
}

export function ArtworkThumbnail({ artwork, width = 126 }: Props) {
  const geometry = artworkGeometryForVersion(artwork.geometry_version);
  const height = width * (geometry.height / geometry.width);
  const headClip = artworkClipRect('HEAD', geometry);
  const bodyClip = artworkClipRect('BODY', geometry);
  const clipSuffix = artwork.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const headClipId = 'thumbnail-head-' + clipSuffix;
  const bodyClipId = 'thumbnail-body-' + clipSuffix;
  const legacy = geometry.version === LEGACY_ARTWORK_GEOMETRY_VERSION;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={'0 0 ' + geometry.width + ' ' + geometry.height}
      style={{ borderRadius: radius.md }}
    >
      <Defs>
        <ClipPath id={bodyClipId}>
          <Rect {...bodyClip} />
        </ClipPath>
        <ClipPath id={headClipId}>
          <Rect {...headClip} />
        </ClipPath>
      </Defs>

      <Rect
        x={0}
        y={0}
        width={geometry.width}
        height={geometry.height}
        fill={colors.card}
      />

      {legacy ? (
        <>
          <ArtworkPart
            artwork={artwork}
            role="HEAD"
            geometry={geometry}
            clipId={headClipId}
          />
          <ArtworkPart
            artwork={artwork}
            role="BODY"
            geometry={geometry}
            clipId={bodyClipId}
          />
        </>
      ) : (
        <>
          <ArtworkPart
            artwork={artwork}
            role="BODY"
            geometry={geometry}
            clipId={bodyClipId}
          />
          <ArtworkPart
            artwork={artwork}
            role="HEAD"
            geometry={geometry}
            clipId={headClipId}
          />
        </>
      )}
    </Svg>
  );
}
