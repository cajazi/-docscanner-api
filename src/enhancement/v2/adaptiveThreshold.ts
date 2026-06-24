import { rgbToLuminance } from './imageStats';
import type { RgbImage } from './types';

export function applyAdaptiveThreshold(image: RgbImage): { image: RgbImage; applied: boolean } {
  const luminance = new Uint8Array(image.width * image.height);
  for (let index = 0, pixel = 0; index < image.data.length; index += 3, pixel += 1) {
    luminance[pixel] = Math.round(rgbToLuminance(image.data[index], image.data[index + 1], image.data[index + 2]));
  }

  const data = new Uint8Array(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const local = localMean(luminance, image.width, image.height, x, y, 10);
      const value = luminance[y * image.width + x] > local - 8 ? 255 : 0;
      const offset = (y * image.width + x) * 3;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
    }
  }

  return { image: { ...image, data }, applied: true };
}

function localMean(values: Uint8Array, width: number, height: number, x: number, y: number, radius: number) {
  let sum = 0;
  let count = 0;
  for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(height - 1, y + radius); sampleY += 1) {
    for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(width - 1, x + radius); sampleX += 1) {
      sum += values[sampleY * width + sampleX];
      count += 1;
    }
  }
  return sum / count;
}
