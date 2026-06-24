import { rgbToLuminance } from './imageStats';
import type { RgbImage } from './types';

export function applyBackgroundWhitening(image: RgbImage): { image: RgbImage; applied: boolean } {
  const data = new Uint8Array(image.data.length);
  let changed = 0;

  for (let index = 0; index < image.data.length; index += 3) {
    const luminance = rgbToLuminance(image.data[index], image.data[index + 1], image.data[index + 2]);
    const boost = luminance > 150 ? (255 - luminance) * 0.72 : 0;
    if (boost > 3) {
      changed += 1;
    }
    data[index] = clampByte(image.data[index] + boost);
    data[index + 1] = clampByte(image.data[index + 1] + boost);
    data[index + 2] = clampByte(image.data[index + 2] + boost);
  }

  return {
    image: { ...image, data },
    applied: changed / (image.width * image.height) > 0.05,
  };
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
