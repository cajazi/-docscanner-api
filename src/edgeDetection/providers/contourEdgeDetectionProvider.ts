import sharp from 'sharp';
import type { ObjectStorage } from '../../storage/types';
import type { DocumentCorners, EdgeDetectionResult } from '../types';
import type { EdgeDetectionProvider, EdgeDetectionProviderInput } from './edgeDetectionProvider';
import { HeuristicEdgeDetectionProvider } from './heuristicEdgeDetectionProvider';

const providerVersion = 'contour-sharp-v1';
const maxAnalysisDimension = 1024;
const minimumContrast = 12;
const minimumComponentAreaRatio = 0.02;

type CandidateBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
};

type AnalysisResult = {
  corners: DocumentCorners;
  confidence: number;
  contourCount: number;
  bounds: CandidateBounds;
  threshold: number;
  analysisWidth: number;
  analysisHeight: number;
};

export class ContourEdgeDetectionProvider implements EdgeDetectionProvider {
  readonly name = 'contour';

  private readonly fallbackProvider: HeuristicEdgeDetectionProvider;

  constructor(private readonly storage: ObjectStorage) {
    this.fallbackProvider = new HeuristicEdgeDetectionProvider(storage);
  }

  async detectAndCorrect(input: EdgeDetectionProviderInput): Promise<EdgeDetectionResult> {
    const source = await this.storage.read(input.sourceImageUrl);

    try {
      const analysis = await analyzeDocumentBounds(source);
      const croppedImageUrl = input.params.outputCroppedImage
        ? await this.writeRectangularCrop(source, analysis.bounds, analysis, input.outputStorageKey)
        : undefined;

      return {
        corners: analysis.corners,
        confidence: analysis.confidence,
        croppedImageUrl,
        metadata: {
          provider: this.name,
          providerVersion,
          detectionMode: 'threshold-connected-components',
          contourCount: analysis.contourCount,
          confidence: analysis.confidence,
          fallbackUsed: false,
          contourDetectionImplemented: true,
          perspectiveCorrectionRequested: input.params.perspectiveCorrection,
          perspectiveCorrectionImplemented: false,
          rectangularCropImplemented: Boolean(croppedImageUrl),
          threshold: analysis.threshold,
          preprocessing: {
            grayscale: true,
            thresholding: 'otsu',
            edgeExtractionPreparation: 'binary-connected-components',
          },
        },
      };
    } catch (error) {
      return this.fallback(input, error);
    }
  }

  private async writeRectangularCrop(
    source: Buffer,
    bounds: CandidateBounds,
    analysis: AnalysisResult,
    outputStorageKey: string,
  ) {
    const metadata = await sharp(source, { failOn: 'none' }).rotate().metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Source image dimensions could not be read for crop output');
    }

    const scaleX = metadata.width / analysis.analysisWidth;
    const scaleY = metadata.height / analysis.analysisHeight;
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

  private async fallback(input: EdgeDetectionProviderInput, error: unknown): Promise<EdgeDetectionResult> {
    const fallbackResult = await this.fallbackProvider.detectAndCorrect(input);
    return {
      ...fallbackResult,
      metadata: {
        ...fallbackResult.metadata,
        provider: this.name,
        providerVersion,
        detectionMode: 'contour-fallback',
        contourCount: 0,
        confidence: fallbackResult.confidence,
        fallbackUsed: true,
        contourDetectionImplemented: true,
        perspectiveCorrectionRequested: input.params.perspectiveCorrection,
        perspectiveCorrectionImplemented: false,
        fallbackProvider: this.fallbackProvider.name,
        fallbackReason: error instanceof Error ? error.message : 'Contour detection failed',
      },
    };
  }
}

async function analyzeDocumentBounds(source: Buffer): Promise<AnalysisResult> {
  const {
    data,
    info: { width, height, channels },
  } = await sharp(source, { failOn: 'none' })
    .rotate()
    .resize({
      width: maxAnalysisDimension,
      height: maxAnalysisDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const luminance = readLuminance(data, channels);
  const stats = readStats(luminance);
  if (stats.max - stats.min < minimumContrast) {
    throw new Error('Insufficient contrast for contour detection');
  }

  const threshold = otsuThreshold(luminance);
  const foreground = buildForegroundMask(luminance, threshold);
  const candidates = findCandidateComponents(foreground, width, height);
  const best = candidates[0];
  if (!best) {
    throw new Error('No document contour candidate was found');
  }

  const confidence = calculateConfidence(best, width, height);
  if (confidence < 0.45) {
    throw new Error('Document contour confidence was below threshold');
  }

  return {
    corners: boundsToCorners(best, width, height),
    confidence,
    contourCount: candidates.length,
    bounds: best,
    threshold,
    analysisWidth: width,
    analysisHeight: height,
  };
}

function readLuminance(data: Buffer, channels: number) {
  const pixelCount = data.length / channels;
  const values = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    values[index] = data[index * channels] ?? 0;
  }
  return values;
}

function readStats(values: Uint8Array) {
  let min = 255;
  let max = 0;
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  return { min, max };
}

function otsuThreshold(values: Uint8Array) {
  const histogram = new Array<number>(256).fill(0);
  for (const value of values) {
    histogram[value] += 1;
  }

  const total = values.length;
  let sum = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    sum += index * histogram[index];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = 0;
  let threshold = 127;

  for (let index = 0; index < histogram.length; index += 1) {
    weightBackground += histogram[index];
    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }

    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = index;
    }
  }

  return threshold;
}

function buildForegroundMask(values: Uint8Array, threshold: number) {
  const mask = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    mask[index] = values[index] > threshold ? 1 : 0;
  }
  return mask;
}

function findCandidateComponents(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const candidates: CandidateBounds[] = [];
  const minimumArea = width * height * minimumComponentAreaRatio;

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue;
    }

    const component = floodFill(mask, visited, width, height, index);
    if (component.area < minimumArea || isFullFrameComponent(component, width, height)) {
      continue;
    }

    candidates.push(component);
  }

  return candidates.sort((left, right) => scoreCandidate(right, width, height) - scoreCandidate(left, width, height));
}

function floodFill(mask: Uint8Array, visited: Uint8Array, width: number, height: number, startIndex: number) {
  const queue = [startIndex];
  visited[startIndex] = 1;
  const bounds: CandidateBounds = {
    minX: startIndex % width,
    minY: Math.floor(startIndex / width),
    maxX: startIndex % width,
    maxY: Math.floor(startIndex / width),
    area: 0,
  };

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    bounds.area += 1;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);

    visitNeighbor(mask, visited, queue, width, height, x - 1, y);
    visitNeighbor(mask, visited, queue, width, height, x + 1, y);
    visitNeighbor(mask, visited, queue, width, height, x, y - 1);
    visitNeighbor(mask, visited, queue, width, height, x, y + 1);
  }

  return bounds;
}

function visitNeighbor(
  mask: Uint8Array,
  visited: Uint8Array,
  queue: number[],
  width: number,
  height: number,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }

  const index = y * width + x;
  if (!mask[index] || visited[index]) {
    return;
  }

  visited[index] = 1;
  queue.push(index);
}

function isFullFrameComponent(bounds: CandidateBounds, width: number, height: number) {
  const componentWidth = bounds.maxX - bounds.minX + 1;
  const componentHeight = bounds.maxY - bounds.minY + 1;
  return componentWidth / width > 0.98 && componentHeight / height > 0.98;
}

function scoreCandidate(bounds: CandidateBounds, width: number, height: number) {
  const boxArea = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
  const areaRatio = boxArea / (width * height);
  const fillRatio = bounds.area / boxArea;
  const marginScore = Math.min(bounds.minX, bounds.minY, width - bounds.maxX - 1, height - bounds.maxY - 1) >= 2 ? 0.1 : 0;
  return areaRatio + fillRatio + marginScore;
}

function calculateConfidence(bounds: CandidateBounds, width: number, height: number) {
  const boxArea = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
  const areaRatio = boxArea / (width * height);
  const fillRatio = bounds.area / boxArea;
  const borderPenalty = touchesImageBorder(bounds, width, height) ? 0.2 : 0;
  return round(clamp(0.25 + fillRatio * 0.35 + Math.min(areaRatio, 0.8) * 0.45 - borderPenalty, 0, 0.95), 3);
}

function touchesImageBorder(bounds: CandidateBounds, width: number, height: number) {
  return bounds.minX <= 1 || bounds.minY <= 1 || bounds.maxX >= width - 2 || bounds.maxY >= height - 2;
}

function boundsToCorners(bounds: CandidateBounds, width: number, height: number): DocumentCorners {
  return {
    topLeft: normalizeCorner(bounds.minX, bounds.minY, width, height),
    topRight: normalizeCorner(bounds.maxX, bounds.minY, width, height),
    bottomRight: normalizeCorner(bounds.maxX, bounds.maxY, width, height),
    bottomLeft: normalizeCorner(bounds.minX, bounds.maxY, width, height),
  };
}

function normalizeCorner(x: number, y: number, width: number, height: number) {
  return {
    x: round(clamp(x / Math.max(width - 1, 1), 0, 1), 4),
    y: round(clamp(y / Math.max(height - 1, 1), 0, 1), 4),
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
