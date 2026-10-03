import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArtworkThumbnail } from '@/src/components/ArtworkThumbnail';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import {
  deleteArtwork,
  loadSavedArtwork,
  renameArtwork,
  setArtworkFavorite,
} from '@/src/features/artworks/api';
import { exportArtwork } from '@/src/features/artworks/export';
import type { SavedArtwork } from '@/src/features/artworks/types';
import type { ProfileSnapshot } from '@/src/features/profile/types';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { readableErrorTextColor } from '@/src/theme/contrast';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

function partnerSnapshot(artwork: SavedArtwork): ProfileSnapshot {
  if (artwork.partner_user_id === artwork.head_profile.userId) {
    return artwork.head_profile;
  }
  if (artwork.partner_user_id === artwork.body_profile.userId) {
    return artwork.body_profile;
  }
  return artwork.body_profile;
}

export default function ArtworkDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [artwork, setArtwork] = useState<SavedArtwork | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setError('Artwork is missing.');
      return;
    }

    void loadSavedArtwork(id)
      .then((next) => {
        if (cancelled) return;
        setArtwork(next);
        setTitle(next.title);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load artwork.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const partner = useMemo(
    () => artwork ? partnerSnapshot(artwork) : null,
    [artwork],
  );

  const saveTitle = async () => {
    if (!artwork || title.trim() === artwork.title) return;

    try {
      setBusy('rename');
      setError('');
      const next = await renameArtwork(artwork.id, title);
      setArtwork(next);
      setTitle(next.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename artwork.');
    } finally {
      setBusy('');
    }
  };

  const favorite = async () => {
    if (!artwork) return;

    try {
      setBusy('favorite');
      const next = await setArtworkFavorite(artwork.id, !artwork.favorite);
      setArtwork(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update favorite.');
    } finally {
      setBusy('');
    }
  };

  const exportCurrent = async () => {
    if (!artwork) return;

    try {
      setBusy('export');
      setError('');
      await exportArtwork(artwork);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save artwork to device.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!artwork) return;

    try {
      setBusy('delete');
      await deleteArtwork(artwork.id);
      router.replace('/gallery');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete artwork.');
      setBusy('');
    }
  };

  if (!artwork) {
    return (
      <Screen backLabel="GALLERY">
        {!error && <ActivityIndicator style={{ marginTop: 80 }} color={world.colors.text} />}
        {!!error && (
        <Text style={[styles.error, { color: readableErrorTextColor(world.colors.background) }]}>
          {error}
        </Text>
      )}
      </Screen>
    );
  }

  return (
    <Screen backLabel="GALLERY">

      <View style={styles.header}>
        <Text style={[styles.kicker, { color: world.colors.accent }]}>{artwork.prompt_theme?.toUpperCase() ?? 'SAVED CROCAT'}</Text>
        <TextInput
          value={title}
          maxLength={60}
          onChangeText={setTitle}
          onBlur={() => void saveTitle()}
          onSubmitEditing={() => void saveTitle()}
          placeholderTextColor={world.colors.muted}
          style={[
            styles.titleInput,
            {
              color: world.colors.text,
              borderBottomColor: world.colors.line,
            },
          ]}
        />
        <Text style={[styles.renameHint, { color: world.colors.muted }]}>TAP THE TITLE TO RENAME</Text>
      </View>

      <View
        style={[
          styles.preview,
          {
            borderColor: world.colors.line,
            backgroundColor: world.colors.card,
          },
        ]}
      >
        <ArtworkThumbnail artwork={artwork} width={270} />
      </View>

      {!!partner && (
        <View
          style={[
            styles.partnerCard,
            {
              backgroundColor: world.colors.card,
              borderColor: world.colors.line,
            },
          ]}
        >
          <Mascot profile={partner} state="happy" size={58} animated={false} />
          <View style={styles.partnerText}>
            <Text style={[styles.partnerLabel, { color: world.colors.muted }]}>MADE WITH</Text>
            <Text style={[styles.partnerName, { color: world.colors.text }]}>{partner.displayName}</Text>
            <Text style={[styles.partnerMeta, { color: world.colors.muted }]}>
              {partner.themeKey.toUpperCase()}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <CrocatButton
          variant={artwork.favorite ? 'coral' : 'secondary'}
          disabled={!!busy}
          onPress={() => void favorite()}
        >
          {artwork.favorite ? '★ FAVORITE' : '☆ FAVORITE'}
        </CrocatButton>

        <CrocatButton
          disabled={!!busy}
          onPress={() => void exportCurrent()}
        >
          {busy === 'export' ? 'SAVING…' : 'SAVE TO DEVICE'}
        </CrocatButton>

        <CrocatButton
          variant="ghost"
          disabled={!!busy}
          onPress={() => void remove()}
        >
          {busy === 'delete' ? 'DELETING…' : 'DELETE ARTWORK'}
        </CrocatButton>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: { marginTop: spacing.xl, alignItems: 'center' },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  titleInput: {
    marginTop: 5,
    width: '100%',
    textAlign: 'center',
    color: colors.ink,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  renameHint: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  preview: {
    marginTop: 16,
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  partnerCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  partnerText: { flex: 1 },
  partnerLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  partnerName: { marginTop: 2, color: colors.ink, fontSize: 18, fontWeight: '900' },
  partnerMeta: { marginTop: 2, color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  actions: { marginTop: 14, gap: 9 },
  error: { marginTop: 12, color: '#A74343', fontWeight: '700', textAlign: 'center' },
});
