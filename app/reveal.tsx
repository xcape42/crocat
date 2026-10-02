import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { colors } from '@/src/theme/tokens';

export default function RevealScreen() {
  const router = useRouter();
  const setPhase = useGameStore((state) => state.setPhase);
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const leave = () => {
    setPhase('HOME');
    router.replace('/');
  };

  return (
    <Screen backLabel="LEAVE" onBack={() => setLeaveConfirmOpen(true)} decorations="full">
      <View style={styles.center}>
        <Text style={styles.kicker}>BOTH HALVES ARE IN</Text>
        <View style={styles.mascot}><Mascot state="celebrate" size={112} /></View>
        <Text style={styles.title}>Meet your Crocat.</Text>
        <Text style={styles.copy}>No more secrets. Time for the reveal.</Text>
      </View>
      <CrocatButton variant="coral" onPress={() => router.replace('/finalize')}>REVEAL</CrocatButton>
      <ConfirmActionModal
        visible={leaveConfirmOpen}
        title="Leave the game?"
        message="Your current local round will be abandoned."
        confirmLabel="YES, LEAVE"
        cancelLabel="NO"
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={leave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.muted, fontWeight: '900', letterSpacing: 1.6, fontSize: 11 },
  mascot: { marginVertical: 18 },
  title: { fontSize: 46, fontWeight: '900', letterSpacing: -1.8, color: colors.ink, textAlign: 'center' },
  copy: { marginTop: 10, fontSize: 17, color: colors.muted },
});
