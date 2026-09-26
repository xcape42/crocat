import type { ReactNode } from 'react';
import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  fitGameSurface,
  preferredGameSurfaceHeight,
  type GameSurfaceKind,
} from '@/src/theme/gameSurface';

type Size = { width: number; height: number };

type Props = {
  kind: GameSurfaceKind;
  aspectRatio: number;
  maxWidth?: number;
  children: (size: Size) => ReactNode;
};

export function GameSurfaceSlot({
  kind,
  aspectRatio,
  maxWidth,
  children,
}: Props) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [available, setAvailable] = useState<Size>({ width: 0, height: 0 });

  const preferredHeight = preferredGameSurfaceHeight(kind, viewportWidth, viewportHeight);
  const fallbackWidth = Math.max(
    160,
    Math.min(maxWidth ?? viewportWidth, viewportWidth - (viewportWidth < 480 ? 28 : 48)),
  );

  const size = fitGameSurface({
    availableWidth: available.width || fallbackWidth,
    availableHeight: available.height || preferredHeight,
    preferredHeight,
    aspectRatio,
    maxWidth,
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setAvailable({ width, height });
  };

  return (
    <View style={styles.slot} onLayout={onLayout}>
      {children(size)}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
