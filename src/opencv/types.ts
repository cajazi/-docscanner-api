import type { ObjectStorage } from '../storage/types';
import type { EdgeDetectionResult } from '../edgeDetection/types';
import type { EdgeDetectionProviderInput } from '../edgeDetection/providers/edgeDetectionProvider';

export type CvProviderPreference = 'native' | 'typescript';

export type NativeOpenCvModule = {
  version?: string;
  VERSION?: string;
  GaussianBlur?: unknown;
  CLAHE?: unknown;
  createCLAHE?: unknown;
  adaptiveThreshold?: unknown;
  morphologyEx?: unknown;
  findContours?: unknown;
  approxPolyDP?: unknown;
  contourArea?: unknown;
  arcLength?: unknown;
  convexHull?: unknown;
  warpPerspective?: unknown;
  getPerspectiveTransform?: unknown;
  resize?: unknown;
  cvtColor?: unknown;
  threshold?: unknown;
  connectedComponents?: unknown;
};

export type NativeOpenCvDetectionResult = EdgeDetectionResult & {
  metadata: Record<string, unknown>;
};

export interface NativeOpenCvAdapter {
  readonly name: string;
  readonly version: string | null;
  detectDocument(input: EdgeDetectionProviderInput, source: Buffer, storage: ObjectStorage): Promise<NativeOpenCvDetectionResult>;
}

export type OpenCvLoadResult =
  | {
      available: true;
      adapter: NativeOpenCvAdapter;
      version: string | null;
      packageName: string;
    }
  | {
      available: false;
      adapter: null;
      version: null;
      packageName: null;
      errorMessage: string;
    };

export type OpenCvProviderMetadata = {
  nativeOpenCvAvailable: boolean;
  provider: 'native-opencv' | 'typescript-cv';
  fallbackUsed: boolean;
  opencvVersion: string | null;
};
