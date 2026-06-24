import { describe, expect, it } from 'vitest';
import { calculateImageStats } from './imageStats';
import { createRgbImage } from './testHelpers';
import { applyWhiteBalance } from './whiteBalance';

describe('applyWhiteBalance', () => {
  it('reduces a color cast using gray-world gains', () => {
    const image = createRgbImage(8, 8, [220, 150, 120]);
    const result = applyWhiteBalance(image, calculateImageStats(image));

    expect(result.adjusted).toBe(true);
    expect(result.gains.red).toBeLessThan(1);
    expect(result.gains.blue).toBeGreaterThan(1);
  });
});
