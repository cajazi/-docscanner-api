import type { ObjectStorage } from '../storage/types';
import type { EdgeDetectionResult } from '../edgeDetection/types';
import { CvQuadDetectionProvider } from '../edgeDetection/cv/cvQuadDetectionProvider';
import type { EdgeDetectionProvider, EdgeDetectionProviderInput } from '../edgeDetection/providers/edgeDetectionProvider';
import { loadOpenCv } from './opencvLoader';
import type { CvProviderPreference, NativeOpenCvAdapter, OpenCvLoadResult } from './types';

export type OpenCvProviderOptions = {
  preference?: CvProviderPreference;
  loadOpenCv?: () => OpenCvLoadResult;
  fallbackProvider?: EdgeDetectionProvider;
};

export class OpenCvProvider implements EdgeDetectionProvider {
  readonly name = 'opencv';

  private readonly preference: CvProviderPreference;
  private readonly loadOpenCv: () => OpenCvLoadResult;
  private readonly fallbackProvider: EdgeDetectionProvider;
  private readonly storage: ObjectStorage;

  constructor(storage: ObjectStorage, options: OpenCvProviderOptions = {}) {
    this.storage = storage;
    this.preference = options.preference ?? 'native';
    this.loadOpenCv = options.loadOpenCv ?? loadOpenCv;
    this.fallbackProvider = options.fallbackProvider ?? new CvQuadDetectionProvider(storage);
  }

  async detectAndCorrect(input: EdgeDetectionProviderInput): Promise<EdgeDetectionResult> {
    const loaded = this.loadOpenCv();
    const source = loaded.available && this.preference === 'native' ? await this.storage.read(input.sourceImageUrl) : null;

    if (this.preference === 'native' && loaded.available) {
      try {
        const result = await runNative(loaded.adapter, input, source ?? Buffer.alloc(0), this.storage);
        return {
          ...result,
          metadata: {
            ...result.metadata,
            nativeOpenCvAvailable: true,
            provider: 'native-opencv',
            fallbackUsed: false,
            opencvVersion: loaded.version,
          },
        };
      } catch (error) {
        const fallback = await this.fallbackProvider.detectAndCorrect(input);
        return withFallbackMetadata(fallback, {
          nativeOpenCvAvailable: true,
          opencvVersion: loaded.version,
          fallbackReason: error instanceof Error ? error.message : 'Native OpenCV provider failed',
        });
      }
    }

    const fallback = await this.fallbackProvider.detectAndCorrect(input);
    return withFallbackMetadata(fallback, {
      nativeOpenCvAvailable: loaded.available,
      opencvVersion: loaded.version,
      fallbackReason:
        this.preference === 'typescript'
          ? 'CV_PROVIDER=typescript selected'
          : loaded.available
            ? 'Native OpenCV was not selected'
            : loaded.errorMessage,
    });
  }
}

async function runNative(adapter: NativeOpenCvAdapter, input: EdgeDetectionProviderInput, source: Buffer, storage: ObjectStorage) {
  return adapter.detectDocument(input, source, storage);
}

function withFallbackMetadata(
  result: EdgeDetectionResult,
  details: { nativeOpenCvAvailable: boolean; opencvVersion: string | null; fallbackReason: string },
): EdgeDetectionResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      nativeOpenCvAvailable: details.nativeOpenCvAvailable,
      provider: 'typescript-cv',
      fallbackUsed: true,
      opencvVersion: details.opencvVersion,
      fallbackReason: details.fallbackReason,
    },
  };
}
