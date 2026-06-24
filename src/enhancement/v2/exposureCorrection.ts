import type { ImageStats, RgbImage } from './types';

export function applyExposureCorrection(image: RgbImage, stats: ImageStats): { image: RgbImage; adjusted: boolean; factor: number } {
  const target = 178;
  const factor = clamp(target / Math.max(stats.meanLuminance, 1), 0.82, 1.32);
  const adjusted = Math.abs(factor - 1) > 0.04;
  if (!adjusted) {
    return { image, adjusted: false, factor: 1 };
  }

  const data = new Uint8Array(image.data.length);
  for (let index = 0; index < image.data.length; index += 1) {
    data[index] = clampByte(image.data[index] * factor);
  }

  return { image: { ...image, data }, adjusted, factor: round(factor, 3) };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
