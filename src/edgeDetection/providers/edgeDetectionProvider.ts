import type { EdgeDetectionParams, EdgeDetectionResult } from '../types';

export type EdgeDetectionProviderInput = {
  sourceImageUrl: string;
  outputStorageKey: string;
  params: EdgeDetectionParams;
};

export interface EdgeDetectionProvider {
  name: string;
  detectAndCorrect(input: EdgeDetectionProviderInput): Promise<EdgeDetectionResult>;
}
