import { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GameSurfaceSlot } from '@/src/components/GameSurfaceSlot';
import { DRAWING_SURFACE_ASPECT } from '@/src/theme/gameSurface';
import { webArtworkGestureLock } from '@/src/theme/interaction';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { colors } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';
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
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const [activePoints, setActivePoints] = useState<Point[]>([]);
  const activeRef = useRef<Point[]>([]);
  const layoutRef = useRef({ width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT });

  const toVirtualPoint = (x: number, y: number): Point => ({
    x: Math.max(0, Math.min(VIRTUAL_WIDTH, (x / layoutRef.current.width) * VIRTUAL_WIDTH)),
    y: Math.max(0, Math.min(VIRTUAL_HEIGHT, (y / layoutRef.current.height) * VIRTUAL_HEIGHT)),
  });

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: (event) => {
      if (Platform.OS === 'web') event.preventDefault();
      const point = toVirtualPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      activeRef.current = [point];
      setActivePoints([point]);
    },
    onPanResponderMove: (event) => {
      if (Platform.OS === 'web') event.preventDefault();
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

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) layoutRef.current = { width, height };
  };

  return (
    <GameSurfaceSlot kind="drawing" aspectRatio={DRAWING_SURFACE_ASPECT} maxWidth={520}>
      {({ width, height }) => (
        <View
          style={[
            styles.canvas,
            {
              width,
              height,
              backgroundColor: world.colors.canvas,
              borderColor: world.colors.text,
              borderRadius: world.shapes.canvasRadius,
            },
            webArtworkGestureLock,
          ]}
          onLayout={onCanvasLayout}
          {...responder.panHandlers}
        >
          {role && (
            <View
              pointerEvents="none"
              style={[
                styles.connectionZone,
                role === 'BODY' ? styles.connectionZoneTop : styles.connectionZoneBottom,
                {
                  height: (40 / VIRTUAL_HEIGHT) * height,
                  backgroundColor: role === 'BODY'
                    ? world.colors.primary
                    : world.colors.secondary,
                },
              ]}
            />
          )}

          <Svg
            pointerEvents="none"
            width="100%"
            height="100%"
            viewBox={`0 0 ${VIRTUAL_WIDTH} ${VIRTUAL_HEIGHT}`}
            preserveAspectRatio="none"
            style={[StyleSheet.absoluteFill, webArtworkGestureLock]}
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
      )}
    </GameSurfaceSlot>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 2,
    overflow: 'hidden',
  },
  connectionZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0.08,
  },
  connectionZoneTop: { top: 0 },
  connectionZoneBottom: { bottom: 0 },
  connectionGuide: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.muted,
    opacity: 0.55,
  },
  connectionGuideTop: { top: 40 },
  connectionGuideBottom: { bottom: 40 },
});
