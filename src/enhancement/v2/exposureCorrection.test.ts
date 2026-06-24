import { describe, expect, it } from 'vitest';
import { applyExposureCorrection } from './exposureCorrection';
import { calculateImageStats } from './imageStats';
import { createRgbImage } from './testHelpers';

describe('applyExposureCorrection', () => {
  it('brightens underexposed scans', () => {
    const image = createRgbImage(8, 8, [60, 60, 60]);
    const result = applyExposureCorrection(image, calculateImageStats(image));

    expect(result.adjusted).toBe(true);
    expect(result.image.data[0]).toBeGreaterThan(image.data[0]);
  });
});
