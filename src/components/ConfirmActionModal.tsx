import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmActionModal({
  visible,
  title,
  message,
  confirmLabel = 'YES',
  cancelLabel = 'NO',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={busy ? undefined : onCancel}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close confirmation"
          disabled={busy}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.card,
            {
              borderColor: world.colors.text,
              borderRadius: world.shapes.cardRadius,
              backgroundColor: world.colors.card,
            },
          ]}
        >
          <Text style={[styles.title, { color: world.colors.text }]}>{title}</Text>
          {!!message && (
            <Text style={[styles.message, { color: world.colors.muted }]}>{message}</Text>
          )}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                {
                  borderColor: world.colors.text,
                  borderRadius: world.shapes.buttonRadius,
                  backgroundColor: world.colors.surface,
                },
                pressed && !busy && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={[styles.buttonText, { color: world.colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                {
                  borderColor: world.colors.text,
                  borderRadius: world.shapes.buttonRadius,
                  backgroundColor: world.colors.accent,
                },
                pressed && !busy && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={[styles.buttonText, { color: world.colors.text }]}>
                {busy ? '…' : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.lg,
    gap: 10,
    borderWidth: 2,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  actions: { marginTop: 8, flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  buttonText: { fontSize: 14, fontWeight: '900', letterSpacing: 0.8 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  disabled: { opacity: 0.45 },
});
