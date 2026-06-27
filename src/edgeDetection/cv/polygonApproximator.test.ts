import { describe, expect, it } from 'vitest';
import { extractContours } from './contourExtractor';
import { createBinarySkewedOutline } from './cvTestHelpers';
import { approximateQuad } from './polygonApproximator';

describe('polygonApproximator', () => {
  it('approximates a connected contour as an ordered quad', () => {
    const mask = createBinarySkewedOutline();
    const contour = extractContours(mask, 8)[0];
    const quad = approximateQuad(contour, mask.width, mask.height);

    expect(quad).not.toBeNull();
    expect(quad?.corners.topLeft.x).toBeLessThan(quad?.corners.topRight.x ?? 0);
    expect(quad?.corners.topRight.y).toBeLessThan(quad?.corners.bottomRight.y ?? 0);
    expect(quad?.corners.bottomLeft.x).toBeLessThan(quad?.corners.bottomRight.x ?? 0);
    expect(quad?.polygonArea).toBeGreaterThan(3000);
  });
});
