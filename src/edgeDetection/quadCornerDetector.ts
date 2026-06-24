import type { DocumentCorners } from './types';

export type QuadCandidateComponent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
};

export type QuadDetectionInput = {
  mask: Uint8Array;
  width: number;
  height: number;
  components: QuadCandidateComponent[];
};

export type QuadDetectionResult = {
  corners: DocumentCorners;
  confidence: number;
  component: QuadCandidateComponent;
  metrics: {
    areaRatio: number;
    rectangularity: number;
    aspectRatio: number;
    aspectScore: number;
    cornerSpread: number;
  };
};

type PixelCorner = {
  x: number;
  y: number;
};

const minimumAreaRatio = 0.025;
const minimumConfidence = 0.55;
const minimumCornerDistanceRatio = 0.08;
const minimumAspectRatio = 0.35;
const maximumAspectRatio = 3.25;

export function detectQuadCandidate(input: QuadDetectionInput): QuadDetectionResult | null {
  const results = input.components
    .map((component) => evaluateComponent(input.mask, input.width, input.height, component))
    .filter((result): result is QuadDetectionResult => result !== null)
    .sort((left, right) => right.confidence - left.confidence);

  return results[0] ?? null;
}

function evaluateComponent(
  mask: Uint8Array,
  width: number,
  height: number,
  component: QuadCandidateComponent,
): QuadDetectionResult | null {
  const componentWidth = component.maxX - component.minX + 1;
  const componentHeight = component.maxY - component.minY + 1;
  const boxArea = componentWidth * componentHeight;
  const imageArea = width * height;
  const areaRatio = component.area / imageArea;
  const rectangularity = component.area / boxArea;
  const aspectRatio = componentWidth / componentHeight;

  if (
    areaRatio < minimumAreaRatio ||
    aspectRatio < minimumAspectRatio ||
    aspectRatio > maximumAspectRatio ||
    isFullFrame(component, width, height)
  ) {
    return null;
  }

  const corners = estimateExtremeCorners(mask, width, component);
  if (!corners || cornersTooClose(corners, width, height)) {
    return null;
  }

  const polygonArea = calculatePolygonArea([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]);
  const cornerSpread = clamp(polygonArea / boxArea, 0, 1);
  if (cornerSpread < 0.45) {
    return null;
  }

  const aspectScore = calculateAspectScore(aspectRatio);
  const confidence = round(
    clamp(areaRatioScore(areaRatio) * 0.25 + rectangularity * 0.2 + cornerSpread * 0.3 + aspectScore * 0.25, 0, 0.98),
    3,
  );

  if (confidence < minimumConfidence) {
    return null;
  }

  return {
    corners: {
      topLeft: normalizeCorner(corners.topLeft, width, height),
      topRight: normalizeCorner(corners.topRight, width, height),
      bottomRight: normalizeCorner(corners.bottomRight, width, height),
      bottomLeft: normalizeCorner(corners.bottomLeft, width, height),
    },
    confidence,
    component,
    metrics: {
      areaRatio: round(areaRatio, 4),
      rectangularity: round(rectangularity, 4),
      aspectRatio: round(aspectRatio, 4),
      aspectScore: round(aspectScore, 4),
      cornerSpread: round(cornerSpread, 4),
    },
  };
}

function estimateExtremeCorners(mask: Uint8Array, width: number, component: QuadCandidateComponent) {
  let topLeft: PixelCorner | null = null;
  let topRight: PixelCorner | null = null;
  let bottomRight: PixelCorner | null = null;
  let bottomLeft: PixelCorner | null = null;
  let minSum = Number.POSITIVE_INFINITY;
  let maxSum = Number.NEGATIVE_INFINITY;
  let maxDifference = Number.NEGATIVE_INFINITY;
  let minDifference = Number.POSITIVE_INFINITY;

  for (let y = component.minY; y <= component.maxY; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      if (!mask[y * width + x]) {
        continue;
      }

      const sum = x + y;
      const difference = x - y;
      if (sum < minSum) {
        minSum = sum;
        topLeft = { x, y };
      }
      if (difference > maxDifference) {
        maxDifference = difference;
        topRight = { x, y };
      }
      if (sum > maxSum) {
        maxSum = sum;
        bottomRight = { x, y };
      }
      if (difference < minDifference) {
        minDifference = difference;
        bottomLeft = { x, y };
      }
    }
  }

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return null;
  }

  return { topLeft, topRight, bottomRight, bottomLeft };
}

function cornersTooClose(corners: Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', PixelCorner>, width: number, height: number) {
  const minimumDistance = Math.max(width, height) * minimumCornerDistanceRatio;
  return (
    distance(corners.topLeft, corners.topRight) < minimumDistance ||
    distance(corners.topRight, corners.bottomRight) < minimumDistance ||
    distance(corners.bottomRight, corners.bottomLeft) < minimumDistance ||
    distance(corners.bottomLeft, corners.topLeft) < minimumDistance
  );
}

function calculateAspectScore(aspectRatio: number) {
  if (aspectRatio >= 0.55 && aspectRatio <= 2.2) {
    return 1;
  }

  const distanceFromRange = aspectRatio < 0.55 ? 0.55 - aspectRatio : aspectRatio - 2.2;
  return clamp(1 - distanceFromRange / 1.05, 0, 1);
}

function areaRatioScore(areaRatio: number) {
  return clamp(areaRatio / 0.35, 0, 1);
}

function isFullFrame(component: QuadCandidateComponent, width: number, height: number) {
  const componentWidth = component.maxX - component.minX + 1;
  const componentHeight = component.maxY - component.minY + 1;
  return componentWidth / width > 0.98 && componentHeight / height > 0.98;
}

function normalizeCorner(corner: PixelCorner, width: number, height: number) {
  return {
    x: round(clamp(corner.x / Math.max(width - 1, 1), 0, 1), 4),
    y: round(clamp(corner.y / Math.max(height - 1, 1), 0, 1), 4),
  };
}

function calculatePolygonArea(corners: PixelCorner[]) {
  let sum = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function distance(left: PixelCorner, right: PixelCorner) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
