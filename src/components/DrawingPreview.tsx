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
import {
  ARTWORK_BODY_CONNECTION_Y,
  ARTWORK_HEAD_CONNECTION_Y,
  ARTWORK_HEIGHT,
  ARTWORK_WIDTH,
  artworkPartTransform,
  drawingPath,
} from '@/src/features/artworks/geometry';
import type { CrocatDrawing, GameRole, PartTransform } from '@/src/types/game';

type Props = {
  head: CrocatDrawing | null;
  body: CrocatDrawing | null;
  headTransform?: PartTransform;
  bodyTransform?: PartTransform;
  interactive?: boolean;
  interactiveRole?: GameRole;
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

  return (
    <G transform={artworkPartTransform(transform, connectionY)}>
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
  );
}

export function DrawingPreview({
  head,
  body,
  headTransform = { x: 0, y: 0, scale: 1 },
  bodyTransform = { x: 0, y: 0, scale: 1 },
  interactive = false,
  interactiveRole,
  onMovePart,
}: Props) {
  const layoutRef = useRef({ width: ARTWORK_WIDTH, height: ARTWORK_HEIGHT });
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

      const touchedRole: GameRole =
        event.nativeEvent.locationY < layoutRef.current.height / 2 ? 'HEAD' : 'BODY';

      if (interactiveRole && touchedRole !== interactiveRole) {
        roleRef.current = null;
        setActiveRole(null);
        return;
      }

      const role = interactiveRole ?? touchedRole;
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

      const dx = (deltaScreenX / layoutRef.current.width) * ARTWORK_WIDTH;
      const dy = (deltaScreenY / layoutRef.current.height) * ARTWORK_HEIGHT;
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
  }), [interactive, interactiveRole, onMovePart]);

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
            viewBox={`0 0 ${ARTWORK_WIDTH} ${ARTWORK_HEIGHT}`}
            preserveAspectRatio="none"
          >
            <Part drawing={head} transform={headTransform} connectionY={ARTWORK_HEAD_CONNECTION_Y} />
            <Part drawing={body} transform={bodyTransform} connectionY={ARTWORK_BODY_CONNECTION_Y} />
          </Svg>

          {interactive && (
            <>
              {(!interactiveRole || interactiveRole === 'HEAD') && (
                <View pointerEvents="none" style={[styles.partLabel, styles.headLabel]}>
                  <Text style={[styles.partLabelText, activeRole === 'HEAD' && styles.partLabelTextActive]}>
                    HEAD · DRAG
                  </Text>
                </View>
              )}
              {(!interactiveRole || interactiveRole === 'BODY') && (
                <View pointerEvents="none" style={[styles.partLabel, styles.bodyLabel]}>
                  <Text style={[styles.partLabelText, activeRole === 'BODY' && styles.partLabelTextActive]}>
                    BODY · DRAG
                  </Text>
                </View>
              )}
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
