import { describe, expect, it } from 'vitest';
import { applyBackgroundWhitening } from './backgroundWhitening';
import { createRgbImage } from './testHelpers';

describe('applyBackgroundWhitening', () => {
  it('pushes light paper background closer to white', () => {
    const image = createRgbImage(8, 8, [180, 180, 180]);
    const result = applyBackgroundWhitening(image);

    expect(result.applied).toBe(true);
    expect(result.image.data[0]).toBeGreaterThan(image.data[0]);
  });
});
