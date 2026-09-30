import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DRAWING_BRUSHES,
  DRAWING_PALETTE,
} from '@/src/theme/drawingTools';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  color: string;
  brushWidth: number;
  onColorChange: (color: string) => void;
  onBrushWidthChange: (width: number) => void;
  onUndo: () => void;
  onClear: () => void;
};

export function DrawingToolbar({
  color,
  brushWidth,
  onColorChange,
  onBrushWidthChange,
  onUndo,
  onClear,
}: Props) {
  return (
    <View style={styles.toolbar}>
      <View style={styles.palette}>
        {DRAWING_PALETTE.map((item) => {
          const selected = color === item.color;

          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label + ' drawing color'}
              accessibilityState={{ selected }}
              hitSlop={4}
              onPress={() => onColorChange(item.color)}
              style={({ pressed }) => [
                styles.colorButton,
                selected && styles.colorButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: item.color,
                    borderColor: item.key === 'ink' ? colors.ink : colors.line,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.brushes}>
        {DRAWING_BRUSHES.map((item) => {
          const selected = brushWidth === item.width;

          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label + ' brush'}
              accessibilityState={{ selected }}
              hitSlop={4}
              onPress={() => onBrushWidthChange(item.width)}
              style={({ pressed }) => [
                styles.brushButton,
                selected && styles.brushButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.brushLine,
                  { height: Math.max(2, Math.round(item.width * 0.65)) },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo last stroke"
          hitSlop={4}
          onPress={onUndo}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>UNDO</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear drawing"
          hitSlop={4}
          onPress={onClear}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>CLEAR</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    minHeight: 38,
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  palette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  colorButton: {
    width: 25,
    height: 25,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorButtonActive: {
    borderColor: colors.ink,
  },
  swatch: {
    width: 17,
    height: 17,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  brushes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  brushButton: {
    width: 25,
    height: 25,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brushButtonActive: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  brushLine: {
    width: 15,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  action: {
    minHeight: 25,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  pressed: {
    opacity: 0.58,
  },
});
