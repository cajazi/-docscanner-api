import { describe, expect, it } from 'vitest';
import { calculateBlurScore } from './blurDetection';
import { createDocumentLikeImage, createRgbImage } from './testHelpers';

describe('calculateBlurScore', () => {
  it('scores flat images as blurrier than document edges', () => {
    const flat = calculateBlurScore(createRgbImage(32, 32, [128, 128, 128]));
    const document = calculateBlurScore(createDocumentLikeImage(32, 32));

    expect(flat.recommendRescan).toBe(true);
    expect(document.sharpnessScore).toBeGreaterThan(flat.sharpnessScore);
  });
});
