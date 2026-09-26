import { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { GameSurfaceSlot } from '@/src/components/GameSurfaceSlot';
import { PREVIEW_SURFACE_ASPECT } from '@/src/theme/gameSurface';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing, GameRole, PartTransform, Point } from '@/src/types/game';

const VIRTUAL_WIDTH = 360;
const VIRTUAL_HEIGHT = 760;
const SPLIT_X = VIRTUAL_WIDTH / 2;
const SPLIT_Y = VIRTUAL_HEIGHT / 2;
const CONNECTION_INSET = 20;
const HEAD_CONNECTION_Y = 380 - CONNECTION_INSET;
const BODY_CONNECTION_Y = CONNECTION_INSET;

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
};

function Part({
  drawing,
  transform,
  connectionY,
}: {
  drawing: CrocatDrawing | null;
  transform: PartTransform;
  connectionY: number;
}) {
  if (!drawing) return null;

  const targetX = SPLIT_X + transform.x;
  const targetY = SPLIT_Y + transform.y;

  return (
    <G
      transform={`translate(${targetX} ${targetY}) scale(${transform.scale}) translate(${-SPLIT_X} ${-connectionY})`}
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
}: Props) {
  const layoutRef = useRef({ width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT });
  const roleRef = useRef<GameRole | null>(null);
  const lastGestureRef = useRef({ x: 0, y: 0 });
  const [activeRole, setActiveRole] = useState<GameRole | null>(null);

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

  const onFrameLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) layoutRef.current = { width, height };
  };

  return (
    <GameSurfaceSlot kind="preview" aspectRatio={PREVIEW_SURFACE_ASPECT} maxWidth={360}>
      {({ width, height }) => (
        <View
          style={[
            styles.frame,
            { width, height },
            interactive && Platform.OS === 'web' && ({ touchAction: 'none', userSelect: 'none' } as never),
          ]}
          onLayout={onFrameLayout}
          {...(interactive ? responder.panHandlers : {})}
        >
          <Svg
            pointerEvents="none"
            width="100%"
            height="100%"
            viewBox="0 0 360 760"
            preserveAspectRatio="none"
          >
            <Part drawing={head} transform={headTransform} connectionY={HEAD_CONNECTION_Y} />
            <Part drawing={body} transform={bodyTransform} connectionY={BODY_CONNECTION_Y} />
          </Svg>

          {interactive && (
            <>
              <View pointerEvents="none" style={[styles.partLabel, styles.headLabel]}>
                <Text style={[styles.partLabelText, activeRole === 'HEAD' && styles.partLabelTextActive]}>HEAD · DRAG</Text>
              </View>
              <View pointerEvents="none" style={[styles.partLabel, styles.bodyLabel]}>
                <Text style={[styles.partLabelText, activeRole === 'BODY' && styles.partLabelTextActive]}>BODY · DRAG</Text>
              </View>
              <View pointerEvents="none" style={styles.splitGuide} />
            </>
          )}
        </View>
      )}
    </GameSurfaceSlot>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexGrow: 0,
    flexShrink: 0,
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
    right: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  headLabel: { top: 8 },
  bodyLabel: { bottom: 8 },
  partLabelText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    opacity: 0.78,
  },
  partLabelTextActive: {
    color: colors.coral,
    opacity: 1,
  },
});
