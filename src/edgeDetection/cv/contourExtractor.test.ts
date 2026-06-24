import { describe, expect, it } from 'vitest';
import { extractContours } from './contourExtractor';
import { createBinaryDocumentMask, createBinarySkewedOutline } from './cvTestHelpers';

describe('contourExtractor', () => {
  it('extracts a synthetic document contour', () => {
    const contours = extractContours(createBinaryDocumentMask());

    expect(contours).toHaveLength(1);
    expect(contours[0]).toMatchObject({
      minX: 24,
      minY: 18,
      maxX: 77,
      maxY: 61,
    });
    expect(contours[0].points.length).toBeGreaterThan(1000);
  });

  it('extracts a connected skewed outline contour', () => {
    const contours = extractContours(createBinarySkewedOutline(), 8);

    expect(contours).toHaveLength(1);
    expect(contours[0].points.length).toBeGreaterThan(150);
  });
});
