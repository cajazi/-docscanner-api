import { rgbToLuminance } from './imageStats';
import type { RgbImage } from './types';

export function calculateBlurScore(image: RgbImage): { blurScore: number; sharpnessScore: number; recommendRescan: boolean } {
  let sum = 0;
  let squaredSum = 0;
  let count = 0;

  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const laplacian =
        -4 * sample(image, x, y) +
        sample(image, x - 1, y) +
        sample(image, x + 1, y) +
        sample(image, x, y - 1) +
        sample(image, x, y + 1);
      sum += laplacian;
      squaredSum += laplacian * laplacian;
      count += 1;
    }
  }

  const variance = squaredSum / Math.max(count, 1) - (sum / Math.max(count, 1)) ** 2;
  const sharpnessScore = round(Math.min(1, variance / 950));
  const blurScore = round(1 - sharpnessScore);

  return {
    blurScore,
    sharpnessScore,
    recommendRescan: sharpnessScore < 0.18,
  };
}

function sample(image: RgbImage, x: number, y: number) {
  const index = (y * image.width + x) * 3;
  return rgbToLuminance(image.data[index], image.data[index + 1], image.data[index + 2]);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
