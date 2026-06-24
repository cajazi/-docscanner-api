import type { RgbImage } from './types';

export function createRgbImage(width = 32, height = 24, fill: [number, number, number] = [180, 180, 180]): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let index = 0; index < data.length; index += 3) {
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
  }
  return { width, height, channels: 3, data };
}

export function createDocumentLikeImage(width = 64, height = 48): RgbImage {
  const image = createRgbImage(width, height, [70, 75, 82]);
  for (let y = 8; y < height - 8; y += 1) {
    for (let x = 10; x < width - 10; x += 1) {
      const offset = (y * width + x) * 3;
      image.data[offset] = 210;
      image.data[offset + 1] = 205;
      image.data[offset + 2] = 190;
    }
  }
  return image;
}
