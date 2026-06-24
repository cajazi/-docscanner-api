import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ObjectStorage, StoredObject } from '../../storage/types';
import { ContourEdgeDetectionProvider } from './contourEdgeDetectionProvider';

class InMemoryStorage implements ObjectStorage {
  writes: Array<{ key: string; data: Buffer; contentType: string }> = [];

  constructor(private readonly source: Buffer) {}

  async read() {
    return this.source;
  }

  async write(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    this.writes.push({ key, data, contentType });
    return {
      key,
      url: `stored://${key}`,
    };
  }
}

const defaultInput = {
  sourceImageUrl: 'stored://source.jpg',
  outputStorageKey: 'edge-detection/page_1/job_1.jpg',
  params: {
    perspectiveCorrection: true,
    outputCroppedImage: true,
  },
};

describe('ContourEdgeDetectionProvider', () => {
  it('detects a document-like contour and returns normalized corners', async () => {
    const source = await createDocumentOnDarkBackground();
    const storage = new InMemoryStorage(source);
    const provider = new ContourEdgeDetectionProvider(storage);

    const result = await provider.detectAndCorrect(defaultInput);

    expect(result.croppedImageUrl).toBe('stored://edge-detection/page_1/job_1.jpg');
    expect(storage.writes).toHaveLength(1);
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.corners.topLeft.x).toBeGreaterThan(0.15);
    expect(result.corners.topLeft.x).toBeLessThan(0.25);
    expect(result.corners.topLeft.y).toBeGreaterThan(0.12);
    expect(result.corners.topLeft.y).toBeLessThan(0.22);
    expect(result.corners.bottomRight.x).toBeGreaterThan(0.75);
    expect(result.corners.bottomRight.x).toBeLessThan(0.85);
    expect(result.corners.bottomRight.y).toBeGreaterThan(0.75);
    expect(result.corners.bottomRight.y).toBeLessThan(0.85);
  });

  it('falls back to the heuristic provider when contour detection cannot find a candidate', async () => {
    const source = await sharp({
      create: {
        width: 300,
        height: 200,
        channels: 3,
        background: '#f4f4f4',
      },
    })
      .jpeg()
      .toBuffer();
    const storage = new InMemoryStorage(source);
    const provider = new ContourEdgeDetectionProvider(storage);

    const result = await provider.detectAndCorrect(defaultInput);

    expect(result.corners).toEqual({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0, y: 1 },
    });
    expect(result.confidence).toBe(0.5);
    expect(result.metadata).toMatchObject({
      provider: 'contour',
      providerVersion: 'contour-sharp-v1',
      detectionMode: 'contour-fallback',
      contourCount: 0,
      confidence: 0.5,
      fallbackUsed: true,
      fallbackProvider: 'heuristic',
      contourDetectionImplemented: true,
      perspectiveCorrectionImplemented: false,
    });
  });

  it('reports confidence and contour metadata for successful detection', async () => {
    const source = await createDocumentOnDarkBackground();
    const storage = new InMemoryStorage(source);
    const provider = new ContourEdgeDetectionProvider(storage);

    const result = await provider.detectAndCorrect(defaultInput);

    expect(result.metadata).toMatchObject({
      provider: 'contour',
      providerVersion: 'contour-sharp-v1',
      detectionMode: 'threshold-connected-components',
      fallbackUsed: false,
      contourDetectionImplemented: true,
      perspectiveCorrectionRequested: true,
      perspectiveCorrectionImplemented: false,
      preprocessing: {
        grayscale: true,
        thresholding: 'otsu',
        edgeExtractionPreparation: 'binary-connected-components',
      },
    });
    expect(result.metadata.contourCount).toBeGreaterThanOrEqual(1);
    expect(result.metadata.confidence).toBe(result.confidence);
    expect(result.metadata.threshold).toEqual(expect.any(Number));
  });

  it('detects contours without writing cropped output when crop output is disabled', async () => {
    const source = await createDocumentOnDarkBackground();
    const storage = new InMemoryStorage(source);
    const provider = new ContourEdgeDetectionProvider(storage);

    const result = await provider.detectAndCorrect({
      ...defaultInput,
      params: {
        perspectiveCorrection: false,
        outputCroppedImage: false,
      },
    });

    expect(result.croppedImageUrl).toBeUndefined();
    expect(storage.writes).toHaveLength(0);
    expect(result.metadata).toMatchObject({
      fallbackUsed: false,
      rectangularCropImplemented: false,
      perspectiveCorrectionImplemented: false,
    });
  });
});

async function createDocumentOnDarkBackground() {
  const page = Buffer.from(
    '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="50" width="240" height="190" fill="#fbfbfb"/></svg>',
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
