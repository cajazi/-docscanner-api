import { describe, expect, it } from 'vitest';
import { extractContours } from './contourExtractor';
import { createBinaryDocumentMask, createBinarySkewedOutline } from './cvTestHelpers';
import { approximateQuad } from './polygonApproximator';
import { scoreQuadCandidates } from './quadCandidateScorer';

describe('quadCandidateScorer', () => {
  it('ranks the best document-like candidate first', () => {
    const largeMask = createBinaryDocumentMask(120, 90);
    const skewedMask = createBinarySkewedOutline(120, 90);
    const large = approximateQuad(extractContours(largeMask)[0], largeMask.width, largeMask.height);
    const skewed = approximateQuad(extractContours(skewedMask, 8)[0], skewedMask.width, skewedMask.height);

    const scored = scoreQuadCandidates([skewed, large].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null), 120, 90);

    expect(scored.length).toBeGreaterThanOrEqual(2);
    expect(scored[0].confidence).toBeGreaterThanOrEqual(scored[1].confidence);
    expect(scored[0].metrics.areaRatio).toBeGreaterThan(0.2);
  });
});
