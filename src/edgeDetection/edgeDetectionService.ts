import type { EdgeDetectionProvider } from './providers/edgeDetectionProvider';
import type {
  CreateEdgeDetectionJobInput,
  EdgeDetectionJobResponse,
  EdgeDetectionParams,
  EdgeDetectionRepository,
} from './types';

export class EdgeDetectionPipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const defaultParams: EdgeDetectionParams = {
  perspectiveCorrection: false,
  outputCroppedImage: true,
};

export class EdgeDetectionService {
  constructor(
    private readonly repository: EdgeDetectionRepository,
    private readonly provider: EdgeDetectionProvider,
  ) {}

  async createJob(input: CreateEdgeDetectionJobInput): Promise<EdgeDetectionJobResponse> {
    const page = await this.repository.findPageTarget(input.documentId, input.pageId);
    if (!page) {
      throw new EdgeDetectionPipelineError('PAGE_NOT_FOUND', 'Document page was not found', 404);
    }

    const sourceImageUrl = page.originalImageUrl ?? page.enhancedImageUrl;
    if (!sourceImageUrl) {
      throw new EdgeDetectionPipelineError(
        'PAGE_IMAGE_MISSING',
        'Document page does not have a usable image for edge detection',
        409,
      );
    }

    const activeJob = await this.repository.findActiveByPageId(input.pageId);
    if (activeJob) {
      return activeJob;
    }

    const params = normalizeParams(input.params);
    return this.repository.create({
      pageId: input.pageId,
      provider: this.provider.name,
      sourceImageUrl,
      metadata: {
        params,
        sourceSelection: page.originalImageUrl ? 'originalImageUrl' : 'enhancedImageUrl',
        croppedSourceAvoidedByDefault: Boolean(page.croppedImageUrl),
      },
    });
  }

  async processJob(jobId: string): Promise<EdgeDetectionJobResponse | null> {
    const claimedJob = await this.repository.claimJob(jobId);
    if (!claimedJob) {
      return null;
    }

    const params = readParams(claimedJob.metadata);

    try {
      const result = await this.provider.detectAndCorrect({
        sourceImageUrl: claimedJob.sourceImageUrl,
        outputStorageKey: buildOutputKey(claimedJob.pageId, claimedJob.id),
        params,
      });

      return this.repository.markCompleted({
        jobId: claimedJob.id,
        pageId: claimedJob.pageId,
        corners: result.corners,
        confidence: result.confidence,
        croppedImageUrl: result.croppedImageUrl,
        metadata: {
          ...readMetadataObject(claimedJob.metadata),
          result: result.metadata,
        },
      });
    } catch (error) {
      return this.repository.markFailed({
        jobId: claimedJob.id,
        errorMessage: error instanceof Error ? error.message : 'Edge detection provider failed',
        metadata: {
          ...readMetadataObject(claimedJob.metadata),
          failureStage: 'provider',
        },
      });
    }
  }

  async processNextPendingJobs(limit: number): Promise<PromiseSettledResult<EdgeDetectionJobResponse | null>[]> {
    const jobs = await this.repository.findPendingJobs(limit);
    return Promise.allSettled(jobs.map((job) => this.processJob(job.id)));
  }

  async getJob(jobId: string): Promise<EdgeDetectionJobResponse> {
    const job = await this.repository.findById(jobId);
    if (!job) {
      throw new EdgeDetectionPipelineError('EDGE_DETECTION_JOB_NOT_FOUND', 'Edge detection job was not found', 404);
    }

    return job;
  }
}

export function normalizeParams(params: Partial<EdgeDetectionParams> | undefined): EdgeDetectionParams {
  return {
    perspectiveCorrection: params?.perspectiveCorrection ?? defaultParams.perspectiveCorrection,
    outputCroppedImage: params?.outputCroppedImage ?? defaultParams.outputCroppedImage,
  };
}

function buildOutputKey(pageId: string, jobId: string) {
  return `edge-detection/${pageId}/${jobId}.jpg`;
}

function readParams(metadata: unknown): EdgeDetectionParams {
  const object = readMetadataObject(metadata);
  const params = object.params;

  if (!params || typeof params !== 'object') {
    return defaultParams;
  }

  return normalizeParams(params as Partial<EdgeDetectionParams>);
}

function readMetadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
}
