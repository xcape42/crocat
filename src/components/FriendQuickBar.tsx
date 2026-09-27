import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ProfileAvatar } from '@/src/components/ProfileAvatar';
import type { FriendSummary } from '@/src/features/social/types';
import { socialProfileVisual } from '@/src/features/social/types';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  friends: FriendSummary[];
  onPress: (friend: FriendSummary) => void;
  busyUserId?: string;
  title?: string;
  emptyText?: string;
};

export function FriendQuickBar({
  friends,
  onPress,
  busyUserId = '',
  title = 'FRIENDS',
  emptyText = 'Friends will show up here.',
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>
          {friends.filter((friend) => friend.online).length} ONLINE
        </Text>
      </View>

      {!friends.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {friends.map((friend) => {
            const disabled = !friend.online || !!busyUserId;
            const action = friend.open_room_code
              ? 'JOIN'
              : (friend.online ? 'INVITE' : 'OFFLINE');

            return (
              <Pressable
                key={friend.friend_user_id}
                disabled={disabled}
                onPress={() => onPress(friend)}
                style={({ pressed }) => [
                  styles.friend,
                  !friend.online && styles.offline,
                  pressed && !disabled && styles.pressed,
                ]}
              >
                <View>
                  <ProfileAvatar
                    profile={socialProfileVisual(friend)}
                    size={52}
                  />
                  <View style={[
                    styles.dot,
                    friend.online ? styles.dotOnline : styles.dotOffline,
                  ]} />
                </View>

                <Text numberOfLines={1} style={styles.name}>
                  {friend.display_name}
                </Text>
                <Text style={styles.level}>
                  LV {friend.friend_level} · {friend.friendship_label}
                </Text>
                <Text style={[
                  styles.action,
                  friend.open_room_code && styles.actionJoin,
                ]}>
                  {busyUserId === friend.friend_user_id ? '…' : action}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  count: {
    color: colors.ink,
    opacity: 0.55,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  row: { gap: 9, paddingRight: 10 },
  friend: {
    width: 112,
    minHeight: 138,
    alignItems: 'center',
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  offline: { opacity: 0.52 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.card,
  },
  dotOnline: { backgroundColor: '#5F9B55' },
  dotOffline: { backgroundColor: colors.muted },
  name: {
    marginTop: 7,
    width: '100%',
    textAlign: 'center',
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  level: {
    marginTop: 2,
    width: '100%',
    textAlign: 'center',
    color: colors.muted,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  action: {
    marginTop: 'auto',
    color: colors.coral,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  actionJoin: { color: '#4F7B4A' },
  empty: {
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  emptyText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
});
