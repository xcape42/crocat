import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '@/src/theme/tokens';
import type { Stroke } from '@/src/types/game';
import {
  ARTWORK_BODY_CONNECTION_Y,
  ARTWORK_HEAD_CONNECTION_Y,
  ARTWORK_HEIGHT,
  ARTWORK_WIDTH,
  artworkPartTransform,
  drawingPath,
} from './geometry';
import type { SavedArtwork } from './types';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function strokeSvg(stroke: Stroke) {
  return '<path d="' + escapeXml(drawingPath(stroke.points)) +
    '" fill="none" stroke="' + escapeXml(stroke.color) +
    '" stroke-width="' + stroke.width +
    '" stroke-linecap="round" stroke-linejoin="round" opacity="' +
    stroke.opacity + '"/>';
}

function partSvg(
  strokes: Stroke[],
  transform: SavedArtwork['head_transform'],
  connectionY: number,
) {
  return '<g transform="' +
    escapeXml(artworkPartTransform(transform, connectionY)) +
    '">' +
    strokes.map(strokeSvg).join('') +
    '</g>';
}

export function renderArtworkSvg(artwork: SavedArtwork) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + ARTWORK_WIDTH +
      '" height="' + ARTWORK_HEIGHT +
      '" viewBox="0 0 ' + ARTWORK_WIDTH + ' ' + ARTWORK_HEIGHT + '">',
    '<rect width="100%" height="100%" fill="' + colors.card + '"/>',
    partSvg(
      artwork.head_drawing.strokes,
      artwork.head_transform,
      ARTWORK_HEAD_CONNECTION_Y,
    ),
    partSvg(
      artwork.body_drawing.strokes,
      artwork.body_transform,
      ARTWORK_BODY_CONNECTION_Y,
    ),
    '</svg>',
  ].join('');
}

function safeFileName(title: string) {
  const normalized = title
    .trim()
    .replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (normalized || 'crocat') + '.svg';
}

export async function exportArtwork(artwork: SavedArtwork) {
  const svg = renderArtworkSvg(artwork);
  const fileName = safeFileName(artwork.title);

  if (Platform.OS === 'web') {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const uri = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = uri;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(uri);
    return;
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true, intermediates: true });
  file.write(svg);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Saving is not available on this device.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'image/svg+xml',
    UTI: 'public.svg-image',
    dialogTitle: artwork.title,
  });
}
