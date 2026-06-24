import type { BinaryImage, GrayscaleImage } from './cvPreprocessing';

export type EdgeMap = BinaryImage & {
  gradient: Float32Array;
};

export function cannyEdgeDetect(image: GrayscaleImage, lowThreshold = 28, highThreshold = 64): EdgeMap {
  const gradient = new Float32Array(image.data.length);
  const data = new Uint8Array(image.data.length);

  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const gx =
        -sample(image, x - 1, y - 1) +
        sample(image, x + 1, y - 1) -
        2 * sample(image, x - 1, y) +
        2 * sample(image, x + 1, y) -
        sample(image, x - 1, y + 1) +
        sample(image, x + 1, y + 1);
      const gy =
        -sample(image, x - 1, y - 1) -
        2 * sample(image, x, y - 1) -
        sample(image, x + 1, y - 1) +
        sample(image, x - 1, y + 1) +
        2 * sample(image, x, y + 1) +
        sample(image, x + 1, y + 1);
      const magnitude = Math.hypot(gx, gy);
      const index = y * image.width + x;
      gradient[index] = magnitude;
      data[index] = magnitude >= highThreshold || (magnitude >= lowThreshold && hasStrongNeighbor(gradient, image.width, x, y, highThreshold)) ? 1 : 0;
    }
  }

  return { width: image.width, height: image.height, data, gradient };
}

function hasStrongNeighbor(gradient: Float32Array, width: number, x: number, y: number, highThreshold: number) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (gradient[(y + dy) * width + x + dx] >= highThreshold) {
        return true;
      }
    }
  }

  return false;
}

function sample(image: GrayscaleImage, x: number, y: number) {
  return image.data[y * image.width + x] ?? 0;
}
