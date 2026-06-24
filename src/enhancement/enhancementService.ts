import type {
  EnhancementJobRecord,
  EnhancementParams,
  EnhancementProvider,
  EnhancementRepository,
} from './types';

export type CreateEnhancementJobInput = {
  documentId: string;
  pageId: string;
  params?: Partial<EnhancementParams>;
};

export class EnhancementPipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const defaultParams: EnhancementParams = {
  mode: 'document',
  brightness: 1.03,
  contrast: 1.08,
  deskew: false,
  perspectiveCorrection: false,
};

export class EnhancementService {
  constructor(
    private readonly repository: EnhancementRepository,
    private readonly provider: EnhancementProvider,
  ) {}

  async createJob(input: CreateEnhancementJobInput): Promise<EnhancementJobRecord> {
    const page = await this.repository.findPageTarget(input.documentId, input.pageId);
    if (!page) {
      throw new EnhancementPipelineError('PAGE_NOT_FOUND', 'Document page was not found', 404);
    }

    const originalImageUrl = page.originalImageUrl;
    if (!originalImageUrl) {
      throw new EnhancementPipelineError(
        'PAGE_IMAGE_MISSING',
        'Document page does not have an original image for enhancement',
        409,
      );
    }

    const activeJob = await this.repository.findActiveJobForPage(input.pageId);
    if (activeJob) {
      return activeJob;
    }

    const params = normalizeParams(input.params);
    return this.repository.createJob({
      pageId: input.pageId,
      provider: this.provider.name,
      originalImageUrl,
      metadata: {
        params,
        requestedCapabilities: {
          deskew: params.deskew,
          perspectiveCorrection: params.perspectiveCorrection,
        },
      },
    });
  }

  async processJob(jobId: string): Promise<EnhancementJobRecord | null> {
    const claimedJob = await this.repository.claimPendingJob(jobId);
    if (!claimedJob) {
      return null;
    }

    const params = readParams(claimedJob.metadata);

    try {
      const result = await this.provider.enhance({
        originalImageUrl: claimedJob.originalImageUrl,
        outputKey: buildOutputKey(claimedJob.pageId, claimedJob.id),
        params,
      });

      return this.repository.completeJob({
        jobId: claimedJob.id,
        pageId: claimedJob.pageId,
        enhancedImageUrl: result.enhancedImageUrl,
        metadata: {
          ...readMetadataObject(claimedJob.metadata),
          result: result.metadata,
        },
      });
    } catch (error) {
      return this.repository.failJob({
        jobId: claimedJob.id,
        errorMessage: error instanceof Error ? error.message : 'Image enhancement provider failed',
        metadata: {
          ...readMetadataObject(claimedJob.metadata),
          failureStage: 'provider',
        },
      });
    }
  }

  async processNextPendingJobs(limit: number): Promise<PromiseSettledResult<EnhancementJobRecord | null>[]> {
    const jobs = await this.repository.findPendingJobs(limit);
    return Promise.allSettled(jobs.map((job) => this.processJob(job.id)));
  }

  async getJob(jobId: string): Promise<EnhancementJobRecord> {
    const job = await this.repository.getJob(jobId);
    if (!job) {
      throw new EnhancementPipelineError('ENHANCEMENT_JOB_NOT_FOUND', 'Enhancement job was not found', 404);
    }

    return job;
  }
}

export function normalizeParams(params: Partial<EnhancementParams> | undefined): EnhancementParams {
  return {
    mode: params?.mode ?? defaultParams.mode,
    brightness: clamp(params?.brightness ?? defaultParams.brightness, 0.5, 1.5),
    contrast: clamp(params?.contrast ?? defaultParams.contrast, 0.5, 1.8),
    deskew: params?.deskew ?? defaultParams.deskew,
    perspectiveCorrection: params?.perspectiveCorrection ?? defaultParams.perspectiveCorrection,
  };
}

function buildOutputKey(pageId: string, jobId: string) {
  return `enhancements/${pageId}/${jobId}.jpg`;
}

function readParams(metadata: unknown): EnhancementParams {
  const object = readMetadataObject(metadata);
  const params = object.params;

  if (!params || typeof params !== 'object') {
    return defaultParams;
  }

  return normalizeParams(params as Partial<EnhancementParams>);
}

function readMetadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
