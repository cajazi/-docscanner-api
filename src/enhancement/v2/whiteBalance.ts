import type { ImageStats, RgbImage } from './types';

export function applyWhiteBalance(image: RgbImage, stats: ImageStats): { image: RgbImage; adjusted: boolean; gains: { red: number; green: number; blue: number } } {
  const gray = (stats.redMean + stats.greenMean + stats.blueMean) / 3;
  const gains = {
    red: clamp(gray / Math.max(stats.redMean, 1), 0.82, 1.18),
    green: clamp(gray / Math.max(stats.greenMean, 1), 0.82, 1.18),
    blue: clamp(gray / Math.max(stats.blueMean, 1), 0.82, 1.18),
  };
  const adjusted = Math.max(Math.abs(gains.red - 1), Math.abs(gains.green - 1), Math.abs(gains.blue - 1)) > 0.035;
  if (!adjusted) {
    return { image, adjusted: false, gains: { red: 1, green: 1, blue: 1 } };
  }

  const data = new Uint8Array(image.data.length);
  for (let index = 0; index < image.data.length; index += 3) {
    data[index] = clampByte(image.data[index] * gains.red);
    data[index + 1] = clampByte(image.data[index + 1] * gains.green);
    data[index + 2] = clampByte(image.data[index + 2] * gains.blue);
  }

  return {
    image: { ...image, data },
    adjusted,
    gains: {
      red: round(gains.red),
      green: round(gains.green),
      blue: round(gains.blue),
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
