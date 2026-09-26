import { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing, GameRole, PartTransform, Point } from '@/src/types/game';

const VIRTUAL_WIDTH = 360;
const VIRTUAL_HEIGHT = 760;
const ASPECT_RATIO = VIRTUAL_WIDTH / VIRTUAL_HEIGHT;

const pathFor = (points: Point[]) => points.length
  ? points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  : '';

type Props = {
  head: CrocatDrawing | null;
  body: CrocatDrawing | null;
  headTransform?: PartTransform;
  bodyTransform?: PartTransform;
  interactive?: boolean;
  onMovePart?: (role: GameRole, dx: number, dy: number) => void;
  maxHeightRatio?: number;
};

function Part({
  drawing,
  transform,
  yOffset,
}: {
  drawing: CrocatDrawing | null;
  transform: PartTransform;
  yOffset: number;
}) {
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
  interactive = false,
  onMovePart,
  maxHeightRatio = 0.56,
}: Props) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const layoutRef = useRef({ width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT });
  const roleRef = useRef<GameRole | null>(null);
  const lastGestureRef = useRef({ x: 0, y: 0 });
  const [activeRole, setActiveRole] = useState<GameRole | null>(null);

  const horizontalRoom = Math.max(160, viewportWidth - (viewportWidth < 480 ? 28 : 48));
  const heightCap = Math.max(220, Math.min(620, viewportHeight * maxHeightRatio));
  const frameHeight = Math.min(heightCap, horizontalRoom / ASPECT_RATIO);
  const frameWidth = frameHeight * ASPECT_RATIO;

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => interactive,
    onMoveShouldSetPanResponder: () => interactive,
    onStartShouldSetPanResponderCapture: () => interactive,
    onMoveShouldSetPanResponderCapture: () => interactive,
    onPanResponderGrant: (event) => {
      if (!interactive) return;
      const role: GameRole = event.nativeEvent.locationY < layoutRef.current.height / 2 ? 'HEAD' : 'BODY';
      roleRef.current = role;
      lastGestureRef.current = { x: 0, y: 0 };
      setActiveRole(role);
    },
    onPanResponderMove: (_, gestureState) => {
      const role = roleRef.current;
      if (!interactive || !role || !onMovePart) return;

      const deltaScreenX = gestureState.dx - lastGestureRef.current.x;
      const deltaScreenY = gestureState.dy - lastGestureRef.current.y;
      lastGestureRef.current = { x: gestureState.dx, y: gestureState.dy };

      const dx = (deltaScreenX / layoutRef.current.width) * VIRTUAL_WIDTH;
      const dy = (deltaScreenY / layoutRef.current.height) * VIRTUAL_HEIGHT;
      onMovePart(role, dx, dy);
    },
    onPanResponderRelease: () => {
      roleRef.current = null;
      lastGestureRef.current = { x: 0, y: 0 };
      setActiveRole(null);
    },
    onPanResponderTerminate: () => {
      roleRef.current = null;
      lastGestureRef.current = { x: 0, y: 0 };
      setActiveRole(null);
    },
    onPanResponderTerminationRequest: () => false,
  }), [interactive, onMovePart]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) layoutRef.current = { width, height };
  };

  return (
    <View
      style={[
        styles.frame,
        { width: frameWidth, height: frameHeight },
        interactive && Platform.OS === 'web' && ({ touchAction: 'none', userSelect: 'none' } as never),
      ]}
      onLayout={onLayout}
      {...(interactive ? responder.panHandlers : {})}
    >
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        viewBox="0 0 360 760"
        preserveAspectRatio="none"
      >
        <Part drawing={head} transform={headTransform} yOffset={0} />
        <Part drawing={body} transform={bodyTransform} yOffset={380} />
      </Svg>

      {interactive && (
        <>
          <View pointerEvents="none" style={[styles.partLabel, styles.headLabel, activeRole === 'HEAD' && styles.partLabelActive]}>
            <Text style={styles.partLabelText}>DRAG HEAD</Text>
          </View>
          <View pointerEvents="none" style={[styles.partLabel, styles.bodyLabel, activeRole === 'BODY' && styles.partLabelActive]}>
            <Text style={styles.partLabelText}>DRAG BODY</Text>
          </View>
          <View pointerEvents="none" style={styles.splitGuide} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: 2,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  splitGuide: {
    position: 'absolute',
    top: '50%',
    left: 12,
    right: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  partLabel: {
    position: 'absolute',
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  partLabelActive: {
    backgroundColor: colors.lime,
  },
  headLabel: { top: 8 },
  bodyLabel: { bottom: 8 },
  partLabelText: {
    color: colors.ink,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
});
