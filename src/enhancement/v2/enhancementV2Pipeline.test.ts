import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ObjectStorage, StoredObject } from '../../storage/types';
import { EnhancementV2Provider, normalizeMode } from './enhancementV2Pipeline';

class InMemoryStorage implements ObjectStorage {
  writes: Array<{ key: string; data: Buffer; contentType: string }> = [];

  constructor(private readonly source: Buffer) {}

  async read() {
    return this.source;
  }

  async write(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    this.writes.push({ key, data, contentType });
    return { key, url: `stored://${key}` };
  }
}

describe('EnhancementV2Provider', () => {
  it('runs ordered V2 stages and returns required metadata', async () => {
    const provider = new EnhancementV2Provider(new InMemoryStorage(await createScan()));

    const result = await provider.enhance({
      originalImageUrl: 'stored://source.jpg',
      outputKey: 'enhancements/page_1/job_1.jpg',
      params: {
        mode: 'DOCUMENT',
        brightness: 1,
        contrast: 1,
        deskew: false,
        perspectiveCorrection: false,
      },
    });

    expect(result.enhancedImageUrl).toBe('stored://enhancements/page_1/job_1.jpg');
    expect(result.metadata).toMatchObject({
      provider: 'SHARP_V2',
      enhancementVersion: 'v2',
      mode: 'DOCUMENT',
      fallbackUsed: false,
      shadowCorrectionApplied: expect.any(Boolean),
      adaptiveThresholdApplied: false,
      backgroundWhiteningApplied: expect.any(Boolean),
      blurScore: expect.any(Number),
      sharpnessScore: expect.any(Number),
      recommendRescan: expect.any(Boolean),
    });
    expect(result.metadata.orderedStages).toEqual([
      'imageStats',
      'exposureCorrection',
      'whiteBalance',
      'shadowRemoval',
      'backgroundWhitening',
      'blurDetection',
      'finalSharpenNormalize',
    ]);
  });

  it('falls back to the Sharp provider when V2 cannot decode the image', async () => {
    const provider = new EnhancementV2Provider(new InMemoryStorage(Buffer.from('not an image')), {
      name: 'SHARP',
      async enhance() {
        return {
          enhancedImageUrl: 'stored://fallback.jpg',
          metadata: {
            provider: 'SHARP',
          },
        };
      },
    });

    const result = await provider.enhance({
      originalImageUrl: 'stored://bad.jpg',
      outputKey: 'enhancements/page_1/job_1.jpg',
      params: {
        mode: 'DOCUMENT',
        brightness: 1,
        contrast: 1,
        deskew: false,
        perspectiveCorrection: false,
      },
    });

    expect(result.enhancedImageUrl).toBe('stored://fallback.jpg');
    expect(result.metadata).toMatchObject({
      enhancementVersion: 'v2',
      fallbackUsed: true,
      fallbackProvider: 'SHARP',
    });
  });

  it('normalizes legacy and V2 modes', () => {
    expect(normalizeMode('document')).toBe('DOCUMENT');
    expect(normalizeMode('BLACK_WHITE')).toBe('BLACK_WHITE');
    expect(normalizeMode('unknown')).toBe('DOCUMENT');
  });
});

function createScan() {
  const width = 48;
  const height = 36;
  const data = Buffer.alloc(width * height * 3, 54);
  for (let y = 6; y < 30; y += 1) {
    for (let x = 8; x < 40; x += 1) {
      const offset = (y * width + x) * 3;
      data[offset] = 220;
      data[offset + 1] = 211;
      data[offset + 2] = 190;
    }
  }
  for (let y = 16; y < 20; y += 1) {
    for (let x = 14; x < 34; x += 1) {
      const offset = (y * width + x) * 3;
      data[offset] = 34;
      data[offset + 1] = 34;
      data[offset + 2] = 34;
    }
  }

  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}
