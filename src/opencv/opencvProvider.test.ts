import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage, StoredObject } from '../storage/types';
import type { EdgeDetectionResult } from '../edgeDetection/types';
import type { EdgeDetectionProvider } from '../edgeDetection/providers/edgeDetectionProvider';
import { getOpenCvCapabilities } from './opencvCapabilities';
import { OpenCvProvider } from './opencvProvider';
import type { NativeOpenCvAdapter, OpenCvLoadResult } from './types';

class InMemoryStorage implements ObjectStorage {
  readCalls: string[] = [];

  async read(sourceUrl: string) {
    this.readCalls.push(sourceUrl);
    return Buffer.from('image-bytes');
  }

  async write(key: string): Promise<StoredObject> {
    return { key, url: `stored://${key}` };
  }
}

const fullPageCorners = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};

const input = {
  sourceImageUrl: 'stored://source.jpg',
  outputStorageKey: 'edge-detection/page_1/job_1.jpg',
  params: {
    perspectiveCorrection: true,
    outputCroppedImage: true,
  },
};

describe('OpenCvProvider', () => {
  it('uses native adapter when native OpenCV is available and requested', async () => {
    const storage = new InMemoryStorage();
    const nativeDetect = vi.fn(async (): Promise<EdgeDetectionResult> => nativeResult());
    const provider = new OpenCvProvider(storage, {
      preference: 'native',
      loadOpenCv: () => nativeLoaded(nativeDetect),
      fallbackProvider: fallbackProvider(),
    });

    const result = await provider.detectAndCorrect(input);

    expect(nativeDetect).toHaveBeenCalledWith(input, Buffer.from('image-bytes'), storage);
    expect(storage.readCalls).toEqual(['stored://source.jpg']);
    expect(result.metadata).toMatchObject({
      provider: 'native-opencv',
      nativeOpenCvAvailable: true,
      fallbackUsed: false,
      opencvVersion: '4.9.0-test',
    });
  });

  it('falls back automatically when native OpenCV is unavailable', async () => {
    const provider = new OpenCvProvider(new InMemoryStorage(), {
      preference: 'native',
      loadOpenCv: nativeUnavailable,
      fallbackProvider: fallbackProvider(),
    });

    const result = await provider.detectAndCorrect(input);

    expect(result.metadata).toMatchObject({
      provider: 'typescript-cv',
      nativeOpenCvAvailable: false,
      fallbackUsed: true,
      opencvVersion: null,
    });
  });

  it('uses TypeScript provider when CV_PROVIDER=typescript is selected even if native is available', async () => {
    const nativeDetect = vi.fn(async (): Promise<EdgeDetectionResult> => nativeResult());
    const provider = new OpenCvProvider(new InMemoryStorage(), {
      preference: 'typescript',
      loadOpenCv: () => nativeLoaded(nativeDetect),
      fallbackProvider: fallbackProvider(),
    });

    const result = await provider.detectAndCorrect(input);

    expect(nativeDetect).not.toHaveBeenCalled();
    expect(result.metadata).toMatchObject({
      provider: 'typescript-cv',
      nativeOpenCvAvailable: true,
      fallbackUsed: true,
      fallbackReason: 'CV_PROVIDER=typescript selected',
    });
  });

  it('falls back when native adapter fails during detection', async () => {
    const provider = new OpenCvProvider(new InMemoryStorage(), {
      preference: 'native',
      loadOpenCv: () =>
        nativeLoaded(async () => {
          throw new Error('native contour detection failed');
        }),
      fallbackProvider: fallbackProvider(),
    });

    const result = await provider.detectAndCorrect(input);

    expect(result.metadata).toMatchObject({
      provider: 'typescript-cv',
      nativeOpenCvAvailable: true,
      fallbackUsed: true,
      fallbackReason: 'native contour detection failed',
    });
  });
});

describe('getOpenCvCapabilities', () => {
  it('reports native provider when native is available', () => {
    expect(getOpenCvCapabilities('native', () => nativeLoaded(async () => nativeResult()))).toEqual({
      nativeOpenCvImplemented: true,
      nativeAvailable: true,
      provider: 'native-opencv',
      fallbackSupported: true,
      opencvVersion: '4.9.0-test',
    });
  });

  it('reports TypeScript fallback when native is unavailable', () => {
    expect(getOpenCvCapabilities('native', nativeUnavailable)).toEqual({
      nativeOpenCvImplemented: false,
      nativeAvailable: false,
      provider: 'typescript-cv',
      fallbackSupported: true,
      opencvVersion: null,
    });
  });
});

function nativeLoaded(detectDocument: NativeOpenCvAdapter['detectDocument']): OpenCvLoadResult {
  return {
    available: true,
    version: '4.9.0-test',
    packageName: 'opencv4nodejs',
    adapter: {
      name: 'native-opencv',
      version: '4.9.0-test',
      detectDocument,
    },
  };
}

function nativeUnavailable(): OpenCvLoadResult {
  return {
    available: false,
    adapter: null,
    version: null,
    packageName: null,
    errorMessage: 'opencv package not installed',
  };
}

function nativeResult(): EdgeDetectionResult {
  return {
    corners: fullPageCorners,
    confidence: 0.93,
    croppedImageUrl: 'stored://native.jpg',
    metadata: {
      detectionMode: 'native-opencv',
    },
  };
}

function fallbackProvider(): EdgeDetectionProvider {
  return {
    name: 'typescript-cv',
    async detectAndCorrect() {
      return {
        corners: fullPageCorners,
        confidence: 0.7,
        croppedImageUrl: 'stored://fallback.jpg',
        metadata: {
          detectionMode: 'cv-pipeline-foundation',
          fallbackProviderResult: true,
        },
      };
    },
  };
}
