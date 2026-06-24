import { createRequire } from 'node:module';
import type { NativeOpenCvAdapter, NativeOpenCvModule, OpenCvLoadResult } from './types';
import { OpenCvNativePipelineError } from './opencvErrors';

const optionalPackages = ['@u4/opencv4nodejs', 'opencv4nodejs'];
const requireOptional = createRequire(import.meta.url);

export function loadOpenCv(): OpenCvLoadResult {
  const errors: string[] = [];

  for (const packageName of optionalPackages) {
    try {
      const module = requireOptional(packageName) as NativeOpenCvModule;
      const adapter = createNativeOpenCvAdapter(module);
      return {
        available: true,
        adapter,
        version: adapter.version,
        packageName,
      };
    } catch (error) {
      errors.push(`${packageName}: ${error instanceof Error ? error.message : 'load failed'}`);
    }
  }

  return {
    available: false,
    adapter: null,
    version: null,
    packageName: null,
    errorMessage: errors.join('; '),
  };
}

export function createNativeOpenCvAdapter(module: NativeOpenCvModule): NativeOpenCvAdapter {
  validateNativeSurface(module);

  return {
    name: 'native-opencv',
    version: readVersion(module),
    async detectDocument() {
      throw new OpenCvNativePipelineError(
        'Native OpenCV module is available, but document detection adapter needs package-specific Mat decode wiring before production use',
      );
    },
  };
}

function validateNativeSurface(module: NativeOpenCvModule) {
  const required: Array<keyof NativeOpenCvModule> = [
    'GaussianBlur',
    'adaptiveThreshold',
    'morphologyEx',
    'findContours',
    'approxPolyDP',
    'contourArea',
    'arcLength',
    'convexHull',
    'warpPerspective',
    'getPerspectiveTransform',
    'resize',
    'cvtColor',
    'threshold',
    'connectedComponents',
  ];
  const missing = required.filter((key) => typeof module[key] !== 'function');

  if (missing.length > 0) {
    throw new OpenCvNativePipelineError(`Native OpenCV module is missing required functions: ${missing.join(', ')}`);
  }
}

function readVersion(module: NativeOpenCvModule) {
  return module.version ?? module.VERSION ?? null;
}
