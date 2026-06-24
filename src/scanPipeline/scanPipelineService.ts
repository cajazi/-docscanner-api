import { randomUUID } from 'node:crypto';
import type { EdgeDetectionService } from '../edgeDetection/edgeDetectionService';
import type { EdgeDetectionJobResponse } from '../edgeDetection/types';
import type { EnhancementService } from '../enhancement/enhancementService';
import type { EnhancementJobRecord } from '../enhancement/types';
import type { OCRPipelineService } from '../ocr/ocrPipelineService';
import type { OCRJobRecord } from '../ocr/types';
import { ScanSourceRole } from '../scanSource/types';
import type { SearchablePdfService } from '../searchablePdf/searchablePdfService';
import type { SearchablePdfTextLayer } from '../searchablePdf/types';
import type {
  ProcessPageInput,
  ScanPipelineMetadata,
  ScanPipelineResult,
  ScanPipelineStage,
  StageFailure,
} from './scanPipelineTypes';

export class ScanPipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

type ScanPipelineServiceDependencies = {
  edgeDetectionService: EdgeDetectionService;
  enhancementService: EnhancementService;
  ocrPipelineService: OCRPipelineService;
  searchablePdfService: SearchablePdfService;
};

export class ScanPipelineService {
  private readonly runs = new Map<string, ScanPipelineResult>();

  constructor(private readonly dependencies: ScanPipelineServiceDependencies) {}

  async processPage(input: ProcessPageInput): Promise<ScanPipelineResult> {
    const startedAt = Date.now();
    const completedStages: ScanPipelineStage[] = [];
    const failedStages: StageFailure[] = [];
    const fallbackStages: ScanPipelineStage[] = [];
    const pipelineId = randomUUID();
    let edgeDetectionJob: EdgeDetectionJobResponse | null = null;
    let enhancementJob: EnhancementJobRecord | null = null;
    let ocrJob: OCRJobRecord | null = null;
    let searchableTextLayer: SearchablePdfTextLayer | null = null;

    try {
      const edgeJob = await this.dependencies.edgeDetectionService.createJob({
        documentId: input.documentId,
        pageId: input.pageId,
        params: {
          perspectiveCorrection: true,
          outputCroppedImage: true,
        },
      });
      edgeDetectionJob = await this.dependencies.edgeDetectionService.processJob(edgeJob.id);

      if (edgeDetectionJob?.status === 'COMPLETED') {
        completedStages.push('QUAD_DETECTION');
        if (edgeDetectionJob.croppedImageUrl) {
          completedStages.push('PERSPECTIVE_CORRECTION');
        }
        addPerspectiveFallbackIfNeeded(edgeDetectionJob, fallbackStages);
      } else {
        failedStages.push({
          stage: 'QUAD_DETECTION',
          errorMessage: edgeDetectionJob?.errorMessage ?? 'Edge detection did not complete',
        });
        fallbackStages.push('PERSPECTIVE_CORRECTION');
      }
    } catch (error) {
      failedStages.push({ stage: 'QUAD_DETECTION', errorMessage: readErrorMessage(error) });
      fallbackStages.push('PERSPECTIVE_CORRECTION');
    }

    try {
      const job = await this.dependencies.enhancementService.createJob({
        documentId: input.documentId,
        pageId: input.pageId,
        params: {
          mode: 'document',
          perspectiveCorrection: false,
        },
      });
      enhancementJob = await this.dependencies.enhancementService.processJob(job.id);

      if (enhancementJob?.status === 'COMPLETED') {
        completedStages.push('ENHANCEMENT');
      } else {
        failedStages.push({
          stage: 'ENHANCEMENT',
          errorMessage: enhancementJob?.errorMessage ?? 'Enhancement did not complete',
        });
        fallbackStages.push('ENHANCEMENT');
      }
    } catch (error) {
      failedStages.push({ stage: 'ENHANCEMENT', errorMessage: readErrorMessage(error) });
      fallbackStages.push('ENHANCEMENT');
    }

    try {
      ocrJob = await this.dependencies.ocrPipelineService.startPageOCR({
        documentId: input.documentId,
        pageId: input.pageId,
        language: input.language,
      });

      if (ocrJob.status === 'COMPLETED') {
        completedStages.push('OCR');
      } else {
        failedStages.push({
          stage: 'OCR',
          errorMessage: ocrJob.errorMessage ?? 'OCR did not complete',
        });
      }
    } catch (error) {
      failedStages.push({ stage: 'OCR', errorMessage: readErrorMessage(error) });
    }

    if (ocrJob?.status === 'COMPLETED') {
      try {
        searchableTextLayer = await this.dependencies.searchablePdfService.buildTextLayer(input.documentId);
        completedStages.push('SEARCHABLE_METADATA');
      } catch (error) {
        failedStages.push({ stage: 'SEARCHABLE_METADATA', errorMessage: readErrorMessage(error) });
      }
    }

    const result: ScanPipelineResult = {
      pipelineId,
      documentId: input.documentId,
      pageId: input.pageId,
      pipelineVersion: 'scan-pipeline-v1',
      completedStages,
      failedStages,
      fallbackStages: dedupe(fallbackStages),
      finalImageRole: resolveFinalImageRole(ocrJob, enhancementJob, edgeDetectionJob),
      processingDurationMs: Date.now() - startedAt,
      searchableReady: Boolean(searchableTextLayer && ocrJob?.status === 'COMPLETED'),
      edgeDetectionJob,
      enhancementJob,
      ocrJob,
      searchableTextLayer,
    };

    this.persistPipelineMetadata(result);
    return result;
  }

  getPipelineRun(pipelineId: string): ScanPipelineResult {
    const run = this.runs.get(pipelineId);
    if (!run) {
      throw new ScanPipelineError('SCAN_PIPELINE_NOT_FOUND', 'Scan pipeline run was not found', 404);
    }

    return run;
  }

  private persistPipelineMetadata(result: ScanPipelineResult) {
    this.runs.set(result.pipelineId, result);
  }
}

function addPerspectiveFallbackIfNeeded(job: EdgeDetectionJobResponse, fallbackStages: ScanPipelineStage[]) {
  const resultMetadata = readResultMetadata(job.metadata);
  const perspectiveImplemented = resultMetadata.perspectiveCorrectionImplemented === true;
  const correctionFallbackUsed = resultMetadata.correctionFallbackUsed === true || resultMetadata.fallbackUsed === true;

  if (!perspectiveImplemented || correctionFallbackUsed) {
    fallbackStages.push('PERSPECTIVE_CORRECTION');
  }
}

function readResultMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const result = (metadata as Record<string, unknown>).result;
  return result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : {};
}

function resolveFinalImageRole(
  ocrJob: OCRJobRecord | null,
  enhancementJob: EnhancementJobRecord | null,
  edgeDetectionJob: EdgeDetectionJobResponse | null,
) {
  if (ocrJob) {
    return ocrJob.sourceImageRole as ScanSourceRole;
  }

  if (enhancementJob?.status === 'COMPLETED') {
    return ScanSourceRole.ENHANCED;
  }

  if (edgeDetectionJob?.status === 'COMPLETED' && edgeDetectionJob.croppedImageUrl) {
    return ScanSourceRole.CROPPED;
  }

  return ScanSourceRole.ORIGINAL;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Scan pipeline stage failed';
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}

export function toProcessPageResponse(result: ScanPipelineResult) {
  return {
    pipelineId: result.pipelineId,
    completedStages: result.completedStages,
    failedStages: result.failedStages,
    finalImageRole: result.finalImageRole,
    searchableReady: result.searchableReady,
  };
}
