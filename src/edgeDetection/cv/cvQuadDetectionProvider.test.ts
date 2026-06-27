import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ObjectStorage, StoredObject } from '../../storage/types';
import { CvQuadDetectionProvider } from './cvQuadDetectionProvider';

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

const input = {
  sourceImageUrl: 'stored://source.jpg',
  outputStorageKey: 'edge-detection/page_1/job_1.jpg',
  params: {
    perspectiveCorrection: true,
    outputCroppedImage: true,
  },
};

describe('CvQuadDetectionProvider', () => {
  it('returns normalized corners, confidence, output image, and CV metadata', async () => {
    const storage = new InMemoryStorage(await createSkewedDocument());
    const provider = new CvQuadDetectionProvider(storage);

    const result = await provider.detectAndCorrect(input);

    expect(result.croppedImageUrl).toBe('stored://edge-detection/page_1/job_1.jpg');
    expect(storage.writes).toHaveLength(1);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.corners.topLeft.x).toBeLessThan(result.corners.topRight.x);
    expect(result.metadata).toMatchObject({
      provider: 'cv-pipeline',
      detectionMode: 'cv-pipeline-foundation',
      cannyImplemented: true,
      contourExtractionImplemented: true,
      polygonApproximationImplemented: true,
      nativeOpenCvImplemented: false,
      fallbackUsed: false,
    });
  });

  it('falls back safely to the contour provider when CV detection fails', async () => {
    const storage = new InMemoryStorage(
      await sharp({
        create: {
          width: 300,
          height: 200,
          channels: 3,
          background: '#f4f4f4',
        },
      })
        .jpeg()
        .toBuffer(),
    );
    const provider = new CvQuadDetectionProvider(storage);

    const result = await provider.detectAndCorrect(input);

    expect(result.metadata).toMatchObject({
      provider: 'cv-pipeline',
      detectionMode: 'cv-pipeline-foundation',
      cannyImplemented: true,
      contourExtractionImplemented: true,
      polygonApproximationImplemented: true,
      nativeOpenCvImplemented: false,
      fallbackUsed: true,
      fallbackProvider: 'contour',
    });
  });
});

function createSkewedDocument() {
  const page = Buffer.from(
    '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><polygon points="92,54 314,34 332,238 68,224" fill="#fbfbfb"/></svg>',
  );

  return sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: '#252525',
    },
  })
    .composite([{ input: page, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
}
