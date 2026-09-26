import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function LobbyScreen() {
  const router = useRouter();
  const { roomCode, roundSeconds, startRound } = useGameStore();

  const begin = () => {
    startRound();
    router.replace('/draw');
  };

  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← MODES</Text>
      <View style={styles.header}>
        <Text style={styles.kicker}>LOCAL ROOM · {roomCode}</Text>
        <Text style={styles.title}>Ready to make a creature?</Text>
      </View>

      <View style={styles.players}>
        <View style={[styles.player, { backgroundColor: colors.moss }]}>
          <Text style={styles.avatar}>◉ᴗ◉</Text>
          <View style={styles.playerText}><Text style={styles.name}>Domi</Text><Text style={styles.role}>HEAD · READY</Text></View>
        </View>
        <View style={[styles.player, { backgroundColor: colors.blue }]}>
          <Text style={styles.avatar}>•ᴗ•</Text>
          <View style={styles.playerText}><Text style={styles.name}>Sarah</Text><Text style={styles.role}>BODY · READY</Text></View>
        </View>
      </View>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Local Split</Text>
        <Text style={styles.noteCopy}>Domi draws the HEAD first. Then pass the device to Sarah for the BODY. No names need to be entered before the game.</Text>
        <Text style={styles.noteMeta}>ROUND · {Math.round(roundSeconds / 60)} MINUTES</Text>
      </View>

      <View style={styles.bottom}><CrocatButton onPress={begin}>START ROUND</CrocatButton></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: { marginTop: spacing.xl, marginBottom: spacing.xl },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.4, fontSize: 12 },
  title: { marginTop: 8, fontSize: 44, lineHeight: 48, fontWeight: '900', letterSpacing: -1.8, color: colors.ink },
  players: { gap: 12 },
  player: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink, textAlign: 'center', textAlignVertical: 'center', paddingTop: 18, fontWeight: '900' },
  playerText: { marginLeft: 14 },
  name: { fontWeight: '900', fontSize: 18, color: colors.ink },
  role: { marginTop: 4, fontWeight: '800', color: colors.ink, opacity: 0.6, fontSize: 12, letterSpacing: 1 },
  note: { marginTop: 18, padding: 18, borderRadius: radius.md, backgroundColor: colors.card },
  noteTitle: { fontWeight: '900', color: colors.ink },
  noteCopy: { marginTop: 6, color: colors.muted, lineHeight: 21 },
  noteMeta: { marginTop: 14, fontSize: 11, color: colors.muted, fontWeight: '900', letterSpacing: 1.2 },
  bottom: { marginTop: 'auto', paddingTop: 18 },
});
