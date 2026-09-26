import { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing, GameRole, Point, Stroke } from '@/src/types/game';

type Props = {
  drawing: CrocatDrawing;
  onChange: (drawing: CrocatDrawing) => void;
  role?: GameRole;
  color?: string;
  brushWidth?: number;
};

const VIRTUAL_WIDTH = 360;
const VIRTUAL_HEIGHT = 380;
const ASPECT_RATIO = VIRTUAL_WIDTH / VIRTUAL_HEIGHT;

const pathFor = (points: Point[]) => points.length
  ? points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  : '';

export function DrawingCanvas({
  drawing,
  onChange,
  role,
  color = colors.ink,
  brushWidth = 6,
}: Props) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const [activePoints, setActivePoints] = useState<Point[]>([]);
  const activeRef = useRef<Point[]>([]);
  const layoutRef = useRef({ width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT });

  const horizontalRoom = Math.max(220, viewportWidth - (viewportWidth < 480 ? 28 : 48));
  const heightCap = Math.max(220, Math.min(470, viewportHeight * 0.48));
  const canvasHeight = Math.min(heightCap, horizontalRoom / ASPECT_RATIO);
  const canvasWidth = canvasHeight * ASPECT_RATIO;

  const toVirtualPoint = (x: number, y: number): Point => ({
    x: Math.max(0, Math.min(VIRTUAL_WIDTH, (x / layoutRef.current.width) * VIRTUAL_WIDTH)),
    y: Math.max(0, Math.min(VIRTUAL_HEIGHT, (y / layoutRef.current.height) * VIRTUAL_HEIGHT)),
  });

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const point = toVirtualPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      activeRef.current = [point];
      setActivePoints([point]);
    },
    onPanResponderMove: (event) => {
      const point = toVirtualPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      const next = [...activeRef.current, point];
      activeRef.current = next;
      setActivePoints(next);
    },
    onPanResponderRelease: () => {
      if (activeRef.current.length > 1) {
        const stroke: Stroke = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          points: activeRef.current,
          color,
          width: brushWidth,
          opacity: 1,
        };
        onChange({ ...drawing, strokes: [...drawing.strokes, stroke] });
      }
      activeRef.current = [];
      setActivePoints([]);
    },
    onPanResponderTerminate: () => {
      activeRef.current = [];
      setActivePoints([]);
    },
    onPanResponderTerminationRequest: () => false,
  }), [brushWidth, color, drawing, onChange]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) layoutRef.current = { width, height };
  };

  return (
    <View
      style={[styles.canvas, { width: canvasWidth, height: canvasHeight }]}
      onLayout={onLayout}
      {...responder.panHandlers}
    >
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIRTUAL_WIDTH} ${VIRTUAL_HEIGHT}`}
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
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
        {activePoints.length > 1 && (
          <Path
            d={pathFor(activePoints)}
            fill="none"
            stroke={color}
            strokeWidth={brushWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>

      {role && (
        <View
          pointerEvents="none"
          style={[
            styles.connectionGuide,
            role === 'BODY' ? styles.connectionGuideTop : styles.connectionGuideBottom,
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    overflow: 'hidden',
  },
  connectionGuide: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.muted,
    opacity: 0.55,
  },
  connectionGuideTop: { top: 20 },
  connectionGuideBottom: { bottom: 20 },
});
