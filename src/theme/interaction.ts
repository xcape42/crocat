import { Platform } from 'react-native';

/**
 * Keeps Crocat's drawing surfaces fully gesture-driven on mobile web.
 *
 * iOS browsers all use WebKit underneath, where the generic userSelect/touchAction
 * pair is not enough to suppress long-press callouts and native selection/drag UI.
 * Keep this scoped to artwork surfaces so normal app text remains selectable.
 */
export const webArtworkGestureLock = Platform.OS === 'web'
  ? ({
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitUserDrag: 'none',
      WebkitTapHighlightColor: 'transparent',
    } as never)
  : undefined;
