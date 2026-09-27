import Svg, { G, Path, Rect } from 'react-native-svg';
import { colors, radius } from '@/src/theme/tokens';
import {
  ARTWORK_BODY_CONNECTION_Y,
  ARTWORK_HEAD_CONNECTION_Y,
  ARTWORK_HEIGHT,
  ARTWORK_WIDTH,
  artworkPartTransform,
  drawingPath,
} from '@/src/features/artworks/geometry';
import type { SavedArtwork } from '@/src/features/artworks/types';

type Props = {
  artwork: SavedArtwork;
  width?: number;
};

export function ArtworkThumbnail({ artwork, width = 126 }: Props) {
  const height = width * (ARTWORK_HEIGHT / ARTWORK_WIDTH);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={'0 0 ' + ARTWORK_WIDTH + ' ' + ARTWORK_HEIGHT}
      style={{ borderRadius: radius.md }}
    >
      <Rect
        x={0}
        y={0}
        width={ARTWORK_WIDTH}
        height={ARTWORK_HEIGHT}
        fill={colors.card}
      />
      <G transform={artworkPartTransform(
        artwork.head_transform,
        ARTWORK_HEAD_CONNECTION_Y,
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
      <G transform={artworkPartTransform(
        artwork.body_transform,
        ARTWORK_BODY_CONNECTION_Y,
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
    </Svg>
  );
}
