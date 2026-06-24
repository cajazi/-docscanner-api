import { loadOpenCv } from './opencvLoader';
import type { CvProviderPreference, OpenCvLoadResult } from './types';

export type OpenCvCapabilityReport = {
  nativeOpenCvImplemented: boolean;
  nativeAvailable: boolean;
  provider: 'native-opencv' | 'typescript-cv';
  fallbackSupported: boolean;
  opencvVersion: string | null;
};

export function getOpenCvCapabilities(
  preference: CvProviderPreference = 'native',
  loader: () => OpenCvLoadResult = loadOpenCv,
): OpenCvCapabilityReport {
  const loaded = loader();
  const useNative = preference === 'native' && loaded.available;

  return {
    nativeOpenCvImplemented: useNative,
    nativeAvailable: loaded.available,
    provider: useNative ? 'native-opencv' : 'typescript-cv',
    fallbackSupported: true,
    opencvVersion: loaded.version,
  };
}
