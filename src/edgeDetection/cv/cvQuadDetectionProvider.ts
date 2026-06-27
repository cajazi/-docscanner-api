import sharp from 'sharp';
import type { ObjectStorage } from '../../storage/types';
import type { EdgeDetectionResult } from '../types';
import { ContourEdgeDetectionProvider } from '../providers/contourEdgeDetectionProvider';
import type { EdgeDetectionProvider, EdgeDetectionProviderInput } from '../providers/edgeDetectionProvider';
import { cannyEdgeDetect } from './cannyEdgeDetector';
import { extractContours } from './contourExtractor';
import { adaptiveThreshold, combineBinaryMasks, gaussianBlur, loadGrayscaleImage, morphologicalClose } from './cvPreprocessing';
import { approximateQuad } from './polygonApproximator';
import { scoreQuadCandidates } from './quadCandidateScorer';

const providerVersion = 'cv-pipeline-ts-v1';

export class CvQuadDetectionProvider implements EdgeDetectionProvider {
  readonly name = 'cv-pipeline';

  private readonly fallbackProvider: ContourEdgeDetectionProvider;

  constructor(private readonly storage: ObjectStorage) {
    this.fallbackProvider = new ContourEdgeDetectionProvider(storage);
  }

  async detectAndCorrect(input: EdgeDetectionProviderInput): Promise<EdgeDetectionResult> {
    const source = await this.storage.read(input.sourceImageUrl);

    try {
      const grayscale = await loadGrayscaleImage(source);
      const blurred = gaussianBlur(grayscale);
      const threshold = adaptiveThreshold(blurred);
      const edges = cannyEdgeDetect(blurred);
      const closed = morphologicalClose(combineBinaryMasks(threshold, edges), 2);
      const contours = extractContours(closed);
      const polygons = contours
        .map((contour) => approximateQuad(contour, closed.width, closed.height))
        .filter((polygon): polygon is NonNullable<typeof polygon> => polygon !== null);
      const candidates = scoreQuadCandidates(polygons, closed.width, closed.height);
      const best = candidates[0];
      if (!best) {
        throw new Error('CV pipeline did not find a document quad candidate');
      }

      const croppedImageUrl = input.params.outputCroppedImage
        ? await this.writeRectangularOutput(source, best.contour, closed.width, closed.height, input.outputStorageKey)
        : undefined;

      return {
        corners: best.corners,
        confidence: best.confidence,
        croppedImageUrl,
        metadata: {
          provider: this.name,
          providerVersion,
          detectionMode: 'cv-pipeline-foundation',
          cannyImplemented: true,
          contourExtractionImplemented: true,
          polygonApproximationImplemented: true,
          nativeOpenCvImplemented: false,
          fallbackUsed: false,
          contourCount: contours.length,
          polygonCandidateCount: polygons.length,
          confidence: best.confidence,
          metrics: best.metrics,
          perspectiveCorrectionRequested: input.params.perspectiveCorrection,
          perspectiveCorrectionImplemented: false,
          outputCroppedImage: Boolean(croppedImageUrl),
        },
      };
    } catch (error) {
      const fallback = await this.fallbackProvider.detectAndCorrect(input);
      return {
        ...fallback,
        metadata: {
          ...fallback.metadata,
          provider: this.name,
          providerVersion,
          detectionMode: 'cv-pipeline-foundation',
          cannyImplemented: true,
          contourExtractionImplemented: true,
          polygonApproximationImplemented: true,
          nativeOpenCvImplemented: false,
          fallbackUsed: true,
          fallbackProvider: this.fallbackProvider.name,
          fallbackReason: error instanceof Error ? error.message : 'CV pipeline failed',
        },
      };
    }
  }

  private async writeRectangularOutput(
    source: Buffer,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    analysisWidth: number,
    analysisHeight: number,
    outputStorageKey: string,
  ) {
    const metadata = await sharp(source, { failOn: 'none' }).rotate().metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Source image dimensions could not be read for CV output');
    }

    const scaleX = metadata.width / analysisWidth;
    const scaleY = metadata.height / analysisHeight;
    const left = clampInteger(Math.floor(bounds.minX * scaleX), 0, metadata.width - 1);
    const top = clampInteger(Math.floor(bounds.minY * scaleY), 0, metadata.height - 1);
    const right = clampInteger(Math.ceil((bounds.maxX + 1) * scaleX), left + 1, metadata.width);
    const bottom = clampInteger(Math.ceil((bounds.maxY + 1) * scaleY), top + 1, metadata.height);

    const output = await sharp(source, { failOn: 'none' })
      .rotate()
      .extract({
        left,
        top,
        width: right - left,
        height: bottom - top,
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const stored = await this.storage.write(outputStorageKey, output, 'image/jpeg');
    return stored.url;
  }
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
