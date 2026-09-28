import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '@/src/theme/tokens';
import type { GameRole, Stroke } from '@/src/types/game';
import {
  artworkClipRect,
  artworkGeometryForVersion,
  artworkPartTransform,
  drawingPath,
} from './geometry';
import type { ArtworkGeometry } from './geometry';
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

function clipSvg(role: GameRole, geometry: ArtworkGeometry) {
  const clip = artworkClipRect(role, geometry);
  const id = role === 'HEAD' ? 'head-clip' : 'body-clip';
  return '<clipPath id="' + id + '">' +
    '<rect x="' + clip.x + '" y="' + clip.y +
    '" width="' + clip.width + '" height="' + clip.height + '"/>' +
    '</clipPath>';
}

function partSvg(
  role: GameRole,
  strokes: Stroke[],
  transform: SavedArtwork['head_transform'],
  geometry: ArtworkGeometry,
) {
  const connectionY = role === 'HEAD'
    ? geometry.headConnectionY
    : geometry.bodyConnectionY;
  const clipId = role === 'HEAD' ? 'head-clip' : 'body-clip';

  return '<g clip-path="url(#' + clipId + ')">' +
    '<g transform="' +
    escapeXml(artworkPartTransform(transform, connectionY, geometry)) +
    '">' +
    strokes.map(strokeSvg).join('') +
    '</g></g>';
}

export function renderArtworkSvg(artwork: SavedArtwork) {
  const geometry = artworkGeometryForVersion(artwork.geometry_version);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + geometry.width +
      '" height="' + geometry.height +
      '" viewBox="0 0 ' + geometry.width + ' ' + geometry.height + '">',
    '<defs>',
    clipSvg('BODY', geometry),
    clipSvg('HEAD', geometry),
    '</defs>',
    '<rect width="100%" height="100%" fill="' + colors.card + '"/>',
    partSvg(
      'BODY',
      artwork.body_drawing.strokes,
      artwork.body_transform,
      geometry,
    ),
    partSvg(
      'HEAD',
      artwork.head_drawing.strokes,
      artwork.head_transform,
      geometry,
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
    dialogTitle: 'Save Crocat artwork',
  });
}
