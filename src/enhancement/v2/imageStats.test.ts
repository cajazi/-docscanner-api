import { describe, expect, it } from 'vitest';
import { calculateImageStats } from './imageStats';
import { createRgbImage } from './testHelpers';

describe('calculateImageStats', () => {
  it('calculates luminance and channel statistics', () => {
    const stats = calculateImageStats(createRgbImage(4, 4, [100, 150, 200]));

    expect(stats.meanLuminance).toBeGreaterThan(130);
    expect(stats.redMean).toBe(100);
    expect(stats.greenMean).toBe(150);
    expect(stats.blueMean).toBe(200);
  });
});
