import type { BinaryImage, GrayscaleImage } from './cvPreprocessing';

export function createGrayscaleWithBrightDocument(width = 80, height = 60): GrayscaleImage {
  const data = new Uint8Array(width * height).fill(30);
  for (let y = 12; y < 48; y += 1) {
    for (let x = 18; x < 62; x += 1) {
      data[y * width + x] = 230;
    }
  }

  return { width, height, data };
}

export function createBinaryDocumentMask(width = 100, height = 80): BinaryImage {
  const data = new Uint8Array(width * height);
  for (let y = 18; y < 62; y += 1) {
    for (let x = 24; x < 78; x += 1) {
      data[y * width + x] = 1;
    }
  }

  return { width, height, data };
}

export function createBinarySkewedOutline(width = 120, height = 90): BinaryImage {
  const data = new Uint8Array(width * height);
  drawLine(data, width, { x: 28, y: 18 }, { x: 92, y: 12 });
  drawLine(data, width, { x: 92, y: 12 }, { x: 102, y: 68 });
  drawLine(data, width, { x: 102, y: 68 }, { x: 20, y: 72 });
  drawLine(data, width, { x: 20, y: 72 }, { x: 28, y: 18 });
  return { width, height, data };
}

function drawLine(data: Uint8Array, width: number, from: { x: number; y: number }, to: { x: number; y: number }) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    data[y * width + x] = 1;
  }
}
