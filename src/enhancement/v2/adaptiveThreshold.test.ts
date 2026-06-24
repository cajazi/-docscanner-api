import { describe, expect, it } from 'vitest';
import { applyAdaptiveThreshold } from './adaptiveThreshold';
import { createDocumentLikeImage } from './testHelpers';

describe('applyAdaptiveThreshold', () => {
  it('produces black and white document output', () => {
    const result = applyAdaptiveThreshold(createDocumentLikeImage());
    const values = new Set(result.image.data);

    expect(result.applied).toBe(true);
    expect(values.has(0)).toBe(true);
    expect(values.has(255)).toBe(true);
  });
});
