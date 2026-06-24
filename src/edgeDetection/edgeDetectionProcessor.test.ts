import { describe, expect, it } from 'vitest';
import { shouldEnableEdgeDetectionProcessor } from './edgeDetectionProcessor';

describe('edge detection processor configuration', () => {
  it('is disabled in test env even when configured on', () => {
    expect(shouldEnableEdgeDetectionProcessor('test', true)).toBe(false);
  });

  it('is disabled when EDGE_DETECTION_PROCESSOR_ENABLED=false', () => {
    expect(shouldEnableEdgeDetectionProcessor('production', false)).toBe(false);
  });
});
