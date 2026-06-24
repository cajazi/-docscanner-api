import { describe, expect, it } from 'vitest';
import { shouldEnableEnhancementProcessor } from './enhancementProcessor';

describe('enhancement processor configuration', () => {
  it('is disabled in test env even when configured on', () => {
    expect(shouldEnableEnhancementProcessor('test', true)).toBe(false);
  });

  it('is disabled when ENHANCEMENT_PROCESSOR_ENABLED=false', () => {
    expect(shouldEnableEnhancementProcessor('production', false)).toBe(false);
  });
});
