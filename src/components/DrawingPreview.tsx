import { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { GameSurfaceSlot } from '@/src/components/GameSurfaceSlot';
import { webArtworkGestureLock } from '@/src/theme/interaction';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { colors } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';
import {
  CURRENT_ARTWORK_GEOMETRY_VERSION,
  LEGACY_ARTWORK_GEOMETRY_VERSION,
  artworkClipRect,
  artworkGeometryForVersion,
  artworkPartBounds,
  artworkPartTransform,
  drawingPath,
} from '@/src/features/artworks/geometry';
import type { ArtworkGeometry } from '@/src/features/artworks/geometry';
import type { CrocatDrawing, GameRole, PartTransform } from '@/src/types/game';

type Props = {
  head: CrocatDrawing | null;
  body: CrocatDrawing | null;
  headTransform?: PartTransform;
  bodyTransform?: PartTransform;
  geometryVersion?: number;
  interactive?: boolean;
  interactiveRole?: GameRole;
  onMovePart?: (role: GameRole, dx: number, dy: number) => void;
};

function pointInside(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number },
) {
  return x >= rect.x
    && x <= rect.x + rect.width
    && y >= rect.y
    && y <= rect.y + rect.height;
}

function Part({
  drawing,
  transform,
  connectionY,
  geometry,
  clipId,
}: {
  drawing: CrocatDrawing | null;
  transform: PartTransform;
  connectionY: number;
  geometry: ArtworkGeometry;
  clipId: string;
}) {
  if (!drawing) return null;

  return (
    <G transform={artworkPartTransform(transform, connectionY, geometry)}>
      <G clipPath={`url(#${clipId})`}>
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

export function DrawingPreview({
  head,
  body,
  headTransform = { x: 0, y: 0, scale: 1 },
  bodyTransform = { x: 0, y: 0, scale: 1 },
  geometryVersion = CURRENT_ARTWORK_GEOMETRY_VERSION,
  interactive = false,
  interactiveRole,
  onMovePart,
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const geometry = artworkGeometryForVersion(geometryVersion);
  const headClip = artworkClipRect('HEAD', geometry);
  const bodyClip = artworkClipRect('BODY', geometry);
  const layoutRef = useRef({ width: geometry.width, height: geometry.height });
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
      if (Platform.OS === 'web') event.preventDefault();

      let role: GameRole;

      if (interactiveRole) {
        role = interactiveRole;
      } else {
        const virtualX =
          (event.nativeEvent.locationX / layoutRef.current.width) * geometry.width;
        const virtualY =
          (event.nativeEvent.locationY / layoutRef.current.height) * geometry.height;
        const headBounds = artworkPartBounds('HEAD', headTransform, geometry);
        const bodyBounds = artworkPartBounds('BODY', bodyTransform, geometry);

        if (pointInside(virtualX, virtualY, headBounds)) {
          role = 'HEAD';
        } else if (pointInside(virtualX, virtualY, bodyBounds)) {
          role = 'BODY';
        } else {
          role = virtualY < geometry.splitY ? 'HEAD' : 'BODY';
        }
      }

      roleRef.current = role;
      lastGestureRef.current = { x: 0, y: 0 };
      setActiveRole(role);
    },
    onPanResponderMove: (event, gestureState) => {
      if (Platform.OS === 'web') event.preventDefault();
      const role = roleRef.current;
      if (!interactive || !role || !onMovePart) return;

      const deltaScreenX = gestureState.dx - lastGestureRef.current.x;
      const deltaScreenY = gestureState.dy - lastGestureRef.current.y;
      lastGestureRef.current = { x: gestureState.dx, y: gestureState.dy };

      const dx = (deltaScreenX / layoutRef.current.width) * geometry.width;
      const dy = (deltaScreenY / layoutRef.current.height) * geometry.height;
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
  }), [
    bodyTransform,
    geometry,
    headTransform,
    interactive,
    interactiveRole,
    onMovePart,
  ]);

  const onFrameLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) layoutRef.current = { width, height };
  };

  return (
    <GameSurfaceSlot
      kind="preview"
      aspectRatio={geometry.width / geometry.height}
      maxWidth={360}
    >
      {({ width, height }) => (
        <View
          style={[
            styles.frame,
            {
              width,
              height,
              backgroundColor: world.colors.canvas,
              borderColor: world.colors.text,
              borderRadius: world.shapes.canvasRadius,
            },
            webArtworkGestureLock,
          ]}
          onLayout={onFrameLayout}
          {...(interactive ? responder.panHandlers : {})}
        >
          <Svg
            pointerEvents="none"
            style={webArtworkGestureLock}
            width="100%"
            height="100%"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
          >
            <Defs>
              <ClipPath id="body-artwork-clip">
                <Rect {...bodyClip} />
              </ClipPath>
              <ClipPath id="head-artwork-clip">
                <Rect {...headClip} />
              </ClipPath>
            </Defs>

            {geometry.version === LEGACY_ARTWORK_GEOMETRY_VERSION ? (
              <>
                <Part
                  drawing={head}
                  transform={headTransform}
                  connectionY={geometry.headConnectionY}
                  geometry={geometry}
                  clipId="head-artwork-clip"
                />
                <Part
                  drawing={body}
                  transform={bodyTransform}
                  connectionY={geometry.bodyConnectionY}
                  geometry={geometry}
                  clipId="body-artwork-clip"
                />
              </>
            ) : (
              <>
                <Part
                  drawing={body}
                  transform={bodyTransform}
                  connectionY={geometry.bodyConnectionY}
                  geometry={geometry}
                  clipId="body-artwork-clip"
                />
                <Part
                  drawing={head}
                  transform={headTransform}
                  connectionY={geometry.headConnectionY}
                  geometry={geometry}
                  clipId="head-artwork-clip"
                />
              </>
            )}
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
    borderWidth: 2,
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
