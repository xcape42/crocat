import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import { useCurrentProfileVisual } from '@/src/hooks/useCurrentProfileVisual';
import { useGameStore } from '@/src/store/gameStore';
import { colors, spacing } from '@/src/theme/tokens';

export default function HandoffScreen() {
  const router = useRouter();
  const setPhase = useGameStore((state) => state.setPhase);
  const profile = useCurrentProfileVisual();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const leave = () => {
    setPhase('HOME');
    router.replace('/');
  };

  return (
    <Screen backLabel="LEAVE" onBack={() => setLeaveConfirmOpen(true)} decorations="full">
      <View style={styles.center}>
        <Text style={styles.kicker}>DON'T PEEK.</Text>
        <View style={styles.mascot}><Mascot profile={profile ?? undefined} state="shy" size={104} /></View>
        <Text style={styles.title}>Pass it to Sarah.</Text>
        <Text style={styles.copy}>Domi's head is safely hidden. Sarah gets the BODY and a fresh canvas with the connection line at the top.</Text>
      </View>
      <CrocatButton onPress={() => router.replace('/draw')}>I'M SARAH</CrocatButton>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  mascot: { marginVertical: 14 },
  title: { fontSize: 44, lineHeight: 48, fontWeight: '900', letterSpacing: -1.8, color: colors.ink, textAlign: 'center' },
  copy: { marginTop: 12, maxWidth: 420, textAlign: 'center', fontSize: 17, lineHeight: 24, color: colors.muted },
});
