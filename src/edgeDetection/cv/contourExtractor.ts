import type { BinaryImage } from './cvPreprocessing';

export type ContourPoint = {
  x: number;
  y: number;
};

export type Contour = {
  points: ContourPoint[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
};

export function extractContours(image: BinaryImage, minimumPoints = 16): Contour[] {
  const visited = new Uint8Array(image.data.length);
  const contours: Contour[] = [];

  for (let index = 0; index < image.data.length; index += 1) {
    if (!image.data[index] || visited[index]) {
      continue;
    }

    const contour = floodFill(image, visited, index);
    if (contour.points.length >= minimumPoints && !isFullFrame(contour, image.width, image.height)) {
      contours.push(contour);
    }
  }

  return contours.sort((left, right) => right.area - left.area);
}

function floodFill(image: BinaryImage, visited: Uint8Array, startIndex: number): Contour {
  const queue = [startIndex];
  visited[startIndex] = 1;
  const contour: Contour = {
    points: [],
    minX: startIndex % image.width,
    minY: Math.floor(startIndex / image.width),
    maxX: startIndex % image.width,
    maxY: Math.floor(startIndex / image.width),
    area: 0,
  };

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    contour.points.push({ x, y });
    contour.area += 1;
    contour.minX = Math.min(contour.minX, x);
    contour.minY = Math.min(contour.minY, y);
    contour.maxX = Math.max(contour.maxX, x);
    contour.maxY = Math.max(contour.maxY, y);

    visit(image, visited, queue, x - 1, y);
    visit(image, visited, queue, x + 1, y);
    visit(image, visited, queue, x, y - 1);
    visit(image, visited, queue, x, y + 1);
    visit(image, visited, queue, x - 1, y - 1);
    visit(image, visited, queue, x + 1, y + 1);
    visit(image, visited, queue, x - 1, y + 1);
    visit(image, visited, queue, x + 1, y - 1);
  }

  return contour;
}

function visit(image: BinaryImage, visited: Uint8Array, queue: number[], x: number, y: number) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return;
  }

  const index = y * image.width + x;
  if (!image.data[index] || visited[index]) {
    return;
  }

  visited[index] = 1;
  queue.push(index);
}

function isFullFrame(contour: Contour, width: number, height: number) {
  return (contour.maxX - contour.minX + 1) / width > 0.98 && (contour.maxY - contour.minY + 1) / height > 0.98;
}
