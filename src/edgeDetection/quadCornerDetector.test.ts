import { describe, expect, it } from 'vitest';
import { detectQuadCandidate, type QuadCandidateComponent } from './quadCornerDetector';

describe('quadCornerDetector', () => {
  it('detects four ordered corners from a synthetic skewed document mask', () => {
    const { mask, component } = createMaskFromPolygon(400, 300, [
      { x: 92, y: 54 },
      { x: 314, y: 34 },
      { x: 332, y: 238 },
      { x: 68, y: 224 },
    ]);

    const result = detectQuadCandidate({ mask, width: 400, height: 300, components: [component] });

    expect(result).not.toBeNull();
    expect(result?.confidence).toBeGreaterThan(0.65);
    expect(result?.corners.topLeft.x).toBeLessThan(result?.corners.topRight.x ?? 0);
    expect(result?.corners.topLeft.y).toBeLessThan(result?.corners.bottomLeft.y ?? 0);
    expect(result?.corners.bottomRight.x).toBeGreaterThan(result?.corners.bottomLeft.x ?? 1);
    expect(result?.corners.topLeft.x).toBeGreaterThan(0.15);
    expect(result?.corners.topLeft.x).toBeLessThan(0.3);
    expect(result?.corners.topRight.y).toBeLessThan(0.2);
    expect(result?.corners.bottomRight.y).toBeGreaterThan(0.7);
  });

  it('rejects tiny noisy candidates', () => {
    const { mask, component } = createMaskFromPolygon(400, 300, [
      { x: 10, y: 10 },
      { x: 18, y: 10 },
      { x: 18, y: 17 },
      { x: 10, y: 17 },
    ]);

    const result = detectQuadCandidate({ mask, width: 400, height: 300, components: [component] });

    expect(result).toBeNull();
  });

  it('rejects extremely thin candidates', () => {
    const { mask, component } = createMaskFromPolygon(400, 300, [
      { x: 40, y: 120 },
      { x: 360, y: 120 },
      { x: 360, y: 138 },
      { x: 40, y: 138 },
    ]);

    const result = detectQuadCandidate({ mask, width: 400, height: 300, components: [component] });

    expect(result).toBeNull();
  });

  it('chooses the highest-confidence document-like candidate', () => {
    const large = createMaskFromPolygon(400, 300, [
      { x: 75, y: 55 },
      { x: 315, y: 42 },
      { x: 335, y: 245 },
      { x: 62, y: 225 },
    ]);
    const small = createMaskFromPolygon(400, 300, [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 65 },
      { x: 20, y: 65 },
    ]);
    const mask = mergeMasks(large.mask, small.mask);

    const result = detectQuadCandidate({
      mask,
      width: 400,
      height: 300,
      components: [small.component, large.component],
    });

    expect(result?.component).toEqual(large.component);
  });
});

function createMaskFromPolygon(width: number, height: number, points: Array<{ x: number; y: number }>) {
  const mask = new Uint8Array(width * height);
  const bounds: QuadCandidateComponent = {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    area: 0,
  };

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (pointInPolygon({ x, y }, points)) {
        mask[y * width + x] = 1;
        bounds.area += 1;
      }
    }
  }

  return { mask, component: bounds };
}

function mergeMasks(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.length);
  for (let index = 0; index < merged.length; index += 1) {
    merged[index] = left[index] || right[index] ? 1 : 0;
  }
  return merged;
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}
