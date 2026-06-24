import { describe, expect, it } from 'vitest';
import { cannyEdgeDetect } from './cannyEdgeDetector';
import { gaussianBlur } from './cvPreprocessing';
import { createGrayscaleWithBrightDocument } from './cvTestHelpers';

describe('cannyEdgeDetector', () => {
  it('generates an edge map around a high-contrast document region', () => {
    const edges = cannyEdgeDetect(gaussianBlur(createGrayscaleWithBrightDocument()), 20, 45);

    const edgePixelCount = edges.data.reduce((count, value) => count + value, 0);

    expect(edgePixelCount).toBeGreaterThan(100);
    expect(edges.gradient.length).toBe(edges.width * edges.height);
  });
});
