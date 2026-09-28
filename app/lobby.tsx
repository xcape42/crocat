import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { CrocatCard } from '@/src/components/CrocatCard';
import { PlayerPod } from '@/src/components/PlayerPod';
import { Screen } from '@/src/components/Screen';
import { RoomSettingsPanel } from '@/src/components/game/RoomSettingsPanel';
import { useGameStore } from '@/src/store/gameStore';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

export default function LobbyScreen() {
  const router = useRouter();
  const { roomCode, roundSeconds, startRound, setRoundSeconds } = useGameStore();
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  const begin = () => {
    startRound();
    router.replace('/draw');
  };

  const localPlayers = [
    {
      displayName: 'Domi',
      colorKey: 'moss' as const,
      avatarKey: 'round' as const,
      themeKey,
      symbolKey: 'star' as const,
      role: 'HEAD',
    },
    {
      displayName: 'Sarah',
      colorKey: 'blue' as const,
      avatarKey: 'ears' as const,
      themeKey: 'moon' as const,
      symbolKey: 'moon' as const,
      role: 'BODY',
    },
  ];

  return (
    <Screen backLabel="MODES" decorations="full">
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: world.colors.accent }]}>LOCAL ROOM · {roomCode}</Text>
        <Text style={[styles.title, { color: world.colors.text }]}>Ready to make a creature?</Text>
      </View>

      <View style={styles.players}>
        {localPlayers.map((player) => (
          <PlayerPod
            key={player.displayName}
            profile={player}
            role={player.role}
            ready
          />
        ))}
      </View>

      <CrocatCard variant="surface" style={styles.note}>
        <Text style={[styles.noteTitle, { color: world.colors.text }]}>Local Split</Text>
        <Text style={[styles.noteCopy, { color: world.colors.muted }]}>
          Domi draws the HEAD first. Then pass the device to Sarah for the BODY. The player layout already scales as a collection, so future local modes can grow beyond two slots.
        </Text>
      </CrocatCard>

      <RoomSettingsPanel
        roundSeconds={roundSeconds}
        editable
        onChange={setRoundSeconds}
      />

      <View style={styles.bottom}>
        <CrocatButton onPress={begin}>START ROUND</CrocatButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.lg },
  kicker: { fontWeight: '900', letterSpacing: 1.4, fontSize: 11 },
  title: { marginTop: 7, fontSize: 40, lineHeight: 44, fontWeight: '900', letterSpacing: -1.7 },
  players: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  note: { marginTop: 16, padding: 16 },
  noteTitle: { fontWeight: '900' },
  noteCopy: { marginTop: 6, lineHeight: 20 },
  bottom: { marginTop: 'auto', paddingTop: 18 },
});
