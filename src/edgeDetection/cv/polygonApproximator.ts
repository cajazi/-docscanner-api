import type { DocumentCorners } from '../types';
import type { Contour, ContourPoint } from './contourExtractor';

export type QuadPolygon = {
  corners: DocumentCorners;
  pixelCorners: {
    topLeft: ContourPoint;
    topRight: ContourPoint;
    bottomRight: ContourPoint;
    bottomLeft: ContourPoint;
  };
  contour: Contour;
  polygonArea: number;
};

export function approximateQuad(contour: Contour, imageWidth: number, imageHeight: number): QuadPolygon | null {
  const corners = estimateExtremeCorners(contour.points);
  if (!corners || hasDuplicateCorners(corners)) {
    return null;
  }

  const polygonArea = calculatePolygonArea([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]);
  if (polygonArea <= 0) {
    return null;
  }

  return {
    corners: {
      topLeft: normalize(corners.topLeft, imageWidth, imageHeight),
      topRight: normalize(corners.topRight, imageWidth, imageHeight),
      bottomRight: normalize(corners.bottomRight, imageWidth, imageHeight),
      bottomLeft: normalize(corners.bottomLeft, imageWidth, imageHeight),
    },
    pixelCorners: corners,
    contour,
    polygonArea,
  };
}

function estimateExtremeCorners(points: ContourPoint[]) {
  let topLeft: ContourPoint | null = null;
  let topRight: ContourPoint | null = null;
  let bottomRight: ContourPoint | null = null;
  let bottomLeft: ContourPoint | null = null;
  let minSum = Number.POSITIVE_INFINITY;
  let maxSum = Number.NEGATIVE_INFINITY;
  let maxDifference = Number.NEGATIVE_INFINITY;
  let minDifference = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const sum = point.x + point.y;
    const difference = point.x - point.y;
    if (sum < minSum) {
      minSum = sum;
      topLeft = point;
    }
    if (difference > maxDifference) {
      maxDifference = difference;
      topRight = point;
    }
    if (sum > maxSum) {
      maxSum = sum;
      bottomRight = point;
    }
    if (difference < minDifference) {
      minDifference = difference;
      bottomLeft = point;
    }
  }

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return null;
  }

  return { topLeft, topRight, bottomRight, bottomLeft };
}

function hasDuplicateCorners(corners: Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', ContourPoint>) {
  const serialized = new Set(Object.values(corners).map((corner) => `${corner.x}:${corner.y}`));
  return serialized.size < 4;
}

function normalize(point: ContourPoint, width: number, height: number) {
  return {
    x: round(clamp(point.x / Math.max(width - 1, 1), 0, 1), 4),
    y: round(clamp(point.y / Math.max(height - 1, 1), 0, 1), 4),
  };
}

function calculatePolygonArea(corners: ContourPoint[]) {
  let sum = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
