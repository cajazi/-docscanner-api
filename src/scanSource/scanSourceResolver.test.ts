import { describe, expect, it } from 'vitest';
import { resolvePageImageSource, ScanSourceResolutionError } from './scanSourceResolver';
import { ScanConsumer, ScanSourceRole, type ScanSourcePage } from './types';

function page(overrides: Partial<ScanSourcePage> = {}): ScanSourcePage {
  return {
    originalImageUrl: 'original.jpg',
    croppedImageUrl: 'cropped.jpg',
    enhancedImageUrl: 'enhanced.jpg',
    ...overrides,
  };
}

describe('resolvePageImageSource', () => {
  it('chooses cropped first for OCR', () => {
    expect(resolvePageImageSource(page(), ScanConsumer.OCR)).toEqual({
      role: ScanSourceRole.CROPPED,
      imageUrl: 'cropped.jpg',
    });
  });

  it('falls back to enhanced for OCR', () => {
    expect(resolvePageImageSource(page({ croppedImageUrl: null }), ScanConsumer.OCR)).toEqual({
      role: ScanSourceRole.ENHANCED,
      imageUrl: 'enhanced.jpg',
    });
  });

  it('falls back to original for OCR', () => {
    expect(
      resolvePageImageSource(page({ croppedImageUrl: null, enhancedImageUrl: null }), ScanConsumer.OCR),
    ).toEqual({
      role: ScanSourceRole.ORIGINAL,
      imageUrl: 'original.jpg',
    });
  });

  it('ignores enhanced for enhancement', () => {
    expect(
      () => resolvePageImageSource(
        page({ originalImageUrl: null, croppedImageUrl: null, enhancedImageUrl: 'enhanced.jpg' }),
        ScanConsumer.ENHANCEMENT,
      ),
    ).toThrow(ScanSourceResolutionError);
  });

  it('chooses cropped before original for enhancement', () => {
    expect(resolvePageImageSource(page(), ScanConsumer.ENHANCEMENT)).toEqual({
      role: ScanSourceRole.CROPPED,
      imageUrl: 'cropped.jpg',
    });
  });

  it('always uses original for edge detection', () => {
    expect(resolvePageImageSource(page(), ScanConsumer.EDGE_DETECTION)).toEqual({
      role: ScanSourceRole.ORIGINAL,
      imageUrl: 'original.jpg',
    });
  });

  it('prefers enhanced for PDF export', () => {
    expect(resolvePageImageSource(page(), ScanConsumer.PDF_EXPORT)).toEqual({
      role: ScanSourceRole.ENHANCED,
      imageUrl: 'enhanced.jpg',
    });
  });

  it('throws an explicit error for missing sources', () => {
    expect(() =>
      resolvePageImageSource(
        page({ originalImageUrl: null, croppedImageUrl: null, enhancedImageUrl: null }),
        ScanConsumer.OCR,
      ),
    ).toThrow(ScanSourceResolutionError);
  });
});
