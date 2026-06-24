import type { QuadPolygon } from './polygonApproximator';

export type ScoredQuadCandidate = QuadPolygon & {
  confidence: number;
  metrics: {
    areaRatio: number;
    rectangularity: number;
    aspectRatio: number;
    cornerSpread: number;
  };
};

export function scoreQuadCandidates(candidates: QuadPolygon[], imageWidth: number, imageHeight: number): ScoredQuadCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(candidate, imageWidth, imageHeight))
    .filter((candidate): candidate is ScoredQuadCandidate => candidate !== null)
    .sort((left, right) => right.confidence - left.confidence);
}

function scoreCandidate(candidate: QuadPolygon, imageWidth: number, imageHeight: number): ScoredQuadCandidate | null {
  const boundsWidth = candidate.contour.maxX - candidate.contour.minX + 1;
  const boundsHeight = candidate.contour.maxY - candidate.contour.minY + 1;
  const boundsArea = boundsWidth * boundsHeight;
  const imageArea = imageWidth * imageHeight;
  const areaRatio = candidate.polygonArea / imageArea;
  const rectangularity = candidate.polygonArea / boundsArea;
  const aspectRatio = boundsWidth / boundsHeight;
  const cornerSpread = candidate.polygonArea / boundsArea;

  if (areaRatio < 0.025 || aspectRatio < 0.35 || aspectRatio > 3.25 || cornerSpread < 0.4) {
    return null;
  }

  const confidence = round(
    clamp(areaScore(areaRatio) * 0.3 + rectangularity * 0.25 + aspectScore(aspectRatio) * 0.2 + cornerSpread * 0.25, 0, 0.99),
    3,
  );

  if (confidence < 0.5) {
    return null;
  }

  return {
    ...candidate,
    confidence,
    metrics: {
      areaRatio: round(areaRatio, 4),
      rectangularity: round(rectangularity, 4),
      aspectRatio: round(aspectRatio, 4),
      cornerSpread: round(cornerSpread, 4),
    },
  };
}

function areaScore(areaRatio: number) {
  return clamp(areaRatio / 0.35, 0, 1);
}

function aspectScore(aspectRatio: number) {
  if (aspectRatio >= 0.55 && aspectRatio <= 2.2) {
    return 1;
  }

  const distanceFromRange = aspectRatio < 0.55 ? 0.55 - aspectRatio : aspectRatio - 2.2;
  return clamp(1 - distanceFromRange / 1.05, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
