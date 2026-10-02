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
import { CrocatButton } from '@/src/components/CrocatButton';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import {
  MASCOT_CHARACTERS,
  MASCOT_COLORS,
  MASCOT_SHAPES,
  MASCOT_SYMBOLS,
  PROFILE_THEMES,
} from '@/src/features/profile/options';
import {
  ensureCurrentProfile,
  updateProfile,
} from '@/src/features/profile/api';
import type {
  CrocatWorldKey,
  MascotCharacterKey,
  MascotShapeKey,
  PlayerProfile,
  ProfileColorKey,
  ProfileSymbolKey,
  ProfileVisual,
} from '@/src/features/profile/types';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { legacyMascotCharacterForTheme } from '@/src/theme/mascots';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { normalizeWorldKey } from '@/src/theme/worlds';

export default function ProfileScreen() {
  const uiThemeKey = useUiThemeStore((state) => state.themeKey);
  const setUiThemeKey = useUiThemeStore((state) => state.setThemeKey);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [name, setName] = useState('');
  const [colorKey, setColorKey] = useState<ProfileColorKey>('moss');
  const [shapeKey, setShapeKey] = useState<MascotShapeKey>('round');
  const [characterKey, setCharacterKey] = useState<MascotCharacterKey>('gentle');
  const [symbolKey, setSymbolKey] = useState<ProfileSymbolKey>('star');
  const [themeKey, setThemeKey] = useState<CrocatWorldKey>(uiThemeKey);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const apply = (next: PlayerProfile) => {
    const normalizedWorld = normalizeWorldKey(next.theme_key);
    setProfile(next);
    setName(next.display_name);
    setColorKey(next.color_key);
    setShapeKey(next.avatar_key);
    setCharacterKey(
      next.mascot_character_key
      ?? legacyMascotCharacterForTheme(next.theme_key),
    );
    setSymbolKey(next.symbol_key);
    setThemeKey(normalizedWorld);
    setUiThemeKey(normalizedWorld);
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

  const preview: ProfileVisual = {
    displayName: name || 'Crocat',
    colorKey,
    avatarKey: shapeKey,
    mascotCharacterKey: characterKey,
    themeKey,
    symbolKey,
  };

  const save = async () => {
    try {
      setBusy(true);
      setError('');
      const next = await updateProfile({
        displayName: name,
        colorKey,
        avatarKey: shapeKey,
        mascotCharacterKey: characterKey,
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

  if (busy && !profile) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.ink} />
      </Screen>
    );
  }

  return (
    <Screen backLabel="HOME">
      <View style={styles.hero}>
        <Mascot profile={preview} state="idle" size={112} />
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
        <Text style={styles.label}>MASCOT COLOR · 1 OF {MASCOT_COLORS.length}</Text>
        <View style={styles.options}>
          {MASCOT_COLORS.map((item) => (
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
        <Text style={styles.label}>MASCOT SHAPE · 1 OF {MASCOT_SHAPES.length}</Text>
        <View style={styles.options}>
          {MASCOT_SHAPES.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setShapeKey(item.key)}
              style={[styles.textOption, shapeKey === item.key && styles.selected]}
            >
              <Mascot
                profile={{ ...preview, avatarKey: item.key }}
                animated={false}
                size={54}
              />
              <Text style={styles.optionLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>MASCOT CHARACTER · 1 OF {MASCOT_CHARACTERS.length}</Text>
        <View style={styles.options}>
          {MASCOT_CHARACTERS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setCharacterKey(item.key)}
              style={[
                styles.characterOption,
                characterKey === item.key && styles.selected,
              ]}
            >
              <Mascot
                profile={{ ...preview, mascotCharacterKey: item.key }}
                animated={false}
                size={58}
              />
              <View style={styles.characterCopy}>
                <Text style={styles.optionLabel}>{item.label}</Text>
                <Text style={styles.characterDescription}>{item.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>MASCOT SYMBOL · 1 OF {MASCOT_SYMBOLS.length}</Text>
        <View style={styles.options}>
          {MASCOT_SYMBOLS.map((item) => (
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

      <View style={styles.section}>
        <Text style={styles.label}>YOUR WORLD · 1 OF {PROFILE_THEMES.length}</Text>
        <Text style={styles.themeHint}>
          Changes Crocat’s atmosphere, surfaces and background details — not your mascot.
        </Text>
        <View style={styles.options}>
          {PROFILE_THEMES.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => {
                const nextWorld = normalizeWorldKey(item.key);
                setThemeKey(nextWorld);
                setUiThemeKey(nextWorld, { persist: false });
              }}
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

      <View style={styles.bottom}>
        <CrocatButton disabled={busy || name.trim().length < 2} onPress={save}>
          {busy ? 'SAVING…' : 'SAVE PROFILE'}
        </CrocatButton>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    minHeight: 92,
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  optionLabel: { color: colors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  characterOption: {
    minWidth: 154,
    flexGrow: 1,
    minHeight: 86,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  characterCopy: { flex: 1, minWidth: 0, gap: 3 },
  characterDescription: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '700' },
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
    gap: 9,
  },
  themeName: { color: colors.ink, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  themeAccent: {
    width: 34,
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
  bottom: { marginTop: 'auto', gap: 10, paddingTop: 18 },
  selected: { borderWidth: 3, borderColor: colors.ink },
  notice: { marginTop: 10, textAlign: 'center', color: colors.ink, fontWeight: '900', fontSize: 11 },
  error: { marginTop: 10, textAlign: 'center', color: '#A74343', fontWeight: '700' },
});
