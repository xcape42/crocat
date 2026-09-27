import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { CrocatButton } from '@/src/components/CrocatButton';
import { ProfileAvatar } from '@/src/components/ProfileAvatar';
import { Screen } from '@/src/components/Screen';
import {
  PROFILE_AVATARS,
  PROFILE_COLORS,
  PROFILE_SYMBOLS,
  PROFILE_THEMES,
} from '@/src/features/profile/options';
import {
  ensureCurrentProfile,
  updateProfile,
} from '@/src/features/profile/api';
import type {
  PlayerProfile,
  ProfileAvatarKey,
  ProfileColorKey,
  ProfileSymbolKey,
  ProfileThemeKey,
} from '@/src/features/profile/types';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [name, setName] = useState('');
  const [colorKey, setColorKey] = useState<ProfileColorKey>('moss');
  const [avatarKey, setAvatarKey] = useState<ProfileAvatarKey>('round');
  const [themeKey, setThemeKey] = useState<ProfileThemeKey>('paper');
  const [symbolKey, setSymbolKey] = useState<ProfileSymbolKey>('star');
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const setUiThemeKey = useUiThemeStore((state) => state.setThemeKey);

  const apply = (next: PlayerProfile) => {
    setProfile(next);
    setName(next.display_name);
    setColorKey(next.color_key);
    setAvatarKey(next.avatar_key);
    setThemeKey(next.theme_key);
    setSymbolKey(next.symbol_key);
    setUiThemeKey(next.theme_key);
  };

  useEffect(() => {
    let cancelled = false;

    void ensureCurrentProfile()
      .then(({ profile: next }) => {
        if (!cancelled) apply(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load profile.');
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    try {
      setBusy(true);
      setError('');
      const next = await updateProfile({
        displayName: name,
        colorKey,
        avatarKey,
        themeKey,
        symbolKey,
      });
      apply(next);
      setNotice('PROFILE SAVED ✓');
      setTimeout(() => setNotice(''), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!profile) return;
    await Clipboard.setStringAsync(profile.friend_code);
    setNotice('FRIEND CODE COPIED ✓');
    setTimeout(() => setNotice(''), 1800);
  };

  const preview = {
    displayName: name || 'Crocat',
    colorKey,
    avatarKey,
    themeKey,
    symbolKey,
  };

  if (busy && !profile) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.ink} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← HOME</Text>

      <View style={styles.hero}>
        <ProfileAvatar profile={preview} size={108} showSymbol />
        <View style={styles.heroText}>
          <Text style={styles.kicker}>YOUR CROCAT</Text>
          <Text style={styles.title}>{name || 'Profile'}</Text>
          {!!profile && (
            <Pressable onPress={copyCode} style={styles.friendCode}>
              <Text style={styles.friendCodeLabel}>FRIEND CODE</Text>
              <Text selectable style={styles.friendCodeValue}>{profile.friend_code}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>NAME</Text>
        <TextInput
          value={name}
          onChangeText={(value) => setName(value.slice(0, 18))}
          placeholder="Your name"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={18}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>COLOR · 1 OF 7</Text>
        <View style={styles.options}>
          {PROFILE_COLORS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityLabel={item.label}
              onPress={() => setColorKey(item.key)}
              style={[
                styles.colorOption,
                { backgroundColor: item.hex },
                colorKey === item.key && styles.selected,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>AVATAR · 1 OF 3</Text>
        <View style={styles.options}>
          {PROFILE_AVATARS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setAvatarKey(item.key)}
              style={[styles.textOption, avatarKey === item.key && styles.selected]}
            >
              <Text style={styles.avatarFace}>{item.face}</Text>
              <Text style={styles.optionLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>APP THEME · 1 OF 2</Text>
        <Text style={styles.themeHint}>Changes Crocat’s surfaces, accents and little background details.</Text>
        <View style={styles.options}>
          {PROFILE_THEMES.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setThemeKey(item.key)}
              style={[
                styles.themeOption,
                { backgroundColor: item.background },
                themeKey === item.key && styles.selected,
              ]}
            >
              <View style={styles.themePreviewTop}>
                <Text style={styles.themeName}>{item.label}</Text>
                <View style={[styles.themeAccent, { backgroundColor: item.accent }]} />
              </View>
              <Text style={styles.themePattern}>{item.pattern}</Text>
              <Text style={styles.themeDescription}>{item.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>SYMBOL · 1 OF 5</Text>
        <View style={styles.options}>
          {PROFILE_SYMBOLS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setSymbolKey(item.key)}
              style={[styles.symbolOption, symbolKey === item.key && styles.selected]}
            >
              <Text style={styles.symbol}>{item.glyph}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <CrocatButton disabled={busy || name.trim().length < 2} onPress={save}>
        {busy ? 'SAVING…' : 'SAVE PROFILE'}
      </CrocatButton>

      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  hero: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  heroText: { flex: 1, minWidth: 0 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { marginTop: 4, fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  friendCode: { marginTop: 10, alignSelf: 'flex-start' },
  friendCodeLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  friendCodeValue: { marginTop: 2, color: colors.ink, fontSize: 17, fontWeight: '900', letterSpacing: 2 },
  section: { marginTop: 18, gap: 8 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  colorOption: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line },
  textOption: {
    minWidth: 92,
    minHeight: 68,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  avatarFace: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  optionLabel: { marginTop: 5, color: colors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  themeHint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  themeOption: {
    minWidth: 150,
    flexGrow: 1,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  themePreviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  themeName: { color: colors.ink, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  themeAccent: {
    width: 30,
    height: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  themePattern: {
    marginTop: 12,
    color: colors.ink,
    opacity: 0.45,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 5,
  },
  themeDescription: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  symbolOption: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
    backgroundColor: colors.card,
  },
  symbol: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  selected: { borderWidth: 3, borderColor: colors.ink },
  notice: { marginTop: 10, textAlign: 'center', color: colors.ink, fontWeight: '900', fontSize: 11 },
  error: { marginTop: 10, textAlign: 'center', color: '#A74343', fontWeight: '700' },
});
