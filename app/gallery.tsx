import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArtworkThumbnail } from '@/src/components/ArtworkThumbnail';
import { CrocatButton } from '@/src/components/CrocatButton';
import { CrocatCard } from '@/src/components/CrocatCard';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import {
  listSavedArtworks,
  setArtworkFavorite,
} from '@/src/features/artworks/api';
import type { SavedArtwork } from '@/src/features/artworks/types';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { colors, radius, spacing } from '@/src/theme/tokens';

function partnerName(artwork: SavedArtwork) {
  if (artwork.partner_user_id === artwork.head_profile.userId) {
    return artwork.head_profile.displayName;
  }
  if (artwork.partner_user_id === artwork.body_profile.userId) {
    return artwork.body_profile.displayName;
  }
  return artwork.body_profile.displayName || artwork.head_profile.displayName;
}

export default function GalleryScreen() {
  const router = useRouter();
  const [artworks, setArtworks] = useState<SavedArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const themeKey = useUiThemeStore((state) => state.themeKey);

  const refresh = useCallback(async () => {
    try {
      setError('');
      setArtworks(await listSavedArtworks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load gallery.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleFavorite = async (artwork: SavedArtwork) => {
    try {
      setBusyId(artwork.id);
      const next = await setArtworkFavorite(artwork.id, !artwork.favorite);
      setArtworks((current) => current
        .map((item) => item.id === next.id ? next : item)
        .sort((a, b) => Number(b.favorite) - Number(a.favorite)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update favorite.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Screen backLabel="HOME" decorations="full">

      <View style={styles.header}>
        <Text style={styles.kicker}>YOUR COLLECTION</Text>
        <Text style={styles.title}>Gallery</Text>
        <Text style={styles.copy}>
          The Crocats worth keeping. Stars stay at the top.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 70 }} color={colors.ink} />
      ) : !artworks.length ? (
        <CrocatCard variant="surface" style={styles.empty}>
          <Mascot state="curious" size={82} />
          <Text style={styles.emptyTitle}>No weirdos saved yet.</Text>
          <Text style={styles.emptyCopy}>
            Star an online final reveal and it will appear here.
          </Text>
          <CrocatButton onPress={() => router.push('/play')}>MAKE ONE</CrocatButton>
        </CrocatCard>
      ) : (
        <View style={styles.grid}>
          {artworks.map((artwork) => (
            <Pressable
              key={artwork.id}
              onPress={() => router.push({
                pathname: '/artwork/[id]',
                params: { id: artwork.id },
              })}
              style={({ pressed }) => [
                styles.cardPressable,
                pressed && styles.cardPressed,
              ]}
            >
              <CrocatCard style={styles.card}>
              <ArtworkThumbnail artwork={artwork} width={112} />

              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text numberOfLines={2} style={styles.artTitle}>
                    {artwork.title}
                  </Text>
                  <Pressable
                    accessibilityLabel={artwork.favorite ? 'Remove favorite' : 'Add favorite'}
                    disabled={busyId === artwork.id}
                    onPress={(event) => {
                      event.stopPropagation();
                      void toggleFavorite(artwork);
                    }}
                    style={styles.starButton}
                  >
                    <Text style={styles.star}>
                      {artwork.favorite ? '★' : '☆'}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.term}>
                  {(artwork.prompt_term ?? 'CROCAT').toUpperCase()}
                </Text>
                <Text style={styles.partner}>
                  WITH {partnerName(artwork).toUpperCase()}
                </Text>
                <Text style={styles.date}>
                  {new Date(artwork.created_at).toLocaleDateString()}
                </Text>
              </View>
              </CrocatCard>
            </Pressable>
          ))}
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: { marginTop: spacing.xl, marginBottom: 18 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { marginTop: 4, color: colors.ink, fontSize: 46, fontWeight: '900', letterSpacing: -1.8 },
  copy: { marginTop: 5, color: colors.muted, fontSize: 14 },
  grid: { gap: 12 },
  cardPressable: { width: '100%' },
  card: {
    minHeight: 176,
    flexDirection: 'row',
    gap: 14,
    padding: 12,
  },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  cardBody: { flex: 1, minWidth: 0, paddingVertical: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  artTitle: { flex: 1, color: colors.ink, fontSize: 20, lineHeight: 22, fontWeight: '900' },
  starButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  star: { color: colors.coral, fontSize: 25, fontWeight: '900' },
  term: { marginTop: 13, color: colors.coral, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  partner: { marginTop: 4, color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  date: { marginTop: 'auto', color: colors.muted, fontSize: 10, fontWeight: '700' },
  empty: {
    marginTop: 38,
    gap: 10,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  emptyTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  emptyCopy: { color: colors.muted, textAlign: 'center', fontSize: 13, marginBottom: 8 },
  error: { marginTop: 14, color: '#A74343', fontWeight: '700', textAlign: 'center' },
});
