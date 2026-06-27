import { describe, expect, it } from 'vitest';
import { applyShadowCorrection } from './shadowRemoval';
import { createRgbImage } from './testHelpers';

describe('applyShadowCorrection', () => {
  it('lifts dark regions as an illumination correction foundation', () => {
    const image = createRgbImage(8, 8, [45, 45, 45]);
    const result = applyShadowCorrection(image);

    expect(result.applied).toBe(true);
    expect(result.image.data[0]).toBeGreaterThan(image.data[0]);
  });
});
