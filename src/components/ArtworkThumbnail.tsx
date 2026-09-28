import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { colors, radius } from '@/src/theme/tokens';
import {
  LEGACY_ARTWORK_GEOMETRY_VERSION,
  artworkClipRect,
  artworkGeometryForVersion,
  artworkPartTransform,
  drawingPath,
} from '@/src/features/artworks/geometry';
import type { SavedArtwork } from '@/src/features/artworks/types';

type Props = {
  artwork: SavedArtwork;
  width?: number;
};

export function ArtworkThumbnail({ artwork, width = 126 }: Props) {
  const geometry = artworkGeometryForVersion(artwork.geometry_version);
  const height = width * (geometry.height / geometry.width);
  const headClip = artworkClipRect('HEAD', geometry);
  const bodyClip = artworkClipRect('BODY', geometry);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={'0 0 ' + geometry.width + ' ' + geometry.height}
      style={{ borderRadius: radius.md }}
    >
      <Defs>
        <ClipPath id="thumbnail-body-clip">
          <Rect {...bodyClip} />
        </ClipPath>
        <ClipPath id="thumbnail-head-clip">
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

      {geometry.version === LEGACY_ARTWORK_GEOMETRY_VERSION ? (
        <>
          <G clipPath="url(#thumbnail-head-clip)">
          <G transform={artworkPartTransform(
          artwork.head_transform,
          geometry.headConnectionY,
          geometry,
          )}>
          {artwork.head_drawing.strokes.map((stroke) => (
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
          <G clipPath="url(#thumbnail-body-clip)">
          <G transform={artworkPartTransform(
          artwork.body_transform,
          geometry.bodyConnectionY,
          geometry,
          )}>
          {artwork.body_drawing.strokes.map((stroke) => (
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
        </>
      ) : (
        <>
          <G clipPath="url(#thumbnail-body-clip)">
          <G transform={artworkPartTransform(
          artwork.body_transform,
          geometry.bodyConnectionY,
          geometry,
          )}>
          {artwork.body_drawing.strokes.map((stroke) => (
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
          <G clipPath="url(#thumbnail-head-clip)">
          <G transform={artworkPartTransform(
          artwork.head_transform,
          geometry.headConnectionY,
          geometry,
          )}>
          {artwork.head_drawing.strokes.map((stroke) => (
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
        </>
      )}
    </Svg>
  );
}
