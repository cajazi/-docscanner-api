import { describe, expect, it } from 'vitest';
import { EdgeDetectionPipelineError, EdgeDetectionService } from './edgeDetectionService';
import type { EdgeDetectionProvider } from './providers/edgeDetectionProvider';
import type {
  CompleteEdgeDetectionJobInput,
  CreateEdgeDetectionJobRecordInput,
  EdgeDetectionJobResponse,
  EdgeDetectionPageTarget,
  EdgeDetectionRepository,
  FailEdgeDetectionJobInput,
} from './types';

const fullPageCorners = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};

class InMemoryEdgeDetectionRepository implements EdgeDetectionRepository {
  jobs: EdgeDetectionJobResponse[] = [];
  completedInput: CompleteEdgeDetectionJobInput | null = null;
  failedInput: FailEdgeDetectionJobInput | null = null;
  pageCroppedImageUrl: string | null = null;

  constructor(private readonly page: EdgeDetectionPageTarget | null) {}

  async create(input: CreateEdgeDetectionJobRecordInput) {
    const job: EdgeDetectionJobResponse = {
      id: `edge_job_${this.jobs.length + 1}`,
      pageId: input.pageId,
      status: 'PENDING',
      provider: input.provider,
      sourceImageUrl: input.sourceImageUrl,
      croppedImageUrl: null,
      corners: null,
      confidence: null,
      errorMessage: null,
      metadata: input.metadata,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    this.jobs.push(job);
    return job;
  }

  async findById(jobId: string) {
    return this.jobs.find((job) => job.id === jobId) ?? null;
  }

  async findActiveByPageId(pageId: string) {
    return (
      this.jobs.find((job) => job.pageId === pageId && (job.status === 'PENDING' || job.status === 'PROCESSING')) ??
      null
    );
  }

  async findPendingJobs(limit: number) {
    return this.jobs.filter((job) => job.status === 'PENDING').slice(0, limit);
  }

  async findPageTarget() {
    return this.page;
  }

  async claimJob(jobId: string) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status !== 'PENDING') {
      return null;
    }

    job.status = 'PROCESSING';
    return job;
  }

  async markCompleted(input: CompleteEdgeDetectionJobInput) {
    this.completedInput = input;
    const job = this.mustGetJob(input.jobId);
    job.status = 'COMPLETED';
    job.corners = input.corners;
    job.confidence = input.confidence;
    job.croppedImageUrl = input.croppedImageUrl ?? null;
    job.metadata = input.metadata;
    if (input.croppedImageUrl) {
      this.pageCroppedImageUrl = input.croppedImageUrl;
    }
    return job;
  }

  async markFailed(input: FailEdgeDetectionJobInput) {
    this.failedInput = input;
    const job = this.mustGetJob(input.jobId);
    job.status = 'FAILED';
    job.errorMessage = input.errorMessage;
    job.metadata = input.metadata ?? job.metadata;
    return job;
  }

  private mustGetJob(jobId: string) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      throw new Error(`Job ${jobId} was not found`);
    }
    return job;
  }
}

function createProvider(overrides: Partial<EdgeDetectionProvider> = {}): EdgeDetectionProvider {
  return {
    name: 'heuristic',
    async detectAndCorrect() {
      return {
        corners: fullPageCorners,
        confidence: 0.5,
        croppedImageUrl: 'C:\\tmp\\edge-detection\\page_1\\edge_job_1.jpg',
        metadata: {
          provider: 'heuristic',
          edgeDetectionMode: 'full-page-placeholder',
          perspectiveCorrectionImplemented: false,
        },
      };
    },
    ...overrides,
  };
}

describe('EdgeDetectionService', () => {
  it('creates an edge detection job using the original image by default', async () => {
    const repository = new InMemoryEdgeDetectionRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\original.jpg',
      croppedImageUrl: 'C:\\tmp\\previous-crop.jpg',
      enhancedImageUrl: 'C:\\tmp\\enhanced.jpg',
    });
    const service = new EdgeDetectionService(repository, createProvider());

    const job = await service.createJob({
      documentId: 'doc_1',
      pageId: 'page_1',
      params: { perspectiveCorrection: true },
    });

    expect(job.status).toBe('PENDING');
    expect(job.provider).toBe('heuristic');
    expect(job.sourceImageUrl).toBe('C:\\tmp\\original.jpg');
    expect(job.metadata).toMatchObject({
      params: { perspectiveCorrection: true, outputCroppedImage: true },
      sourceSelection: 'originalImageUrl',
      croppedSourceAvoidedByDefault: true,
    });
  });

  it('falls back to enhanced image only when original is missing', async () => {
    const repository = new InMemoryEdgeDetectionRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: null,
      croppedImageUrl: null,
      enhancedImageUrl: 'C:\\tmp\\enhanced.jpg',
    });
    const service = new EdgeDetectionService(repository, createProvider());

    const job = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });

    expect(job.sourceImageUrl).toBe('C:\\tmp\\enhanced.jpg');
    expect(job.metadata).toMatchObject({ sourceSelection: 'enhancedImageUrl' });
  });

  it('returns an existing pending or processing job for the same page', async () => {
    const repository = new InMemoryEdgeDetectionRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\original.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EdgeDetectionService(repository, createProvider());

    const first = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });
    const second = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });
    first.status = 'PROCESSING';
    const third = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(repository.jobs).toHaveLength(1);
  });

  it('stores corners and updates DocumentPage croppedImageUrl on success', async () => {
    const repository = new InMemoryEdgeDetectionRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\original.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EdgeDetectionService(repository, createProvider());
    const pending = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });

    const completed = await service.processJob(pending.id);

    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.corners).toEqual(fullPageCorners);
    expect(completed?.confidence).toBe(0.5);
    expect(repository.pageCroppedImageUrl).toBe(completed?.croppedImageUrl);
    expect(repository.completedInput?.metadata).toMatchObject({
      result: {
        edgeDetectionMode: 'full-page-placeholder',
        perspectiveCorrectionImplemented: false,
      },
    });
  });

  it('marks failed with provider error without throwing from processor path', async () => {
    const repository = new InMemoryEdgeDetectionRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\original.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EdgeDetectionService(
      repository,
      createProvider({
        async detectAndCorrect() {
          throw new Error('source image could not be decoded');
        },
      }),
    );
    const pending = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });

    const failed = await service.processJob(pending.id);

    expect(failed?.status).toBe('FAILED');
    expect(failed?.errorMessage).toBe('source image could not be decoded');
    expect(repository.failedInput?.errorMessage).toBe('source image could not be decoded');
  });

  it('does not process a job that cannot be atomically claimed', async () => {
    const repository = new InMemoryEdgeDetectionRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\original.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EdgeDetectionService(repository, createProvider());
    const pending = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });
    await service.processJob(pending.id);

    const secondAttempt = await service.processJob(pending.id);

    expect(secondAttempt).toBeNull();
  });

  it('returns 404 when an edge detection job is missing', async () => {
    const repository = new InMemoryEdgeDetectionRepository(null);
    const service = new EdgeDetectionService(repository, createProvider());

    await expect(service.getJob('missing')).rejects.toMatchObject({
      code: 'EDGE_DETECTION_JOB_NOT_FOUND',
      statusCode: 404,
    });
  });
});
