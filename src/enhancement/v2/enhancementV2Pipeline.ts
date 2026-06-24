import sharp from 'sharp';
import type { ObjectStorage } from '../../storage/types';
import type { EnhancementProvider, EnhancementProviderInput, EnhancementProviderResult } from '../types';
import { SharpEnhancementProvider } from '../providers/sharpEnhancementProvider';
import { applyAdaptiveThreshold } from './adaptiveThreshold';
import { applyBackgroundWhitening } from './backgroundWhitening';
import { calculateBlurScore } from './blurDetection';
import { applyExposureCorrection } from './exposureCorrection';
import { calculateImageStats } from './imageStats';
import { applyShadowCorrection } from './shadowRemoval';
import type { EnhancementV2Mode, RgbImage } from './types';
import { applyWhiteBalance } from './whiteBalance';

export class EnhancementV2Provider implements EnhancementProvider {
  readonly name = 'SHARP_V2';

  private readonly fallbackProvider: EnhancementProvider;

  constructor(
    private readonly storage: ObjectStorage,
    fallbackProvider?: EnhancementProvider,
  ) {
    this.fallbackProvider = fallbackProvider ?? new SharpEnhancementProvider(storage);
  }

  async enhance(input: EnhancementProviderInput): Promise<EnhancementProviderResult> {
    try {
      const source = await this.storage.read(input.originalImageUrl);
      const image = await readRgbImage(source);
      const mode = normalizeMode(input.params.mode);
      const beforeStats = calculateImageStats(image);
      const blur = calculateBlurScore(image);
      const orderedStages: string[] = ['imageStats', 'exposureCorrection', 'whiteBalance', 'shadowRemoval'];

      let current = image;
      const exposure = applyExposureCorrection(current, beforeStats);
      current = exposure.image;
      const whiteBalance = applyWhiteBalance(current, calculateImageStats(current));
      current = whiteBalance.image;
      const shadow = mode === 'DOCUMENT' || mode === 'MAGIC_COLOR' || mode === 'AUTO' ? applyShadowCorrection(current) : { image: current, applied: false };
      current = shadow.image;
      const adaptiveThreshold =
        mode === 'BLACK_WHITE' ? applyAdaptiveThreshold(current) : { image: current, applied: false };
      current = adaptiveThreshold.image;
      if (adaptiveThreshold.applied) {
        orderedStages.push('adaptiveThreshold');
      }
      const backgroundWhitening =
        mode === 'DOCUMENT' || mode === 'MAGIC_COLOR' || mode === 'AUTO' || mode === 'BLACK_WHITE'
          ? applyBackgroundWhitening(current)
          : { image: current, applied: false };
      current = backgroundWhitening.image;
      orderedStages.push('backgroundWhitening', 'blurDetection', 'finalSharpenNormalize');

      const output = await writeJpeg(current, mode);
      const stored = await this.storage.write(input.outputKey, output, 'image/jpeg');

      return {
        enhancedImageUrl: stored.url,
        metadata: {
          provider: this.name,
          enhancementVersion: 'v2',
          mode,
          fallbackUsed: false,
          orderedStages,
          exposureAdjusted: exposure.adjusted,
          whiteBalanceAdjusted: whiteBalance.adjusted,
          shadowCorrectionApplied: shadow.applied,
          adaptiveThresholdApplied: adaptiveThreshold.applied,
          backgroundWhiteningApplied: backgroundWhitening.applied,
          blurScore: blur.blurScore,
          sharpnessScore: blur.sharpnessScore,
          recommendRescan: blur.recommendRescan,
          outputKey: stored.key,
          outputContentType: 'image/jpeg',
          outputQuality: 92,
          stats: {
            before: beforeStats,
            after: calculateImageStats(current),
          },
          futureCapabilities: {
            deskewRequested: input.params.deskew,
            deskewImplemented: false,
            perspectiveCorrectionRequested: input.params.perspectiveCorrection,
            perspectiveCorrectionImplemented: false,
            mlShadowRemovalImplemented: false,
            fingerRemovalImplemented: false,
          },
        },
      };
    } catch (error) {
      const fallback = await this.fallbackProvider.enhance(input);
      return {
        ...fallback,
        metadata: {
          ...fallback.metadata,
          enhancementVersion: 'v2',
          fallbackUsed: true,
          fallbackProvider: this.fallbackProvider.name,
          fallbackReason: error instanceof Error ? error.message : 'Enhancement V2 failed',
        },
      };
    }
  }
}

async function readRgbImage(source: Buffer): Promise<RgbImage> {
  const {
    data,
    info: { width, height, channels },
  } = await sharp(source, { failOn: 'none' }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = data[pixel * channels] ?? 0;
    rgb[pixel * 3 + 1] = data[pixel * channels + 1] ?? rgb[pixel * 3];
    rgb[pixel * 3 + 2] = data[pixel * channels + 2] ?? rgb[pixel * 3];
  }
  return { width, height, channels: 3, data: rgb };
}

async function writeJpeg(image: RgbImage, mode: EnhancementV2Mode) {
  let pipeline = sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels,
    },
  });

  if (mode === 'GRAYSCALE' || mode === 'BLACK_WHITE') {
    pipeline = pipeline.grayscale();
  }

  return pipeline.normalize().sharpen({ sigma: 1, m1: 1, m2: 2 }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

export function normalizeMode(mode: string): EnhancementV2Mode {
  const normalized = mode.toUpperCase();
  if (normalized === 'COLOR' || normalized === 'GRAYSCALE') {
    return normalized;
  }
  if (normalized === 'DOCUMENT') {
    return 'DOCUMENT';
  }
  if (normalized === 'AUTO' || normalized === 'BLACK_WHITE' || normalized === 'MAGIC_COLOR') {
    return normalized;
  }

  return 'DOCUMENT';
}
