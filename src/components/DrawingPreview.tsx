import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing, PartTransform, Point } from '@/src/types/game';

const pathFor = (points: Point[]) => points.length
  ? points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  : '';

type Props = {
  head: CrocatDrawing | null;
  body: CrocatDrawing | null;
  headTransform?: PartTransform;
  bodyTransform?: PartTransform;
};

function Part({ drawing, transform, yOffset }: { drawing: CrocatDrawing | null; transform: PartTransform; yOffset: number }) {
  if (!drawing) return null;
  return (
    <G transform={`translate(${transform.x} ${yOffset + transform.y}) scale(${transform.scale})`}>
      {drawing.strokes.map((stroke) => (
        <Path
          key={stroke.id}
          d={pathFor(stroke.points)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={stroke.opacity}
        />
      ))}
    </G>
  );
}

export function DrawingPreview({
  head,
  body,
  headTransform = { x: 0, y: 0, scale: 1 },
  bodyTransform = { x: 0, y: 0, scale: 1 },
}: Props) {
  return (
    <View style={styles.frame}>
      <Svg width="100%" height="100%" viewBox="0 0 360 760" preserveAspectRatio="xMidYMid meet">
        <Part drawing={head} transform={headTransform} yOffset={0} />
        <Part drawing={body} transform={bodyTransform} yOffset={380} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 520,
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: 2,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
