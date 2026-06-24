import { describe, expect, it } from 'vitest';
import { EnhancementPipelineError, EnhancementService } from './enhancementService';
import type {
  CompleteEnhancementJobInput,
  CreateEnhancementJobInput,
  EnhancementJobRecord,
  EnhancementPageTarget,
  EnhancementProvider,
  EnhancementRepository,
  FailEnhancementJobInput,
} from './types';

class InMemoryEnhancementRepository implements EnhancementRepository {
  jobs: EnhancementJobRecord[] = [];
  completedInput: CompleteEnhancementJobInput | null = null;
  failedInput: FailEnhancementJobInput | null = null;
  pageEnhancedImageUrl: string | null = null;

  constructor(private readonly page: EnhancementPageTarget | null) {}

  async findPageTarget() {
    return this.page;
  }

  async findActiveJobForPage(pageId: string) {
    return (
      this.jobs.find((job) => job.pageId === pageId && (job.status === 'PENDING' || job.status === 'PROCESSING')) ??
      null
    );
  }

  async createJob(input: CreateEnhancementJobInput) {
    const job: EnhancementJobRecord = {
      id: `enhancement_job_${this.jobs.length + 1}`,
      pageId: input.pageId,
      status: 'PENDING',
      provider: input.provider,
      originalImageUrl: input.originalImageUrl,
      enhancedImageUrl: null,
      errorMessage: null,
      metadata: input.metadata,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    this.jobs.push(job);
    return job;
  }

  async getJob(jobId: string) {
    return this.jobs.find((job) => job.id === jobId) ?? null;
  }

  async findPendingJobs(limit: number) {
    return this.jobs.filter((job) => job.status === 'PENDING').slice(0, limit);
  }

  async claimPendingJob(jobId: string) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status !== 'PENDING') {
      return null;
    }

    job.status = 'PROCESSING';
    return job;
  }

  async completeJob(input: CompleteEnhancementJobInput) {
    this.completedInput = input;
    this.pageEnhancedImageUrl = input.enhancedImageUrl;
    const job = this.mustGetJob(input.jobId);
    job.status = 'COMPLETED';
    job.enhancedImageUrl = input.enhancedImageUrl;
    job.metadata = input.metadata;
    return job;
  }

  async failJob(input: FailEnhancementJobInput) {
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

function createProvider(overrides: Partial<EnhancementProvider> = {}): EnhancementProvider {
  return {
    name: 'SHARP',
    async enhance() {
      return {
        enhancedImageUrl: 'C:\\tmp\\docscanner-api\\enhancements\\page_1\\job.jpg',
        metadata: {
          provider: 'SHARP',
          outputQuality: 92,
          futureCapabilities: {
            deskewImplemented: false,
            perspectiveCorrectionImplemented: false,
          },
        },
      };
    },
    ...overrides,
  };
}

describe('EnhancementService', () => {
  it('creates a pending enhancement job for a page with an original image', async () => {
    const repository = new InMemoryEnhancementRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EnhancementService(repository, createProvider());

    const job = await service.createJob({
      documentId: 'doc_1',
      pageId: 'page_1',
      params: { mode: 'document', deskew: true },
    });

    expect(job.status).toBe('PENDING');
    expect(job.provider).toBe('SHARP');
    expect(job.originalImageUrl).toBe('C:\\tmp\\scan.jpg');
    expect(job.metadata).toMatchObject({
      sourceRole: 'ORIGINAL',
      params: {
        mode: 'document',
        deskew: true,
        perspectiveCorrection: false,
      },
    });
  });

  it('returns an existing pending or processing job for the same page', async () => {
    const repository = new InMemoryEnhancementRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EnhancementService(repository, createProvider());

    const first = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });
    const second = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });
    first.status = 'PROCESSING';
    const third = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(repository.jobs).toHaveLength(1);
  });

  it('claims and completes a pending job and updates page enhancedImageUrl', async () => {
    const repository = new InMemoryEnhancementRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EnhancementService(repository, createProvider());
    const pending = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });

    const completed = await service.processJob(pending.id);

    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.enhancedImageUrl).toContain('enhancements');
    expect(repository.pageEnhancedImageUrl).toBe(completed?.enhancedImageUrl);
    expect(repository.completedInput?.metadata).toMatchObject({
      result: {
        provider: 'SHARP',
        outputQuality: 92,
      },
    });
  });

  it('marks a claimed job failed with an explicit provider error message', async () => {
    const repository = new InMemoryEnhancementRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EnhancementService(
      repository,
      createProvider({
        async enhance() {
          throw new Error('sharp could not decode image');
        },
      }),
    );
    const pending = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });

    const failed = await service.processJob(pending.id);

    expect(failed?.status).toBe('FAILED');
    expect(failed?.errorMessage).toBe('sharp could not decode image');
    expect(repository.failedInput?.errorMessage).toBe('sharp could not decode image');
  });

  it('does not process a job that cannot be atomically claimed', async () => {
    const repository = new InMemoryEnhancementRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new EnhancementService(repository, createProvider());
    const pending = await service.createJob({ documentId: 'doc_1', pageId: 'page_1' });
    await service.processJob(pending.id);

    const secondAttempt = await service.processJob(pending.id);

    expect(secondAttempt).toBeNull();
  });

  it('returns 404 when an enhancement job is missing', async () => {
    const repository = new InMemoryEnhancementRepository(null);
    const service = new EnhancementService(repository, createProvider());

    await expect(service.getJob('missing')).rejects.toMatchObject({
      code: 'ENHANCEMENT_JOB_NOT_FOUND',
      statusCode: 404,
    });
  });
});
