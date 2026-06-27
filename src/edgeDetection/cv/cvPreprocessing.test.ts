import { describe, expect, it } from 'vitest';
import { adaptiveThreshold, gaussianBlur, morphologicalClose } from './cvPreprocessing';
import { createGrayscaleWithBrightDocument } from './cvTestHelpers';

describe('cvPreprocessing', () => {
  it('applies gaussian blur while preserving image dimensions', () => {
    const image = createGrayscaleWithBrightDocument();
    const blurred = gaussianBlur(image);

    expect(blurred.width).toBe(image.width);
    expect(blurred.height).toBe(image.height);
    expect(blurred.data[30 * image.width + 40]).toBeGreaterThan(180);
  });

  it('creates an adaptive threshold mask for a bright document region', () => {
    const image = createGrayscaleWithBrightDocument();
    const threshold = adaptiveThreshold(gaussianBlur(image), 6, 5);

    expect(threshold.data[30 * image.width + 40]).toBe(1);
    expect(threshold.data[2 * image.width + 2]).toBe(0);
  });

  it('performs morphological close to bridge small gaps', () => {
    const mask = {
      width: 8,
      height: 5,
      data: new Uint8Array(40),
    };
    mask.data[2 * mask.width + 2] = 1;
    mask.data[2 * mask.width + 4] = 1;

    const closed = morphologicalClose(mask, 1);

    expect(closed.data[2 * mask.width + 3]).toBe(1);
  });
});
