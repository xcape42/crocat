import { crocatPalette } from '@/src/theme/palette';

function hexChannel(value: string) {
  return Number.parseInt(value, 16) / 255;
}

function toLinear(channel: number) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const normalized = hex.trim().replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const red = toLinear(hexChannel(full.slice(0, 2)));
  const green = toLinear(hexChannel(full.slice(2, 4)));
  const blue = toLinear(hexChannel(full.slice(4, 6)));

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(left: number, right: number) {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks Crocat's fixed dark or fixed light ink for a known surface color.
 * Use this for buttons/pills/cards whose own background determines contrast.
 */
export function readableTextColor(
  backgroundColor: string,
  dark = crocatPalette.ink,
  light = crocatPalette.haloWhite,
) {
  const background = luminance(backgroundColor);
  const darkLum = luminance(dark);
  const lightLum = luminance(light);

  if (background === null || darkLum === null || lightLum === null) {
    return dark;
  }

  return contrastRatio(background, darkLum) >= contrastRatio(background, lightLum)
    ? dark
    : light;
}

export function readableErrorTextColor(backgroundColor: string) {
  return readableTextColor(backgroundColor, '#A74343', '#FF9B9B');
}
